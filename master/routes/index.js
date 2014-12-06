'use strict';
var config = require('../../config')


/**
 * Homepage
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  res.json({message: 'Welcome to OOSE version ' + config.version})
}


/**
 * Prism routes
 * @type {exports}
 */
exports.prism = require('./prism')


/**
 * Store routes
 * @type {exports}
 */
exports.store = require('./store')


/**
 * Memory routes
 * @type {exports}
 */
exports.memory = require('./memory')
