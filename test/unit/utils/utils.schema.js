var utils = require('../../../lib/waterline/utils/schema'),
    assert = require('assert');

describe('Schema utilities', function() {

  describe('`normalizeAttributes`', function() {

    describe('with shorthand attributes', function() {
      it('should add type parameter to attributes', function() {
        var attributes = {first_name: 'STRING', last_name: 'STRING'};
        var expected = {first_name: {type: 'string'}, last_name: {type: 'string'}};
        var result = utils.normalizeAttributes(attributes);
        assert.deepEqual(result, expected);
      });

      it('should ignore functions', function() {
        var attributes = {
          prop: function() { return "ignored"; },
          val: 'integer'
        };
        var expected = {val: {type: 'integer'}};
        var result = utils.normalizeAttributes(attributes);
        assert.deepEqual(result, expected);
      });

      it('should lowercase attribute type', function() {
        var attributes = { val: 'TYPE'};
        var expected = {val : {type: 'type'}};
        var result = utils.normalizeAttributes(attributes);
        assert.deepEqual(result, expected);
      });

      it('should lowercase collection property', function() {
        var attributes = {name: {
          type: 'string',
          collection: 'PANDAS'
        }};
        var expected = { name: { type: 'string', collection: 'pandas'}};
        var result = utils.normalizeAttributes(attributes);
        assert.deepEqual(result, expected);
      });

      it('should lowercase model name', function() {
        var attributes = {name: {
          type: 'string',
          model: 'Person'
        }};
        var expected = { name: {type: 'string', model: 'person'}};
        var result = utils.normalizeAttributes(attributes);
        assert.deepEqual(result, expected);
      });
    });
  });

  describe('`instanceMethods`', function() {
    var methods;

    before(function() {
      var attributes = {
        first_name: 'STRING',
        last_name: 'string',
        age: function() {
          return Math.floor(Math.random() + 1 * 10);
        },
        full_name: function() {
          return this.first_name + ' ' + this.last_name;
        }
      };

      methods = utils.instanceMethods(attributes);
    });

    it('should return instance methods from attributes', function() {
      assert(typeof methods.age === 'function');
      assert(typeof methods.full_name === 'function');
    });
  });

  describe('`normalizeCallbacks`', function() {

    describe('with callbacks as function', function() {
      var callbacks;

      before(function() {
        var model = {
          attributes: {
            first_name: 'STRING',
            last_name: 'string'
          },
          afterCreate: function() {},
          beforeCreate: function() {}
        };

        callbacks = utils.normalizeCallbacks(model);
      });

      it('should normalize to callback array', function() {
        assert(Array.isArray(callbacks.afterCreate));
        assert(Array.isArray(callbacks.beforeCreate));
      });
    });

    describe('with callbacks as array of functions', function() {
      var callbacks;

      before(function() {
        var model = {
          attributes: {
            first_name: 'STRING',
            last_name: 'string'
          },
          afterCreate: [
            function() {}
          ],
          beforeCreate: [
            function() {},
            function() {}
          ]
        };

        callbacks = utils.normalizeCallbacks(model);
      });

      it('should normalize to callback array', function() {
        assert(Array.isArray(callbacks.afterCreate));
        assert(Array.isArray(callbacks.beforeCreate));
      });

      it('should retain all callback functions', function() {
        assert(callbacks.afterCreate.length === 1);
        assert(callbacks.beforeCreate.length === 2);
      });
    });

    describe('with callbacks as strings', function() {
      var fn_1, fn_2, callbacks;

      before(function() {
        var model;

        fn_1 = function() {
          this.age = this.age || this.age++;
        };

        fn_2 = function() {
          this.first_name = this.first_name.toLowerCase();
        };

        model = {
          attributes: {
            first_name: 'STRING',
            last_name: 'string',
            increment_age: fn_1,
            lowerize_first_name: fn_2
          },
          afterCreate: 'lowerize_first_name',
          beforeCreate: 'increment_age'
        };

        callbacks = utils.normalizeCallbacks(model);
      });

      it('should normalize to callback array', function() {
        assert(Array.isArray(callbacks.afterCreate));
        assert(Array.isArray(callbacks.beforeCreate));
      });

      it('should map all callback functions', function() {
        assert(callbacks.afterCreate[0] === fn_2);
        assert(callbacks.beforeCreate[0] === fn_1);
      });
    });

    describe('with callbacks as an array of strings', function() {
      var fn_1, fn_2, callbacks;

      before(function() {
        var model;

        fn_1 = function() {
          this.age = this.age || this.age++;
        };

        fn_2 = function() {
          this.first_name = this.first_name.toLowerCase();
        };

        model = {
          attributes: {
            first_name: 'STRING',
            last_name: 'string',
            increment_age: fn_1,
            lowerize_first_name: fn_2
          },
          afterCreate: ['increment_age', 'lowerize_first_name']
        };

        callbacks = utils.normalizeCallbacks(model);
      });

      it('should normalize to callback array', function() {
        assert(Array.isArray(callbacks.afterCreate));
      });

      it('should map all callback functions', function() {
        assert(callbacks.afterCreate[0] === fn_1);
        assert(callbacks.afterCreate[1] === fn_2);
      });
    });
  });

});
