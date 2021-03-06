'use strict';


/**
 * Confg overrides
 * @type {object}
 */
module.exports = {
  domain: 'oose-test',
  group: 'group2',
  root: __dirname + '/data/test/store3',
  redis: {
    db: 4
  },
  store: {
    enabled: true,
    host: '127.0.2.6',
    name: 'store3',
    prism: 'prism2',
    username: 'oose-store',
    password: 'fuckthat',
    timeout: 2000,
    workers: {count: 2, maxConnections: 1000000}
  },
  prism: {
    enabled: false,
    name: 'prism2',
    username: 'oose-prism',
    password: 'fuckit',
    timeout: 2000
  }
}
