'use strict';
var P = require('bluebird')
var debug = require('debug')('APIClient')
var request = require('request')

var UserError = require('./UserError')

//make some promises
P.promisifyAll(request)



/**
 * Constructor
 * @param {number} port
 * @param {string} host
 * @param {string} protocol
 * @constructor
 */
var APIClient = function(port,host,protocol){
  //defaults
  this.host = '127.0.0.1'
  this.port = 80
  this.protocol = 'http'
  //overrides
  if(host) this.host = host
  if(port) this.port = port
  if(protocol) this.protocol = protocol
  //set the token to an empty object for now
  this.session = {}
  //set basicAuth to disabled
  this.basicAuth = {username: false, password: false}
  //set the base url now
  this.baseURL = this.protocol + '://' + this.host + ':' + this.port
  debug('init complete',this.baseURL)
}


/**
 * Set session token
 * @param {object} session
 */
APIClient.prototype.setSession = function(session){
  debug('setting session',session)
  this.session = session
}


/**
 * Set basic auth
 * @param {string} username
 * @param {string} password
 */
APIClient.prototype.setBasicAuth = function(username,password){
  debug('setting basic auth',username,password)
  this.basicAuth.username = username
  this.basicAuth.password = password
}


/**
 * Make a get request
 * @param {string} path
 * @param {object} data
 * @return {P}
 */
APIClient.prototype.get = function(path,data){
  var that = this
  var options = {qs: data, json: true}
  //add session if we have one
  if(that.session.token) options.qs.token = that.session.token
  //add basic auth if enabled
  if(that.basicAuth.username || that.basicAuth.password){
    options.auth = {
      username: that.basicAuth.username,
      password: that.basicAuth.password
    }
  }
  debug('GET ' + that.baseURL + path,options)
  return request.getAsync(that.baseURL + path,options)
    .spread(function(res,body){
      debug('GET RESPONSE ' + that.baseURL + path,options,body)
      if(200 !== res.statusCode){
        throw new UserError(
          'Invalid response code (' + res.statusCode + ')' +
          ' to GET ' + that.baseURL + path)
      }
      if(body.error){
        if(body.error.message) throw new UserError(body.error.message)
        if(body.error) throw new UserError(body.error)
      }
      return [res,body]
    })
}


/**
 * Make a post request
 * @param {string} path
 * @param {object} data
 * @return {P}
 */
APIClient.prototype.post = function(path,data){
  var that = this
  var options = {json: data || {}}
  //add session if enabled
  if(that.session.token) options.json.token = that.session.token
  //add basic auth if enabled
  if(that.basicAuth.username || that.basicAuth.password){
    options.auth = {
      username: that.basicAuth.username,
      password: that.basicAuth.password
    }
  }
  debug('POST ' + that.baseURL + path,options)
  return request.postAsync(that.baseURL + path,options)
    .spread(function(res,body){
      debug('POST RESPONSE ' + that.baseURL + path,options,body)
      if(200 !== res.statusCode){
        throw new UserError(
          'Invalid response code (' + res.statusCode + ')' +
          ' to POST ' + that.baseURL + path)
      }
      if(body.error){
        if(body.error.message) throw new UserError(body.error.message)
        if(body.error) throw new UserError(body.error)
      }
      return [res,body]
    })
}


/**
 * Export Class
 * @type {APIClient}
 */
module.exports = APIClient
