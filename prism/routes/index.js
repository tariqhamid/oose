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
 * Content routes
 * @type {object}
 */
exports.content = require('./content')


/**
 * Purchase routes
 * @type {object}
 */
exports.purchase = require('./purchase')


/**
 * User routes
 * @type {object}
 */
exports.user = require('./user')
