'use strict';


/**
 * Confg overrides
 * @type {object}
 */
module.exports = {
  domain: 'oose-test',
  site: 'site1',
  zone: 'zone1',
  root: '/data/test/prism1',
  store: {
    enabled: false,
    username: 'oose-store',
    password: 'fuckthat'
  },
  prism: {
    enabled: true,
    host: '127.0.2.2',
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
