'use strict';


/**
 * Confg overrides
 * @type {object}
 */
module.exports = {
  domain: 'oose-test',
  site: 'site1',
  zone: 'zone1',
  root: __dirname + '/data/test/store2',
  store: {
    enabled: true,
    host: '127.0.2.5',
    name: 'store2',
    username: 'oose-store',
    password: 'fuckthat'
  },
  prism: {
    enabled: false,
    name: 'prism1',
    username: 'oose-prism',
    password: 'fuckit'
  },
  master: {
    enabled: false,
    host: '127.0.2.1',
    username: 'oose',
    password: 'fuckyou'
  }
}
