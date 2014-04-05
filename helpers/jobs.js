'use strict';
var kue = require('kue')
  , config = require('../config')


/**
 * Export kue instance
 * @type {Queue}
 */
module.exports = kue.createQueue(config.get('kue.options'))
