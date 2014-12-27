'use strict';


/**
 * Confg overrides
 * @type {object}
 */
module.exports = {
  domain: 'oose-test',
  site: 'site1',
  zone: 'zone1',
  root: __dirname + '/data/test/prism1',
  redis: {
    db: 0
  },
  store: {
    enabled: false,
    username: 'oose-store',
    password: 'fuckthat',
    timeout: 500
  },
  prism: {
    enabled: true,
    host: '127.0.2.2',
    name: 'prism1',
    username: 'oose-prism',
    password: 'fuckit',
    timeout: 500,
    workers: {count: 4, maxConnections: 1000000}
  },
  master: {
    enabled: false,
    host: '127.0.2.1',
    username: 'oose',
    password: 'fuckyou',
    timeout: 500
  }
}
