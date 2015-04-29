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
 * Ping pong for health checks
 * @param {object} req
 * @param {object} res
 */
exports.ping = function(req,res){
  res.json({pong: 'pong'})
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
 * Inventory routes
 * @type {exports}
 */
exports.inventory = require('./inventory')


/**
 * User routes
 * @type {exports}
 */
exports.user = require('./user')
