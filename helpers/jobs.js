'use strict';
var kue = require('kue')
  , config = require('../config')

//setup kue
if(config.get('kue.port')){
  kue.app.set('title',config.get('kue.title') || 'OOSE Tasks')
  kue.app.listen(config.get('kue.port'),config.get('kue.port'))
}


/**
 * Export kue instance
 * @type {Queue}
 */
module.exports = kue.createQueue(config.get('kue.options'))
