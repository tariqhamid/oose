'use strict';


/**
 * Confg overrides
 * @type {object}
 */
module.exports = {
  domain: 'oose-test',
  group: 'group1',
  root: __dirname + '/data/test/prism1',
  redis: {
    db: 0
  },
  store: {
    enabled: false,
    username: 'oose-store',
    password: 'fuckthat',
    timeout: 2000
  },
  prism: {
    enabled: true,
    host: '127.0.2.2',
    name: 'prism1',
    username: 'oose-prism',
    password: 'fuckit',
    timeout: 2000,
    workers: {count: 2, maxConnections: 1000000}
  }
}
