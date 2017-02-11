'use strict';


/**
 * Config overrides
 * @type {object}
 */
module.exports = {
  couchdb: {
    host: '127.0.0.1',
    port: 5984,
    options: {
      auth: {
        username: 'oose',
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
