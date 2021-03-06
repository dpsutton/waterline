var _ = require('lodash');
var util = require('./helpers');
var hop = util.object.hasOwnProperty;
var switchback = require('switchback');
var errorify = require('../error');
var WLUsageError = require('../error/WLUsageError');

module.exports = {

  // Expand Primary Key criteria into objects
  expandPK: function(context, options) {

    // Default to id as primary key
    var pk = 'id';
    // If autoPK is not used, attempt to find a primary key
    if (!context.autoPK) {
      // Check which attribute is used as primary key
      for (var key in context.attributes) {
        if (!hop(context.attributes[key], 'primaryKey')) continue;

        // Check if custom primaryKey value is falsy
        if (!context.attributes[key].primaryKey) continue;

        // If a custom primary key is defined, use it
        pk = key;
        break;
      }
    }

    // Check if options is an integer or string and normalize criteria
    // to object, using the specified primary key field.
    if (_.isNumber(options) || _.isString(options) || Array.isArray(options)) {
      // Temporary store the given criteria
      var pkCriteria = _.clone(options);

      // Make the criteria object, with the primary key
      options = {};
      options[pk] = pkCriteria;
    }

    // If we're querying by primary key, create a coercion function for it
    // depending on the data type of the key
    if (options && options[pk]) {
      var coercePK;
      if (context.attributes[pk].type === 'integer') {
        coercePK = function(pk) {return +pk;};
      } else if (context.attributes[pk].type === 'STRING') {
        coercePK = function(pk) {return String(pk).toString();};

        // If the data type is unspecified, return the key as-is
      } else {
        coercePK = function(pk) {return pk;};
      }

      // If the criteria is an array of PKs, coerce them all
      // given options [1, 2, 3], it looks up the type and then
      // converts each of the members of the array to that type
      if (Array.isArray(options[pk])) {
        options[pk] = options[pk].map(coercePK);

        // Otherwise just coerce the one
      } else {
        if (!_.isObject(options[pk])) {
          options[pk] = coercePK(options[pk]);
        }
      }

    }

    return options;

  },

  // Normalize the different ways of specifying criteria into a uniform object
  criteria: function(origCriteria) {
    var criteria = _.cloneDeep(origCriteria);

    // If original criteria is already false, keep it that way.
    if (criteria === false) return criteria;

    if (!criteria) {
      return {
        where: null
      };
    }

    // Let the calling method normalize array criteria. It could be an IN query
    // where we need the PK of the collection or a .findOrCreateEach
    if (Array.isArray(criteria)) return criteria;

    // standardize form a little bit. If a primitive, turn into {id: primitive}
    // add where clause if not found, delete extraneous keys if no real structure to object
    criteria = standardizeForm(criteria);


    // Move Limit, Skip, sort outside the where criteria
    criteria = processWhereClauseAttributes(criteria);


    // limit and skip clauses could exist chained and now we validate they don't
    // call to skip -3 or skip -4 results. Check these arguments are above 0
    criteria = validateLimitAndSkipParameters(criteria);

    // If an IN was specified in the top level query and is an empty array, we can return an
    // empty object without running the query because nothing will match anyway. Let's return
    // false from here so the query knows to exit out.
    if (criteria.where) {
      var falsy = false;
      Object.keys(criteria.where).forEach(function(key) {
        if (Array.isArray(criteria.where[key]) && criteria.where[key].length === 0) {
          falsy = true;
        }
      });

      if (falsy) return false;
    }

    // If an IN was specified inside an OR clause and is an empty array, remove it because nothing will
    // match it anyway and it can prevent errors in the adapters
    if (criteria.where && hop(criteria.where, 'or')) {

      // Ensure `or` is an array
      if (!_.isArray(criteria.where.or)) {
        throw new WLUsageError('An `or` clause in a query should be specified as an array of subcriteria');
      }

      _.reduce(criteria.where.or, function(orClauses, clause, i) {
        // if clause contains an empty array, then delete it
        _.each(clause, function(value) {
          if (Array.isArray(value)) {
            // is is the clause index. If we found an empty array,
            // delete the whole clause
            orClauses.splice(i, 1);
          }
        });
      });
    }

    // Normalize sort criteria {sort: "column"}, {sort: "column asc"},
    // {sort: {column: 'asc'}} all map to {sort: {column: 1}} on the
    // top level of the criteria object
    criteria = normalizeSortOptions(criteria);

    return criteria;
  },

  // Normalize the capitalization and % wildcards in a like query
  // Returns false if criteria is invalid,
  // otherwise returns normalized criteria obj.
  // Enhancer is an optional function to run on each criterion to preprocess the string
  likeCriteria: function(criteria, attributes, enhancer) {

    // Only accept criteria as an object
    if (!_.isObject(criteria)) return false;

    if (!criteria.where) criteria = { where: criteria };

    // Apply enhancer to each
    if (enhancer) criteria.where = util.objMap(criteria.where, enhancer);

    criteria.where = { like: criteria.where };

    return criteria;
  },


  // Normalize a result set from an adapter
  resultSet: function(resultSet) {

    // Ensure that any numbers that can be parsed have been
    return util.pluralize(resultSet, numberizeModel);
  },


  /**
   * Normalize the different ways of specifying callbacks in built-in Waterline methods.
   * Switchbacks vs. Callbacks (but not deferred objects/promises)
   *
   * @param  {Function|Handlers} cb
   * @return {Handlers}
   */
  callback: function(cb) {

    // Build modified callback:
    // (only works for functions currently)
    var wrappedCallback;
    if (_.isFunction(cb)) {
      wrappedCallback = function(err) {

        // If no error occurred, immediately trigger the original callback
        // without messing up the context or arguments:
        if (!err) {
          return applyInOriginalCtx(cb, arguments);
        }

        // If an error argument is present, upgrade it to a WLError
        // (if it isn't one already)
        err = errorify(err);

        var modifiedArgs = Array.prototype.slice.call(arguments, 1);
        modifiedArgs.unshift(err);

        // Trigger callback without messing up the context or arguments:
        return applyInOriginalCtx(cb, modifiedArgs);
      };
    }


    //
    // TODO: Make it clear that switchback support it experimental.
    //
    // Push switchback support off until >= v0.11
    // or at least add a warning about it being a `stage 1: experimental`
    // feature.
    //

    if (!_.isFunction(cb)) wrappedCallback = cb;
    return switchback(wrappedCallback, {
      invalid: 'error', // Redirect 'invalid' handler to 'error' handler
      error: function _defaultErrorHandler() {
        console.error.apply(console, Array.prototype.slice.call(arguments));
      }
    });


    // ????
    // TODO: determine support target for 2-way switchback usage
    // ????

    // Allow callback to be -HANDLED- in different ways
    // at the app-level.
    // `cb` may be passed in (at app-level) as either:
    //    => an object of handlers
    //    => or a callback function
    //
    // If a callback function was provided, it will be
    // automatically upgraded to a simplerhandler object.
    // var cb_fromApp = switchback(cb);

    // Allow callback to be -INVOKED- in different ways.
    // (adapter def)
    // var cb_fromAdapter = cb_fromApp;

  }
};

