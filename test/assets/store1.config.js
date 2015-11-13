'use strict';


/**
 * Confg overrides
 * @type {object}
 */
module.exports = {
  domain: 'oose-test',
  site: 'site1',
  zone: 'zone1',
  root: __dirname + '/data/test/store1',
  redis: {
    db: 2
  },
  store: {
    enabled: true,
    host: '127.0.2.4',
    name: 'prism1:store1',
    username: 'oose-store',
    password: 'fuckthat',
    timeout: 2000,
    workers: {count: 2, maxConnections: 1000000}
  },
  prism: {
    enabled: false,
    name: 'prism1',
    username: 'oose-prism',
    password: 'fuckit',
    timeout: 2000
  }
}
