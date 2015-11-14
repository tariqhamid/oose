'use strict';


/**
 * Config overrides
 * @type {object}
 */
module.exports = {
  couchdb: {
    host: 'lpcalhost',
    port: 5984,
    options: {
      auth: {
        username: 'oose',
        password: 'blah1234'
      }
    }
  },
  store: {
    enabled: true
  },
  prism: {
    enabled: true
  }
}
