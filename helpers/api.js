'use strict';
var P = require('bluebird')
var http = require('http')
var request = require('request')

var NetworkError = require('../helpers/NetworkError')
var UserError = require('../helpers/UserError')

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
 * Validate a response (implicit error handling)
 * @return {function}
 */
var validateResponse = function(){
  return function(res,body){
    if('object' !== typeof body) body = JSON.parse(body)
    if(200 !== res.statusCode){
      throw new UserError(
        'Invalid response code (' + res.statusCode + ')' +
        ' to ' + res.method + ': ' + res.url)
    }
    if(body.error){
      if(body.error.message) throw new UserError(body.error.message)
      if(body.error) throw new UserError(body.error)
    }
    return [res,body]
  }
}


/**
 * Handle network errors
 * @param {Error} err
 */
var handleNetworkError = function(err){
  if(err && err.message && err.message.match(/connect|ETIMEDOUT/))
    throw new NetworkError(err.message)
  else
    throw new Error(err.message)
}


/**
 * Extend request
 * @param {request} req
 * @param {object} options
 * @return {request}
 */
var extendRequest = function(req,options){
  req.options = options
  req.url = makeURL(options)
  req.validateResponse = validateResponse
  req.handleNetworkError = handleNetworkError
  P.promisifyAll(req)
  return req
}


/**
 * Setup a new request object
 * @param {string} type
 * @param {object} options
 * @return {request}
 */
var setupRequest = function(type,options){
  var pool = new http.Agent()
  pool.maxSockets = options.maxSockets || config[type].maxSockets || 128
  var req = request.defaults({
    rejectUnauthorized: false,
    json: true,
    timeout:
      process.env.REQUEST_TIMEOUT ||
      options.timeout ||
      config[type].timeout ||
      null,
    pool: pool,
    auth: {
      username: options.username || config[type].username,
      password: options.password || config[type].password
    }
  })
  return extendRequest(req,options)
}


/**
 * Setup master access
 * @param {object} options
 * @return {request}
 */
exports.master = function(options){
  if(!options) options = config.master
  return setupRequest('master',options)
}


/**
 * Setup prism access
 * @param {object} options
 * @return {request}
 */
exports.prism = function(options){
  if(!options) options = config.prism
  return setupRequest('prism',options)
}


/**
 * Store access
 * @param {object} options
 * @return {request}
 */
exports.store = function(options){
  if(!options) options = config.prism
  return setupRequest('store',options)
}


/**
 * Set session on any request object
 * @param {object} session
 * @param {request} request
 * @return {request}
 */
exports.setSession = function(session,request){
  var newOptions = {headers: {}}
  newOptions.headers[config.master.user.sessionTokenName] = session.token
  var req = request.defaults(newOptions)
  return extendRequest(req,request.options)
}
