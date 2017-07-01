function getCookie(cname) {
    var name = cname + "=";
    var ca = document.cookie.split(';');
    for(var i=0; i<ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1);
        if (c.indexOf(name) != -1) return c.substring(name.length,c.length);
    }
    return "";
}

function formatSize(size){
    if(size<1024) return size+'B';
    else {
        size /= 1024;
        if(size<1024) return size.toFixed(2)+'kB';
        else{
            size /= 1024;
            return size.toFixed(2)+'MB';
        }
    }
}

function makeRatings() {
    $('.rating-container').each(function(){
        var rating = new Rating({
            _id: $(this).attr("id"),
            field: $(this),
            onSelect: function(target){
                $(target).parent().parent().submit();
            },
            defaultRating: $(this).attr("value")
        });
    });
}

var currentView;

angular.module('Reclavation', ['ui.bootstrap-slider', 'ngRoute', 'ngAnimate', 'infinite-scroll'])
    .config(['$routeProvider', '$locationProvider',
        function($routeProvider, $locationProvider) {
            $routeProvider.when('/', {
                controller: 'LevelsGridController',
                templateUrl: '/template/levels'
            }).when('/level/:levelId', {
                controller: 'LevelController',
                templateUrl: '/template/level'
            }).when('/users', {
                controller: 'UsersController',
                templateUrl: '/template/users'
            }).when('/user/:id', {
                controller: 'UserController',
                templateUrl: '/template/user'
            }).when('/user/:id/:target', {
                controller: 'UserController',
                templateUrl: '/template/user'
            });
            $locationProvider.html5Mode({
                enabled: true,
                requireBase: false
            });
    }]).filter('floor', function(){
        return function(n){
            return Math.floor(n);
        };
    }).filter('ceil', function(){
        return function(n){
            return Math.ceil(n);
        };
    }).filter('slice', function() {
        return function(arr, start, amount) {
            return arr.slice(start, start+amount);
        };
    }).directive('ngBackground', function(){
        return function(scope, element, attrs){
            var url = attrs.ngBackground;
            element.css({
                'background-image': 'url(' + url +')',
                'background-size' : 'cover'
            });
        };
    }).directive('fileInput', function(){
        return function(scope, element, attrs){
            $(element).fileinput({
                'showUpload': false, 'showRemove': false,
                'allowedFileExtensions': attrs.fileInput.split(" "),
                'showPreview': false, 'browseClass': 'btn btn-danger'
            });
        };
    }).controller('MainController', function($scope, $rootScope, $http) {
        $rootScope.user = getCookie("login");
        $scope.standardDateFormat = 'yyyy-MM-dd HH:mm';

        $scope.getStrings = function(lang) {
            $http.get('/strings'+(lang?'?lang='+lang:''))
                .then(function(res){
                    $rootScope.strings = res.data;
                    $rootScope.lang = getCookie("lang");
                });
        };
        $scope.getStrings();

        $scope.formSubmit = function(target, e) {
            var settings = {
                method  : 'POST',
                url     : '/'+target
            };
            if(target=='upload'){
                settings.data = new FormData(e.target);
                settings.contentType = false;
                settings.processData = false;
            } else {
                settings.data = $scope[target+'Form']?$.param($scope[target+'Form']):null;
            }
            $.ajax(settings).done(function(data) {
                if(target=='upload') {
                    if(currentView.levels)
                        currentView.levels.push(JSON.parse(data));
                    $scope.messages = [{ type: 'success', text: $scope.strings.success.level_uploaded }];
                } else {
                    $scope.messages = [{ type: 'success', text: data }];
                }
                if(target=='login') {
                    $rootScope.user = getCookie("login");
                } else if(target=='logout') {
                    $rootScope.user = null;
                }
                $scope.$apply();
                currentView.$apply();
            }).fail(function(data) {
                $scope.messages = [{ type: 'danger', text: data.responseText }];
                if(target=='logout') {
                    $rootScope.user = null;
                }
                $scope.$apply();
            });
        };

        $scope.sizeFormatter = function(value) {
            if(!value) return;
            else if(value.length == 2) {
                return formatSize(value[0])+ " - " +formatSize(value[1]);
            } else return formatSize(value);
        };

        $scope.range = function(min, max, step) {
            step = step || 1;
            var input = [];
            for (var i = min; i <= max; i += step) {
                input.push(i);
            }
            return input;
        };
    }).controller('UsersController', function($scope, $rootScope, $location, $http, $routeParams) {
        currentView = $scope;

        $http.get('/users.json')
        .then(function(res){
            $scope.users = res.data;
        });

        $scope.showUser = function(name) {
            $location.path('./user/'+name);
        }

        $scope.sortBy = function (method) {
            if($scope.sort == method) {
                $scope.asc = !$scope.asc;
            } else {
                $scope.sort = method;
                $scope.asc = true;
            }
        }
    }).controller('UserController', function($scope, $rootScope, $location, $http, $routeParams, $timeout) {
        currentView = $scope;
        $scope.target = $routeParams.target;
        $scope.commentsPage = 1;
        $scope.levelsPage = 1;

        $scope.loadMore = function(){
            $scope.levelsBeingLoaded = true;
            $scope.shownLevelsCount += 5;

            $timeout(function(){
                $scope.levelsBeingLoaded = false;
            });
        }

        $scope.levels = $rootScope.levels ? $rootScope.levels.filter(function(level){
            return level.uploader == $routeParams.id;
        }) : [];

        $http.get('/users.json?id='+$routeParams.id)
        .then(function(res){
            $scope.user = res.data;
            if(res.data.comments) {
                $scope.comments = $scope.user.comments;
                $scope.commentsCount = $scope.user.commentsCount;
                $scope.commentsPerPage = $scope.user.commentsPerPage;
            }

            $http.get('/levels.json?user='+$routeParams.id)
            .then(function(res){
                $scope.levels = res.data;
            });
        });

        $scope.goToPage = function(n, lvl) {
            if(lvl){
                $scope.levelsPage = n;
            } else {
                $scope.commentsPage = n;
                $scope.comments = null;

                $http.get('/comments.json?user='+$scope.user.name+'&page='+n)
                    .then(function(res){
                        $scope.comments = res.data;
                    });
            }
        };
    }).controller('LevelController', function($scope, $rootScope, $location, $http, $routeParams, $timeout) {
        currentView = $scope;
        $scope.levelView = true;
        $scope.commentsPage = 1;
        $scope.targetId = $routeParams.levelId;

        if($rootScope.level) {
            $scope.level = $rootScope.level;

            $http.get('/levels.json?id='+$routeParams.levelId)
                .then(function(res){
                    $scope.level = res.data;
                    if(res.data.comments) {
                        $scope.comments = $scope.level.comments;
                        $scope.commentsCount = $scope.level.commentsCount;
                        $scope.commentsPerPage = $scope.level.commentsPerPage;
                        $timeout(function () {
                            $scope.rating.set($scope.level.ratings.avg);
                        });
                    }
                });

            $scope.goBack = function (){
                $location.path('/./');
            }
        } else {
            $http.get('/levels.json?id='+$routeParams.levelId)
                .then(function(res){
                    $scope.level = res.data;
                    if(res.data.comments) {
                        $scope.comments = $scope.level.comments;
                        $scope.commentsCount = $scope.level.commentsCount;
                        $scope.commentsPerPage = $scope.level.commentsPerPage;
                        $timeout(function () {
                            $scope.rating.set($scope.level.ratings.avg);
                        });
                    }
                });

            $scope.goBack = function (){
                $location.path('/./');
            }
        }

        $scope.applyLevelChanges = function () {
            $scope.levelEditMode = false;

            $.ajax({
                method  : 'PUT',
                url     : '/level/'+$scope.level.id,
                data    : $scope.level
            }).done(function(data) {
                $scope.$parent.messages = [{ type: 'success', text: $rootScope.strings.success.description_updated }];
                $scope.$parent.$apply();
            }).fail(function(data) {
                $scope.$parent.messages = [{ type: 'danger', text: data.responseText }];
                $scope.$parent.$apply();
            });
        }

        $scope.applyCommentChanges = function (id) {
            $.ajax({
                method  : 'PUT',
                url     : '/comment/',
                data    : { id, text: $('#newCommentText').val() }
            }).done(function(data) {
                $scope.$parent.messages = [{ type: 'success', text: $rootScope.strings.success.comment_updated }];
                $scope.$parent.$apply();
                $scope.commentEditMode = false;
                $scope.$apply();
            }).fail(function(data) {
                $scope.$parent.messages = [{ type: 'danger', text: data.responseText }];
                $scope.$parent.$apply();
            });
        }

        $scope.deleteComment = function(id) {
            console.log(id);
            var settings = {
                method  : 'DELETE',
                url     : '/comment',
                data    : { id }
            };
            $.ajax(settings).done(function(data) {
                $scope.$parent.messages = [{ type: 'success', text: $rootScope.strings.success.comment_removed }];
                $scope.$parent.$apply();
                $scope.goToPage($scope.commentsPage);
            }).fail(function(data) {
                $scope.$parent.messages = [{ type: 'danger', text: data.responseText }];
                $scope.$parent.$apply();
            });
        };

        $scope.deleteLevel = function() {
            var settings = {
                method  : 'DELETE',
                url     : '/level/'+$scope.level.id
            };
            $.ajax(settings).done(function(data) {
                for(var l in $scope.levels) {
                    if($scope.levels[l].id == $scope.level.id) $scope.levels.splice(l, 1);
                }
                $scope.$parent.messages = [{ type: 'success', text: $rootScope.strings.success.level_removed }];
                $scope.$parent.$apply(function(){
                    $location.path('/./');
                });
            }).fail(function(data) {
                $scope.$parent.messages = [{ type: 'danger', text: data.responseText }];
                $scope.$parent.$apply();
            });
        };

        $scope.rate = function(value, old) {
            var settings = {
                method  : 'POST',
                url     : '/rate/'+$scope.level.id,
                data    : { value }
            };
            $.ajax(settings).done(function(data) {
                $scope.$parent.messages = [{ type: 'success', text: $rootScope.strings.success.rated }];
                $scope.level.ratings = JSON.parse(data);
                $scope.rating.set($scope.level.ratings.avg);

                for(l in $rootScope.levels){
                    if($rootScope.levels[l].id == $scope.level.id) {
                        $rootScope.levels[l].ratings = $scope.level.ratings;
                        break;
                    }
                }

                $scope.$parent.$apply();
                $scope.$apply();

                if($scope.level.ratings.tomatoes > $rootScope.maxTomatoes)
                    $rootScope.maxTomatoes = $scope.level.ratings.tomatoes;
                if($scope.level.ratings.tomatoes < $rootScope.minTomatoes)
                    $rootScope.minTomatoes = $scope.level.ratings.tomatoes;
            }).fail(function(data) {
                $scope.$parent.messages = [{ type: 'danger', text: data.responseText }];
                $scope.rating.set(old);
                $scope.$parent.$apply();
                $scope.$apply();
            });
        };

        $timeout(function () {
            $scope.rating = new Rating({ field: $('.rating-container'), onSelect: $scope.rate });
        });

        $scope.goToPage = function(n) {
            $scope.commentsPage = n;
            $scope.comments = null;

            $http.get('/comments.json?id='+$scope.level.id+'&page='+n)
                .then(function(res){
                    $scope.comments = res.data;
                });
        };

        $scope.addComment = function($event) {
            $.ajax({
                method  : 'POST',
                url     : '/./comment',
                data    : $($event.target).serialize()
            }).done(function(data) {
                $scope.level.commentsCount++;
                if($scope.commentsPage == 1) {
                    $scope.comments.unshift(JSON.parse(data));
                    if($scope.comments.length > $scope.level.commentsPerPage)
                        $scope.comments.pop();
                } else {
                    $scope.goToPage(1)
                }
                $scope.$parent.messages = [{ type: 'success', text: $rootScope.strings.success.comment_added }];
                $scope.$parent.$apply();
            }).fail(function(data) {
                $scope.$parent.messages = [{ type: 'danger', text: data.responseText }];
                $scope.$parent.$apply();
            });
            $('#com_text').val('')
        }
    }).controller('LevelsGridController', function($scope, $rootScope, $location, $http, $timeout, $animate) {
        currentView = $scope;

        if($rootScope.levels) {
            $scope.levels = $rootScope.levels;
            $scope.shownLevelsCount = $rootScope.shownLevelsCount;
            $scope.sortMethod = $rootScope.sortMethod;
            $scope.view = $rootScope.view;
            $scope.search = $rootScope.search;
            $scope.layeredFilters = $rootScope.layeredFilters;
            $scope.levelsToLoadCount = $rootScope.levelsToLoadCount;

            $timeout(function(){
                window.scrollTo(0, $rootScope.scroll);
                $animate.enabled(false);
                $scope.filter.fileSize = $rootScope.flt.fileSize;
                $scope.filter.tomatoes = $rootScope.flt.tomatoes;
                $timeout(function() {
                    $animate.enabled(true);
                });
            });
        } else {
            $scope.levels = [];
            $scope.levelsToShow = 0;

            $http.get('/levels.json')
                .then(function (res) {
                    $scope.levels = res.data;
                    $scope.levelsToShow = $scope.levels.length;

                    $rootScope.lowestFileSize = res.data[0].size;
                    $rootScope.highestFileSize = res.data[0].size;
                    $rootScope.minTomatoes = res.data[0].ratings.tomatoes;
                    $rootScope.maxTomatoes = res.data[0].ratings.tomatoes;
                    for(var l in res.data) {
                        let level = res.data[l];
                        if(level.size > $rootScope.highestFileSize)
                            $rootScope.highestFileSize = level.size;
                        if(level.size < $rootScope.lowestFileSize)
                            $rootScope.lowestFileSize = level.size;
                        if(level.ratings.tomatoes > $rootScope.maxTomatoes)
                            $rootScope.maxTomatoes = level.ratings.tomatoes;
                        if(level.ratings.tomatoes < $rootScope.minTomatoes)
                            $rootScope.minTomatoes = level.ratings.tomatoes;
                    }
                });
            $scope.levelsToLoadCount = 9;
            $scope.shownLevelsCount = $scope.levelsToLoadCount;
            $scope.sortMethod = 9;
            $scope.view = 'grid';
            $scope.layeredFilters = { gameVersion: [], baseLevel: [] };
        }

        $scope.loadMore = function (){
            if($scope.levelsBeingLoaded) return;

            if($scope.levelsToLoadCount == 5) $scope.levelsToLoadCount = 4;
            else $scope.levelsToLoadCount = 5;

            $scope.levelsBeingLoaded = Math.max(Math.min($scope.levelsToShow - $scope.shownLevelsCount, $scope.levelsToLoadCount), 0);
        };

        $scope.imageLoaded = function () {
            if(--$scope.levelsBeingLoaded == 0) {
                $scope.shownLevelsCount += $scope.levelsToLoadCount;

                $scope.$apply();
            }
        };

        $scope.sort = function(e) {
            $scope.sortMethod = ($(".sort a").index(e.target));
        };

        $scope.showLevel = function(id) {
            $rootScope.scroll = $( window ).scrollTop();
            $rootScope.levels = $scope.levels;
            $rootScope.shownLevelsCount = $scope.shownLevelsCount;
            $rootScope.sortMethod = $scope.sortMethod;
            $rootScope.view = $scope.view;
            $rootScope.search = $scope.search;
            $rootScope.flt = { fileSize: [ $scope.filter.fileSize[0], $scope.filter.fileSize[1] ], tomatoes: [ $scope.filter.tomatoes[0], $scope.filter.tomatoes[1] ] };
            $rootScope.layeredFilters = $scope.layeredFilters;
            $rootScope.levelsToLoadCount = $scope.levelsToLoadCount;
            for(l in $scope.levels){
                if($scope.levels[l].id == id) {
                    $rootScope.level = $scope.levels[l];
                    break;
                }
            }
            $location.path('./level/'+id);
        }

        $scope.getActiveFilters = function(){
            var filterStrings = [];
            if($scope.filter) {
                if ($scope.filter.fileSize[0] != $rootScope.lowestFileSize || $scope.filter.fileSize[1] != $rootScope.highestFileSize)
                    filterStrings.push($rootScope.strings.fileSize + $scope.$parent.sizeFormatter($scope.filter.fileSize));
                if ($scope.filter.tomatoes[0] != $rootScope.minTomatoes || $scope.filter.tomatoes[1] != $rootScope.maxTomatoes)
                    filterStrings.push($rootScope.strings.tomatoesNumber + '[' + $scope.filter.tomatoes.join(' - ') + ']');
            }
            return filterStrings.length?filterStrings.join(', '):($rootScope.strings.filter+$rootScope.strings.none);
        }

        $scope.layered = function(e, type, value) {
            var button = $(e.target);
            if(button.hasClass("icon")) {
                button = button.parent();
            }
            button.toggleClass("active");
            if($scope.layeredFilters[type]) {
                if($scope.layeredFilters[type].has(value)) {
                    $scope.layeredFilters[type].delete(value);
                } else {
                    $scope.layeredFilters[type].add(value);
                }
            } else {
                $scope.layeredFilters[type] = new Set([value]);
            }
        };
        makeRatings();
    }).filter('sortBy', function() {
        return function layered(items, $scope) {
            if(!items) {
                return [];
            }
            return items.sort(function (a, b) {
                return $scope.asc ? a[$scope.sort] > b[$scope.sort] : a[$scope.sort] < b[$scope.sort];
            });
        }
    }).filter('layered', function(){
        return function layered(items, $scope, $search) {
            if(!items) {
                $scope.levelsToShow = 0;
                return [];
            }
            var it = items.filter(function (level) {
                for (type in $scope.layeredFilters) {
                    var non_null = false;
                    for(n in $scope.layeredFilters[type]){
                        if($scope.layeredFilters[type][n]){
                            non_null = true;
                            break;
                        }
                    }
                    if(non_null && !$scope.layeredFilters[type][level[type]]) return false;
                }
                if($search && $search.length > 0 && level.name.toLowerCase().indexOf($search.toLowerCase()) == -1
                    && level.author.toLowerCase().indexOf($search.toLowerCase()) == -1)
                    return false;
                return level.size >= $scope.filter.fileSize[0] && level.size <= $scope.filter.fileSize[1]
                    && level.ratings.tomatoes >= $scope.filter.tomatoes[0] && level.ratings.tomatoes <= $scope.filter.tomatoes[1];
            }).sort(function(a, b) {
                var asc = $scope.sortMethod%2==0?1:-1;
                switch($scope.sortMethod){
                    case 0:
                    case 1:
                        return (a.name > b.name) ? asc : ((b.name > a.name) ? -asc : 0);
                        break;
                    case 2:
                    case 3:
                        return (a.author > b.author) ? asc : ((b.author > a.author) ? -asc : 0);
                        break;
                    case 4:
                    case 5:
                        return (a.ratings.avg > b.ratings.avg) ? asc : ((b.ratings.avg > a.ratings.avg) ? -asc : 0);
                        break;
                    case 6:
                    case 7:
                        return (a.ratings.tomatoes > b.ratings.tomatoes) ? asc : ((b.ratings.tomatoes > a.ratings.tomatoes) ? -asc : 0);
                        break;
                    case 8:
                    case 9:
                        return (a.dateUploaded > b.dateUploaded) ? asc : ((b.dateUploaded > a.dateUploaded) ? -asc : 0);
                        break;
                    case 10:
                    case 11:
                        return (a.size > b.size) ? asc : ((b.size > a.size) ? -asc : 0);
                        break;
                    default:
                        break;
                }
            });
            $scope.levelsToShow = it.length;
            return it;
        }
    });

$("body").click(function( e ) {
    var el = e.target;
    if($(el).hasClass('fa')) {
        el = $(el).prev();
    }
    if($(".filter").has(el).length){
        if($(".filter > input").is(el))
            $(".filter > .dropdown-menu").slideToggle("fast");
        $( ".sort > .dropdown-menu" ).slideUp("fast");
    } else {
        $(".filter > .dropdown-menu").slideUp("fast");
        if($(".sort > input").is(el))
            $( ".sort > .dropdown-menu" ).slideToggle("fast");
        else $( ".sort > .dropdown-menu" ).slideUp("fast");
    }
});