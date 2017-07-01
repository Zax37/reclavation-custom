const http = require("http");
const path = require("path");
const express = require("express");
const logger = require("morgan");
const bodyParser = require("body-parser");
const less = require('less');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require("cookie-parser");
const fileUpload = require('express-fileupload');
const ExpressPermissions = require('express-permissions');
const moment = require('moment');
const sqlite3 = require('sqlite3').verbose();

var db = new sqlite3.Database('Reclavation.sqlite');
var users = [];
db.serialize(function() {
    var sql = "SELECT name, email, password, role, description FROM users;";
    db.all(sql, function(err, rows) {
        if (err !== null) {
            console.log("An error has occurred -- " + err);
        } else {
            for(r in rows){
                users[rows[r].name] = rows[r];
            }
        }
    });
});

function generate(length) {
    var founded = false,
        _sym = 'abcdefghijklmnopqrstuvwxyz1234567890',
        str = '';
    //while(!founded) {
    for(var i = 0; i < length; i++) {
        str += _sym[parseInt(Math.random() * (_sym.length))];
    }

    //}
    return str;
}

function getLastNumber(v) {
    return parseInt(v.match(/[0-9]+(?!.*[0-9])/));
}

function getString64FromBuffer(buf, pos){
    var ret = buf.slice(pos, pos+64).toString();
    return ret.replace(/\0/g, '');
}

function status(req, res,  code, message) {
    res.status(code).end(message);
}

var app = express();
app.use(require('express-session')({secret: generate(32)}));
app.use(cookieParser());
app.use(require('flash')());

var session;
function getLevel(id, remove){
    for(var level in levels){
        if(levels[level].id == id){
            if(remove) return levels.splice(level);
            else return levels[level];
        }
    }
    return null;
}
var logged_in = [];
app.locals.logged_in = logged_in;

function unlog(name){
    for(var u in logged_in){
        if(logged_in[u].name == name) {
            logged_in.splice(u, 1);
            return;
        }
    }
}

var roles = JSON.parse(fs.readFileSync('./data/roles.json'));
var styles = {};
var strings = {};

app.use(logger("dev"));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } }));
app.use('/img', express.static('img'));
app.use('/js', express.static('js'));
app.use('/screens', express.static('screens'));
app.set("views", path.resolve(__dirname, "views"));
app.set("view engine", "pug");

app.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));

const baseLevelsCount = 14;
app.locals.baseLevelsCount = baseLevelsCount;

function writeStyle(res, style){
    res.setHeader('content-type', 'text/css');
    res.write(style);
    res.end();
}

app.use("/style/*", function(req, res){
    var path = 'styles/'+req.params[0]+'.less';
    if(styles[req.params[0]]) {
        writeStyle(res, styles[req.params[0]]);
    } else fs.access(path, function(err) {
            if (err) {
                path = 'styles/'+req.params[0]+'.css';
                fs.access(path, function(err) {
                    if(err) status(req, res,  404, strings.errors.page_not_found, '/');
                    else {
                        var style = fs.readFileSync(path).toString();
                        styles[req.params[0]] = style;
                        writeStyle(res, style);
                    }
                });
            } else {
                var style = fs.readFileSync(path).toString();
                less.render(style, function (e, output) {
                    if(e){
                        status(req, res,  400, e, '/');
                        return;
                    }
                    styles[req.params[0]] = output.css;
                    writeStyle(res, output.css);
                });
            }
    });
});

app.get('/template/:name', function(req, res) {
    res.render(req.params.name);
});