// If any attribute looks like a number, but it's a string
// cast it to a number
function numberizeModel(model) {
  return util.objMap(model, numberize);
}


// If specified attr looks like a number, but it's a string, cast it to a number
function numberize(attr) {
  if (_.isString(attr) && isNumbery(attr) && parseInt(attr, 10) < Math.pow(2, 53)) return +attr;
  else return attr;
}

// Returns whether this value can be successfully parsed as a finite number
function isNumbery(value) {
  return Math.pow(+value, 2) > 0;
}

function standardizeForm(criteria) {
  // Empty undefined values from criteria object
  _.each(criteria, function(val, key) {
    if (_.isUndefined(val)) criteria[key] = null;
  });

  // Convert non-objects (ids) into a criteria
  // TODO: use customizable primary key attribute
  if (!_.isObject(criteria)) {
    criteria = {
      id: +criteria || criteria
    };
  }

  if (_.isObject(criteria) && !criteria.where && criteria.where !== null) {
    criteria = { where: criteria };
  }

  // Return string to indicate an error
  if (!_.isObject(criteria)) throw new WLUsageError('Invalid options/criteria :: ' + criteria);

  // If criteria doesn't seem to contain operational keys, assume all the keys are criteria
  if (!criteria.where && !criteria.joins && !criteria.join && !criteria.limit && !criteria.skip &&
      !criteria.sort && !criteria.sum && !criteria.average &&
      !criteria.groupBy && !criteria.min && !criteria.max && !criteria.select) {

    // Delete any residuals and then use the remaining keys as attributes in a criteria query
    delete criteria.where;
    delete criteria.joins;
    delete criteria.join;
    delete criteria.limit;
    delete criteria.skip;
    delete criteria.sort;
    criteria = {
      where: criteria
    };

    // If where is null, turn it into an object
  } else if (_.isNull(criteria.where)) criteria.where = {};

  return criteria;
}

