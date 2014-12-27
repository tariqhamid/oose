'use strict';


/**
 * Confg overrides
 * @type {object}
 */
module.exports = {
  domain: 'oose-test',
  site: 'site1',
  zone: 'zone1',
  root: __dirname + '/data/test/master1',
  store: {
    enabled: false,
    username: 'oose-store',
    password: 'fuckthat',
    timeout: 500
  },
  prism: {
    enabled: false,
    name: 'prism1',
    username: 'oose-prism',
    password: 'fuckit',
    timeout: 500
  },
  master: {
    enabled: true,
    name: 'oose-master',
    host: '127.0.2.1',
    username: 'oose',
    password: 'fuckyou',
    timeout: 500
  }
}
