'use strict';


/**
 * Config
 * @type {{domain: string, mesh: {debug: number}, store: {enabled: boolean}, supervisor: {enabled: boolean}, prism: {enabled: boolean}, lg: {enabled: boolean}, gump: {enabled: boolean}}}
 */
module.exports = {
  domain: 'oose.io',
  root: '/data',
  store: {
    enabled: true
  },
  supervisor: {
    enabled: true
  },
  shredder: {
    enabled: true
  }
}
