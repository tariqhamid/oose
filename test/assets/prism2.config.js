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
    password: 'fuckthat'
  },
  prism: {
    enabled: true,
    host: '127.0.2.3',
    name: 'prism2',
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
