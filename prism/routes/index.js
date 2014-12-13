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
 * User Login
 * @param {object} req
 * @param {object} res
 */
exports.login = function(req,res){

}


/**
 * User Logout
 * @param {object} req
 * @param {object} res
 */
exports.logout = function(req,res){

}


/**
 * Password reset
 * @param {object} req
 * @param {object} res
 */
exports.passwordReset = function(req,res){

}


/**
 * Upload file
 * @param {object} req
 * @param {object} res
 */
exports.upload = function(req,res){

}


/**
 * Purchase content
 * @param {object} req
 * @param {object} res
 */
exports.purchase = function(req,res){

}


/**
 * Download purchased content
 * @param {object} req
 * @param {object} res
 */
exports.download = function(req,res){

}
