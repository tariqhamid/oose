'use strict';
var P = require('bluebird')
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
  if(!host) host = '127.0.0.1'
  if(!port) throw new UserError('Port not defined')
  this.protocol = 'http'
  if(protocol) this.protocol = protocol
  //set the token to null for now
  this.session = {}
  //set the base url now
  this.baseURL = this.protocol + '://' + this.host + ':' + this.port
}


/**
 * Set session token
 * @param {object} session
 */
APIClient.prototype.setSession = function(session){
  this.session = session
}


/**
 * Make a get request
 * @param {string} path
 * @param {object} data
 * @return {P}
 */
APIClient.prototype.get = function(path,data){
  if(this.session.token) data.token = this.session.token
  return request.getAsync(this.baseURL + path,{data: data})
}


/**
 * Make a post request
 * @param {string} path
 * @param {object} data
 * @return {P}
 */
APIClient.prototype.post = function(path,data){
  if(this.session.token) data.token = this.session.token
  return request.postAsync(this.baseURL + path,{data: data})
}
