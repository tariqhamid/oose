'use strict';


/**
 * Confg overrides
 * @type {object}
 */
module.exports = {
  domain: 'oose-test',
  site: 'site1',
  zone: 'zone2',
  root: __dirname + '/data/test/prism2',
  redis: {
    db: 1
  },
  store: {
    enabled: false,
    username: 'oose-store',
    password: 'fuckthat',
    timeout: 500
  },
  prism: {
    enabled: true,
    host: '127.0.2.3',
    name: 'prism2',
    username: 'oose-prism',
    password: 'fuckit',
    timeout: 500,
    workers: {count: 2, maxConnections: 1000000},
    enableSoftLookup: false
  },
  master: {
    enabled: false,
    host: '127.0.2.1',
    username: 'oose',
    password: 'fuckyou',
    timeout: 500
  }
}