// we move limit, skip, sort, sum, etc. clauses from nested within the
// where clause to their own properties at the top level of the
// criteria object.
// Eg: {where: {id: 4, skip: 5}} ==>
//            {where: {id: 4}, skip: 5}
// We are normalizing the form
function processWhereClauseAttributes(criteria) {

  // if no where clause, there is no processing to do
  var whereExists = hop(criteria, 'where') && criteria.where !== null;
  if (!whereExists) return criteria;

  var hasA = function(prop) {
    return hop(criteria.where, prop);
  };

  // there were multiple identical checks for properties. One thing to
  // note: this also used to validate the limit and skip properties,
  // as well as parse them to ints. Here we blindly move those values
  // and leave it to the validate method to parse those values rather
  // than here.
  var propertiesToCheck = [
    'limit', 'skip', 'sort', 'sum', 'average', 'groupBy', 'min',
    'min', 'max', 'select'
  ];
  _.forEach(propertiesToCheck, function(prop) {
    if (hasA(prop)) {
      criteria[prop] = _.clone(criteria.where[prop]);
      delete criteria.where[prop];
    }
  });


  // If WHERE is {}, always change it back to null
  if (criteria.where && _.keys(criteria.where).length === 0) {
    criteria.where = null;
  }

  return criteria;
}

function validateLimitAndSkipParameters(criteria) {
  if (hop(criteria, 'limit')) {
    criteria.limit = parseInt(criteria.limit, 10);
    if (criteria.limit < 0) criteria.limit = 0;
  }

  if (hop(criteria, 'skip')) {
    criteria.skip = parseInt(criteria.skip, 10);
    if (criteria.skip < 0) criteria.skip = 0;
  }

  return criteria;
}

// Sort criteria can come in as strings or objects: {sort: "column"}
// {sort: "column direction"} or {sort: {column: "direction"}}.  These
// must be transformed into {sort: {column: 1}} for ascending or -1
// for descending It also allows for {sort: {column: 1}}, and note
// this needs no transformation, or {sort: {column: 0}} which must be
// transformed into {sort: {column: -1}}
function normalizeSortOptions(criteria) {
  // if no sort clause, let's bail
  if (!(hop(criteria, 'sort') && criteria.sort !== null)) return criteria;

  // transform string versions into objects
  // Split string into attr and sortDirection parts (default to 'asc')
  if (_.isString(criteria.sort)) {
    var parts = criteria.sort.split(' ');
    var columnName = parts[0];
    var sortDirection = parts[1];

    // Set default sort to asc if no second word
    sortDirection = sortDirection ? sortDirection.toLowerCase() : 'asc';

    // Expand criteria.sort into object
    criteria.sort = {};
    criteria.sort[columnName] = sortDirection;
  }

  // normalize ASC/DESC notation
  Object.keys(criteria.sort).forEach(function(attr) {

    if (_.isString(criteria.sort[attr])) {
      criteria.sort[attr] = criteria.sort[attr].toLowerCase();

      // Throw error on invalid sort order
      if (criteria.sort[attr] !== 'asc' && criteria.sort[attr] !== 'desc') {
        throw new WLUsageError('Invalid sort criteria :: ' + criteria.sort);
      }
    }

    if (criteria.sort[attr] === 'asc') criteria.sort[attr] = 1;
    if (criteria.sort[attr] === 'desc') criteria.sort[attr] = -1;
  });

  // normalize binary sorting criteria. This handles the cases
  // {sort: {column: 0}}
  Object.keys(criteria.sort).forEach(function(attr) {
    if (criteria.sort[attr] === 0) criteria.sort[attr] = -1;
  });

  // Verify that user either specified a proper object or provided
  // explicit comparator function. If its not a function and not a
  // comparison function, i'm not sure how to provide information
  // about what it is.
  if (!_.isPlainObject(criteria.sort) && !_.isFunction(criteria.sort)) {
    var representation = criteria.sort.toString();
    throw new WLUsageError('Invalid sort criteria for ' + representation);
  }

  return criteria;
}

/**
 * Like _.partial, but accepts an array of arguments instead of
 * comma-seperated args (if _.partial is `call`, this is `apply`.)
 * The biggest difference from `_.partial`, other than the usage,
 * is that this helper actually CALLS the partially applied function.
 *
 * This helper is mainly useful for callbacks.
 *
 * @param  {Function} fn   [description]
 * @param  {[type]}   args [description]
 * @return {[type]}        [description]
 */

function applyInOriginalCtx(fn, args) {
  return (_.partial.apply(null, [fn].concat(Array.prototype.slice.call(args))))();
}
