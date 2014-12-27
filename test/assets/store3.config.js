'use strict';


/**
 * Confg overrides
 * @type {object}
 */
module.exports = {
  domain: 'oose-test',
  site: 'site1',
  zone: 'zone2',
  root: __dirname + '/data/test/store3',
  redis: {
    db: 4
  },
  store: {
    enabled: true,
    host: '127.0.2.6',
    name: 'store3',
    username: 'oose-store',
    password: 'fuckthat',
    timeout: 500,
    workers: {count: 4, maxConnections: 1000000}
  },
  prism: {
    enabled: false,
    name: 'prism2',
    username: 'oose-prism',
    password: 'fuckit',
    timeout: 500
  },
  master: {
    enabled: false,
    host: '127.0.2.1',
    username: 'oose',
    password: 'fuckyou',
    timeout: 500
  }
}
