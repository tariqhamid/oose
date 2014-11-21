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
 * Hideout routes
 * @type {exports}
 */
exports.hideout = require('./hideout')
