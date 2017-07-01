(function(root, factory) {
  'use strict';

  if (typeof exports === 'object') {

    // CommonJS module
    // Load jQuery as a dependency
    var jQuery;
    try {jQuery = require('jquery'); } catch (e) {}

    module.exports = factory(jQuery);
  } else {
    root.Rating = factory(root.jQuery);
  }
}

(this, function($) {
  'use strict';

  var createInputs = function(i, id) {
    var _class = '';
    var inputStr = '';
    var labelStr = '';

    if (i % 2) {
      _class = 'half';
    } else {
      _class = 'full';
    }

    if(i==0) _class = 'empty';

    inputStr = '<input type="radio" id="' + id + 'star' + i + '" name="rating" value="' + i / 2 + '" />';
    labelStr = '<label class = "' + _class + '" for="' + id + 'star' + i + '"></label>';

    return (inputStr + labelStr);
  };

  var ratingsTemplate = function(id) {
    var $fieldset = $('<fieldset class="rating"></fieldset>');

    for (var i = 10; i >= 0; i--) {
      $fieldset.append(createInputs(i, id));
    }

    return $fieldset;
  };

  // create the ratings
  var create = function($element, id, readOnly) {
    $element.html(ratingsTemplate(id));

    if (readOnly)
    $element.find('.rating').addClass('readOnly');
    else
    $element.find('.rating').addClass('write');
  };

  // handle click on radios
  var _onClick = function(e) {
    var $target = $(e.target);

    if (this.options.readOnly) {
      e.preventDefault();
    } else {
      let old = this.ratings;
      this.ratings = $target.val();

      if (typeof this.options.onSelect != 'undefined')
      this.options.onSelect(this.ratings, old);
    }
  };

  // constructor function
  var Rating = function(options) {
    this.options = $.extend({}, this.DEFAULTS, options);

    this.$element = this.options.field;
    create(this.$element, this.options._id, this.options.readOnly);

    this.$element.find('input').on('click', _onClick.bind(this));

    if (this.options.defaultRating)
    this.set(options.defaultRating);
  };

  // getter
  Rating.prototype.get = function() {
    return this.ratings;
  };

  // setter
  Rating.prototype.set = function(rating) {
    var startFrom = ((5 - rating) * 2);

    this.$element.find('input').each(function(i) {
      if (startFrom >= i) {
        $(this).prop('checked', 'true');
      }
    });

    this.ratings = rating;
  };

  Rating.prototype.DEFAULTS = {
    readOnly: false,
    defaultRating: null,
    field: $('<div></div>'),
    _id: '',
  };

  return Rating;
}));