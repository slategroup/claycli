const _ = require('lodash'),
  b64 = require('base-64'),
  refProp = '_ref',
  types = [
    '/components',
    '/uris',
    '/pages',
    '/lists',
    '/users'
  ];

/**
 * strip prefix
 * note: pass through things that aren't prefixable
 * @param  {string} uri
 * @return {string}
 */
function stripPrefix(uri) {
  let bareUri;

  _.forEach(types, (type) => {
    if (_.includes(uri, type)) {
      bareUri = uri.substring(uri.indexOf(type));
      return false; // end early
    }
  });

  if (!bareUri) {
    // not a real uri, pass it through
    bareUri = uri;
  }

  return bareUri;
}

function addPrefix(prefix, uri) {
  let prefixedUri;

  _.forEach(types, (type) => {
    if (_.includes(uri, type)) {
      prefixedUri = prefix + uri;
      return false; // end early
    }
  });

  if (!prefixedUri) {
    // not a real uri, pass it through
    prefixedUri = uri;
  }

  return prefixedUri;
}

/**
 * strip prefixes from a potential component list
 * @param  {array} arr which may be component list or just data
 * @param {function} fn to execute against prefixes
 * @return {array}
 */
function toggleListPrefixes(arr, fn) {
  if (_.has(_.head(arr), refProp)) {
    // it's a component list! strip the prefixes
    return _.map(arr, (item) => _.assign({}, item, { [refProp]: fn(item[refProp]) }));
  } else if (_.isString(_.head(arr))) {
    // possibly a page list (array of strings)
    // note: other strings will just be passed through
    return _.map(arr, (item) => fn(item));
  } else {
    // just component data, move along
    return arr;
  }
}

/**
 * strip prefixes from a potential component property
 * @param  {object} obj which may be a component prop or just data
 * @param {function} fn to execute against prefixes
 * @return {object}
 */
function togglePropPrefixes(obj, fn) {
  if (_.has(obj, refProp)) {
    // it's a component prop! strip prefixes
    return _.assign({}, obj, { [refProp]: fn(obj[refProp]) });
  } else {
    // just component data, move along
    return obj;
  }
}

/**
 * toggle prefixes from all component refs in some data
 * @param  {object|string} data will be string for uris
 * @param {function} fn to execute against prefixes
 * @return {object}
 */
function toggleReferencePrefixes(data, fn) {
  if (_.isString(data)) {
    return fn(data);
  } else {
    let initializer = _.isArray(data) ? [] : {};

    return _.reduce(data, (cleanData, val, key) => {
      if (_.isArray(val)) {
        // possibly a component list
        cleanData[key] = toggleListPrefixes(val, fn);
      } else if (_.isObject(val)) {
        // possibly a component prop
        cleanData[key] = togglePropPrefixes(val, fn);
      } else {
        // add any other bits of component data
        cleanData[key] = val;
      }
      return cleanData;
    }, initializer);
  }
}

/**
 * convert uri and data into agnostic chunk
 * note: chunks are designed to be mergeable, but generating chunks from
 * MULTIPLE sites has a possibility of naming collisions
 * @param  {string} uri
 * @param  {*} data
 * @return {object}
 */
function toChunk(uri, data) {
  return {
    [stripPrefix(uri)]: toggleReferencePrefixes(data, stripPrefix)
  };
}

/**
 * convert agnostic chunk into mergeable object of full uris and data
 * note: merging across multiple sites is fine, because these are full uris
 * @param  {string} prefix
 * @param  {*} chunk
 * @return {object}
 */
function fromChunk(prefix, chunk) {
  const uri = Object.keys(chunk)[0],
    data = chunk[uri];

  return {
    [addPrefix(prefix, uri)]: toggleReferencePrefixes(data, addPrefix.bind(null, prefix))
  };
}

/**
 * parse components for default and instance data
 * @param  {object} items
 * @return {object}
 */
function parseComponents(items) {
  return _.reduce(items, (chunks, data, name) => {
    const defaultData = _.omit(data, 'instances');

    if (_.size(defaultData)) {
      _.assign(chunks, toChunk(`/components/${name}`, defaultData));
    }

    if (data.instances && _.size(data.instances)) {
      _.reduce(data.instances, (chunks, instanceData, instanceID) => {
        return _.assign(chunks, toChunk(`/components/${name}/instances/${instanceID}`, instanceData));
      }, chunks);
    }
    return chunks;
  }, {});
}

/**
 * parse users, generating uris
 * @param  {array} items
 * @return {object}
 */
function parseUsers(items) {
  return _.reduce(items, (chunks, user) => {
    const key = `/users/${b64.encode(user.username.toLowerCase() + '@' + user.provider)}`;

    return _.assign(chunks, { [key]: user });
  }, {});
}

/**
 * parse uris, pages, lists, users
 * @param  {object} items
 * @param  {string} type
 * @return {object}
 */
function parseArbitraryData(items, type) {
  return _.reduce(items, (chunks, val, key) => {
    if (key[0] === '/') {
      // fix for uris and pages, which always start with /
      // (lists, users, and other data types don't start with /)
      key = key.slice(1);
    }
    return _.assign(chunks, toChunk(`/${type}/${key}`, val));
  }, {});
}

/**
 * parse a full botostrap object
 * @param  {object} obj
 * @return {object}     of merged chunks
 */
function parseObject(obj) {
  // bootstrap objects must have top-level types
  return _.reduce(obj, (chunks, items, type) => {
    if (type === 'components') {
      return _.assign(chunks, parseComponents(items));
    } else if (type === 'users') {
      return _.assign(chunks, parseUsers(items));
    } else {
      return _.assign(chunks, parseArbitraryData(items, type));
    }
  }, {});
}

module.exports.toChunk = toChunk;
module.exports.fromChunk = fromChunk;
// parse a whole 'bootstrap' object
module.exports.parseObject = parseObject;