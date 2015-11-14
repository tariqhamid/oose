'use strict';


/**
 * Config overrides
 * @type {object}
 */
module.exports = {
  couchdb: {
    host: 'localhost',
    port: 5984,
    options: {
      auth: {
        username: 'root',
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