const commentsPerPage = 5;
app.get('/levels.json', function(req, res){
    db.serialize(function() {
        var sql = "SELECT * FROM levels";
        if(req.query.id) sql += " WHERE id=?";
        else if(req.query.user) sql += " WHERE uploader=?";
        sql += " ORDER BY id ASC";
        db.all(sql, [req.query.user?req.query.user:req.query.id], function(err, rows) {
            if (err !== null) {
                console.log("An error has occurred -- " + err);
            } else {
                levels = rows;
                if(res) {
                    if(req.query.id) {
                        if(!req.query.page) req.query.page = 1;
                        sql = "SELECT id, date, author, text, avatar FROM comments LEFT JOIN users "
                        + "ON comments.author = users.name WHERE targetType='level' AND targetId=? "
                        + "ORDER BY id DESC LIMIT ? OFFSET ?";
                        db.all(sql, [req.query.id, commentsPerPage, (req.query.page-1)*commentsPerPage], function(err, rows) {
                            if (err !== null) {
                                console.log("An error has occurred -- " + err);
                            } else {
                                levels[0].comments = rows;
                                sql = "SELECT COUNT(*) AS count FROM comments WHERE targetType='level' AND targetId=?";
                                db.all(sql, [req.query.id], function(err, rows) {
                                    if (err !== null) {
                                        console.log("An error has occurred -- " + err);
                                    } else {
                                        levels[0].commentsCount = rows[0].count;
                                        levels[0].commentsPerPage = commentsPerPage;
                                        sql = "SELECT sum(value = 0) AS tomatoes, sum(value) AS stars, avg(value) AS avg FROM ratings WHERE level=?";
                                        db.all(sql, [req.query.id], function(err, rows) {
                                            if (err !== null) {
                                                console.log("An error has occurred -- " + err);
                                            } else {
                                                levels[0].ratings = rows[0];
                                                return res.send(levels[0]);
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    } else {
                        sql = "SELECT level, sum(value = 0) AS tomatoes, sum(value) AS stars, avg(value) AS avg FROM ratings";
                        if(req.query.user) sql += " INNER JOIN levels ON level=levels.id WHERE levels.uploader=?";
                        sql += " GROUP BY level ORDER BY level ASC";
                        db.all(sql, [req.query.user], function(err, rows) {
                            if (err !== null) {
                                console.log("An error has occurred -- " + err);
                            } else {
                                var l = 0; var ratingsTemplate = { tomatoes: 0, stars: 0, avg: 0 };
                                for(r in rows) {
                                    while(levels[l].id != rows[r].level)
                                        levels[l++].ratings = ratingsTemplate;
                                    delete rows[r].level;
                                    levels[l++].ratings = rows[r];
                                }
                                while(l<levels.length)
                                    levels[l++].ratings = ratingsTemplate;
                                return res.send(levels);
                            }
                        });
                    }
                }
            }
        });
    });
});

app.get('/comments.json', function(req, res) {
    db.serialize(function () {
        if(!req.query.page) req.query.page = 1;
        var sql = "SELECT id, date, author, text, "
            + (req.query.user?"'/./' || targetType || '/' || targetId AS targetURL, ":"")
            + "avatar FROM comments LEFT JOIN users "
            + "ON comments.author = users.name WHERE targetType='level' AND "
            + (req.query.user?"author=? ":"targetId=? ")
            + "ORDER BY id DESC LIMIT ? OFFSET ?";
        db.all(sql, [req.query.user?req.query.user:req.query.id, commentsPerPage, (req.query.page-1)*commentsPerPage], function(err, rows) {
            if (err !== null) {
                console.log("An error has occurred -- " + err);
            } else {
                return res.send(rows);
            }
        });
    });
});

app.get('/users.json', function(req, res) {
    db.serialize(function () {
        var sql = "SELECT * FROM users";
        if(req.query.id) sql += " WHERE name=? LIMIT 1";
        db.all(sql, [req.query.id], function(err, rows) {
            if (err !== null) {
                console.log("An error has occurred -- " + err);
            } else {
                if(req.query.id){
                    var user = rows[0];
                    sql = "SELECT COUNT(*) AS count FROM comments WHERE author=?";
                    db.all(sql, [req.query.id], function(err, rows) {
                        if (err !== null) {
                            console.log("An error has occurred -- " + err);
                        } else {
                            user.commentsCount = rows[0].count;
                            user.commentsPerPage = commentsPerPage;
                            sql = "SELECT id, date, author, text, '/./' || targetType || '/' || targetId AS targetURL, ? AS avatar"
                                + " FROM comments WHERE author = ? ORDER BY id DESC LIMIT ?";
                            db.all(sql, [user.avatar, req.query.id, commentsPerPage], function(err, rows) {
                                if (err !== null) {
                                    console.log("An error has occurred -- " + err);
                                } else {
                                    user.comments = rows;
                                    return res.send(user);
                                }
                            });
                        }
                    });
                } else {
                    return res.send(rows);
                }
            }
        });
    });
});

app.all("*", function(req, res, next) {
    //getCookies(req, res);
    session = req.session;
    var lang = req.query.lang || req.cookies.lang || "en";
    if(lang != req.cookies.lang) res.cookie("lang", lang);
    app.locals.lang = lang;

    strings = JSON.parse(fs.readFileSync('./lang/'+lang+'.json'));
    strings.pageTitle = "Reclavation's Customs";

    app.locals.login = null;
    if(req.cookies.login){
        if(!users[req.cookies.login] || users[req.cookies.login].session != req.cookies.session) {
            res.clearCookie('login');
            res.clearCookie('email');
            res.clearCookie('session');
        } else {
            app.locals.login = req.cookies.login;
            unlog(req.cookies.login);
            logged_in.push({
               name: req.cookies.login,
               expiration: moment().add(5, 'minutes')
            });
        }
    }

    var late = 0;
    while(late<logged_in.length && logged_in[late].expiration <= moment()) late++;

    logged_in.splice(0, late);

    if(!app.locals.login) {
        session.role = "unauthorized";
    } else {
        session.role = users[app.locals.login].role || "unauthorized";
    }
    app.locals.role = session.role;
    app.locals.strings = strings;
    next();
});

app.get('/strings', function(req, res) {
    return res.send(strings);
});

roles["user"] = roles["user"].concat(roles["unauthorized"]);
roles["admin"] = roles["admin"].concat(roles["user"]);
app.use(ExpressPermissions.middleware());
var paths = [];
for(var role in roles){
    for(var p in roles[role]) {
        var p = roles[role][p];
        if (paths[p]) paths[p].push(role);
        else paths[p] = [role];
    }
}

for(var p in paths) {
    (function(path){
        ExpressPermissions.add(app, path, function(req, res){
            for(perm in paths[path]){
                if(session.role == paths[path][perm]) return true;
                if(paths[path][perm] == "specific_user"
                && req.cookies.login == req.params.id) return true;
                if(paths[path][perm] == "level_uploader"
                && req.cookies.login == getLevel(req.params.id).uploader) return true;
                if(paths[path][perm] == "comment_author"
                && req.cookies.login == getLevel(req.params.id).comments[req.params.cid].author) return true;
            }
            return false;
        });
    })(p);
}

app.get("/", function(req, res){
    res.render("index");
});

app.get("/level/:id", function(req, res){
    res.render("index");
});

app.get("/users", function(req, res){
    res.render("index");
});

app.get("/user/:id", function(req, res){
    res.render("index");
});

app.get("/user/:id/comments", function(req, res){
    res.render("index");
});

app.post("/login", function(req, res) {
    if (!req.body.login || !req.body.password) {
        status(req, res,  400, strings.errors.required_fields_not_filled);
    } else if(!users[req.body.login]){
        status(req, res,  400, strings.errors.user_does_not_exist);
    } else {
        var user = users[req.body.login];
        var hash = crypto.createHash('md5').update(req.body.password).digest('hex');
        if (user.password != hash) {
            status(req, res,  401, strings.errors.incorrect_password);
            return;
        }
        user.session = generate(32);
        res.cookie("login", req.body.login);
        res.cookie("email", user.email);
        res.cookie("session", user.session);
        status(req, res,  200, strings.success.logged_in);
    }
});

app.post("/register", function(req, res) {
    if (!req.body.login || !req.body.email || !req.body.password) {
        status(req, res,  400, strings.errors.required_fields_not_filled);
    } else if(users[req.body.login]){
        status(req, res,  400, strings.errors.user_already_exists);
    } else {
        var hash = crypto.createHash('md5').update(req.body.password).digest('hex');
        db.run("INSERT INTO users VALUES ($name, $email, $avatar, $password, $role, '')",
            {
                $name: req.body.login,
                $email: req.body.email,
                $avatar: crypto.createHash('md5').update(req.body.email).digest('hex'),
                $password: hash,
                $role: "user"
            }, function (error) {
                if(error) status(req, res,  400, error.toString());
                else {
                    users[req.body.login] = { email: req.body.email, password: hash, role: "user" };
                    status(req, res,  201, strings.success.account_created);
                }
            });
    }
});

app.post("/logout", function(req, res){
    if (!req.cookies.login) {
        status(req, res,  400, strings.errors.not_logged_in);
        return;
    }
    unlog(req.cookies.login);
    res.clearCookie('login');
    res.clearCookie('email');
    res.clearCookie('session');
    status(req, res,  200, strings.success.logged_out);
});

app.post('/rate/:id', function(req, res){
    if(req.body.value == null){
        status(req, res, 400, strings.errors.required_fields_not_filled);
        return;
    }
    var lev;
    if(lev = getLevel(req.params.id)){
        if(lev.uploader == req.cookies.login){
            status(req, res, 400, strings.errors.cant_rate_own_level);
        } else {
            db.run("INSERT OR REPLACE INTO ratings VALUES ($level, $reviewer, $value)",
                {
                    $level: req.params.id,
                    $reviewer: req.cookies.login,
                    $value: req.body.value
                }, function (error) {
                    if(error) status(req, res,  400, error.toString());
                    else {
                        sql = "SELECT sum(value = 0) AS tomatoes, sum(value) AS stars, avg(value) AS avg FROM ratings WHERE level=?";
                        db.all(sql, [req.params.id], function(err, rows) {
                            if (err !== null) {
                                console.log("An error has occurred -- " + err);
                            } else status(req, res,  201, JSON.stringify(rows[0]));
                        });
                    }
                });
        }
    } else {
        status(req, res, 400, strings.errors.level_does_not_exist);
    }
});

app.get('/level/:id/download', function(req, res){
    var lev;
    if(lev = getLevel(req.params.id)){
        var file = fs.readFileSync("maps/"+lev.id+".wwd");
        res.writeHead(200, {
            "Content-Disposition": "attachment;filename=" + lev.name+".wwd",
            'Content-Type': 'application/octet-stream',
            'Content-Length': lev.size
        });
        res.write(file);
    } else {
        status(req, res, 400, strings.errors.level_does_not_exist, '/');
    }
});

app.put('/level/:id', function(req, res){
    if(req.body.description == null){
        status(req, res, 400, strings.errors.required_fields_not_filled);
        return;
    }
    var lev;
    if(lev = getLevel(req.params.id, true)){
        db.run("UPDATE levels SET description=$desc WHERE id=$id",
            {
                $id: req.params.id,
                $desc: req.body.description
            }, function (error) {
                if(error) status(req, res,  400, error.toString());
                else status(req, res,  200, strings.success.description_updated);
            });
    } else {
        status(req, res, 400, strings.errors.level_does_not_exist);
    }
});

app.delete('/level/:id', function(req, res){
    var lev;
    if(lev = getLevel(req.params.id, true)){
        try {
            fs.unlinkSync("maps/"+lev[0].id+".wwd");
        } catch (e) {
            console.log(e);
        }
        try {
            fs.unlinkSync("screens/" + lev[0].id + lev[0].thumbnailExt);
        } catch (e) {
            console.log(e);
        }
        db.run("DELETE FROM levels WHERE id=$0",
            [ req.params.id ], function (error) {
                if(error) status(req, res,  400, error.toString());
                else status(req, res,  200, strings.success.level_removed);
            });
    } else {
        status(req, res, 400, strings.errors.level_does_not_exist);
    }
});

app.post('/upload', function(req, res){
    if (!req.files || !req.files.map || !req.files.thumbnail) {
        status(req, res,  400, strings.errors.required_fields_not_filled);
    } else {
        var map = req.files.map.data;
        if(map.readInt32LE(0) != 1524){
            status(req, res,  400, strings.errors.incorrect_file_type);
        } else if(map.readInt32LE(8) & 2 != 2) {
            status(req, res,  400, strings.errors.uncompressed_map);
        } else {
            var levelData = {};
            levelData.name = req.files.map.name.slice(0, -4);
            levelData.baseLevel = getLastNumber(getString64FromBuffer(map, 16));
            if(!levelData.baseLevel || levelData.baseLevel<1 || levelData.baseLevel>baseLevelsCount){
                status(req, res,  400, strings.errors.incorrect_file_type);
            } else {
                levelData.author = getString64FromBuffer(map, 80);
                levelData.uploader = app.locals.login;
                levelData.dateCreated = getString64FromBuffer(map, 144);
                //fix for dates in format hh:mm DD.MM.YYYY
                var datefix = levelData.dateCreated.match(/^(\d{2}):(\d{2}) (\d{2}).(\d{2}).(\d{4})$/);
                if(Array.isArray(datefix) && datefix.length==6){
                    levelData.dateCreated = datefix[5]+'-'+datefix[4]+'-'+datefix[3]+' '+datefix[1]+':'+datefix[2];
                }
                var id;
                do {
                    id = generate(32);
                } while(getLevel(id)!=null);
                levelData.id = id;
                levelData.gameVersion = 'claw';
                levelData.thumbnailExt = req.files.thumbnail.name.slice(-4);
                req.files.thumbnail.mv('screens/'+id+levelData.thumbnailExt, function(error){
                    if(error) console.log(error);
                    else req.files.map.mv('maps/'+id+'.wwd', function(error){
                        if(error) console.log(error);
                        else {
                            levelData.size = fs.statSync("maps/"+id+".wwd").size;
                            var levelDataForUpload = {};
                            for(var key in levelData) {
                                if(levelData.hasOwnProperty(key)) {
                                    levelDataForUpload['$'+key] = levelData[key];
                                }
                            }
                            levelData.dateCreated = moment(levelData.dateCreated);
                            levelData.dateUploaded = moment();
                            db.run("INSERT INTO levels VALUES ($id, $baseLevel, $author, $uploader, $dateCreated, CURRENT_TIMESTAMP, $thumbnailExt, $size, '', $gameVersion, $name)",
                            levelDataForUpload, function (error) {
                                if(error) status(req, res,  400, error.toString());
                                else status(req, res,  201, JSON.stringify(levelData));
                            });
                        }
                    });
                });
            }
        }
    }
});

app.post("/comment", function(req, res) {
    var lev;
    if(lev = getLevel(req.body.index)){
        if (!req.body.text) {
            status(req, res, 400, strings.errors.required_fields_not_filled);
        } else {
            var comment = {
                text: req.body.text,
                date: moment(),
                author: app.locals.login,
                avatar: crypto.createHash('md5').update(users[app.locals.login].email).digest('hex')
            };
            db.run("INSERT INTO comments VALUES (null, $targetType, $targetId, $date, $author, $text)",
                {
                    $targetType: 'level',
                    $targetId: req.body.index,
                    $date: comment.date.format(),
                    $author: comment.author,
                    $text: comment.text
                }, function (error) {
                    if(error) status(req, res,  400, error.toString());
                    else {
                        comment.id = this.lastID;
                        status(req, res, 200, JSON.stringify(comment));
                    }
                });
        }
    } else {
        status(req, res, 400, strings.errors.level_does_not_exist);
    }
});

app.put('/comment', function(req, res){
    if(req.body.text == null){
        status(req, res, 400, strings.errors.required_fields_not_filled);
        return;
    }
    if(req.body.id){
        db.run("UPDATE comments SET text=$text WHERE id=$id",
            {
                $id: req.body.id,
                $text: req.body.text
            }, function (error) {
                if(error) status(req, res,  400, error.toString());
                else status(req, res,  200, strings.success.comment_updated);
            });
    } else {
        status(req, res, 400, strings.errors.level_does_not_exist);
    }
});

app.delete("/comment", function(req, res) {
    if (!req.body.id) {
        status(req, res, 400, strings.errors.comment_does_not_exist);
    } else {
        db.run("DELETE FROM comments WHERE id=?", [ req.body.id ], function (error) {
                if(error) status(req, res,  400, error.toString());
                else status(req, res, 200, strings.success.comment_removed);
            });
    }
});

/*app.post('/level/:id/comment/:cid/edit', function(req, res) {
    var lev;
    if (lev = getLevel(req.params.id)) {
        if (!req.params.cid || !lev.comments[req.params.cid]) {
            status(req, res, 400, strings.errors.comment_does_not_exist, '/level/' + lev.id);
        } else {
            lev.comments[req.params.cid].text = req.body.text;
            fs.writeFileSync('./data/levels.json', JSON.stringify(``));
            status(req, res, 200, strings.success.comment_updated, '/level/' + lev.id);
        }
    } else {
        status(req, res, 400, strings.errors.level_does_not_exist, '/');
    }
});*/

app.permissionDenied = function(req, res) {
    if(!session.role || session.role=="unauthorized")
        status(req, res,  401, strings.errors.only_for_logged_in);
    else status(req, res,  403, strings.errors.permission_denied);
};

app.use(function(req, res) {
  status(req, res,  404, strings.errors.page_not_found);
});

http.createServer(app).listen(3000, function() {
    console.log("App started.");
});
