'use strict';
var P = require('bluebird')
var request = require('request')

var config = require('../config')


/**
 * Make an API URL
 * @param {object} options
 * @return {function}
 */
var makeURL = function(options){
  return function(uri){
    return 'https://' + (options.host || '127.0.0.1') + ':' + options.port + uri
  }
}


/**
 * Setup a new request object
 * @param {object} options
 * @return {request}
 */
var setupRequest = function(options){
  var req = request.defaults({
    rejectUnauthorized: false,
    json: true,
    auth: {
      username: options.username || config.master.username,
      password: options.password || config.master.password
    }
  })
  req.url = makeURL(options)
  P.promisifyAll(req)
  return req
}


/**
 * Setup master access
 * @param {object} options
 * @return {request}
 */
exports.master = function(options){
  if(!options) options = config.master
  return setupRequest(options)
}


/**
 * Setup prism access
 * @param {object} options
 * @return {request}
 */
exports.prism = function(options){
  if(!options) options = config.prism
  return setupRequest(options)
}


/**
 * Store access
 * @param {object} options
 * @return {request}
 */
exports.store = function(options){
  if(!options) options = config.prism
  return setupRequest(options)
}


/**
 * Set session on any request object
 * @param {object} session
 * @param {request} request
 * @return {request}
 */
exports.setSession = function(session,request){
  var options = {headers: {}}
  options.headers[config.master.user.sessionTokenName] = session.token
  var req = request.defaults(options)
  P.promisifyAll(req)
  return req
}
