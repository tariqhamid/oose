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
  heartbeat: {
    enabled: true
  },
  store: {
    enabled: true
  },
  prism: {
    enabled: true
  }
}
