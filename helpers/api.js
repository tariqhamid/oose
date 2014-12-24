'use strict';
var request = require('request')

var config = require('../config')


/**
 * Setup master access
 * @param {object} options
 * @return {request}
 */
exports.master = function(options){
  if(!options) options = config.master
  var master = request.defaults({
    auth: {
      username: options.username || config.master.username,
      password: options.password || config.master.password
    }
  })
  master.url = function(uri){
    return 'https://' + options.host + ':' + options.port + uri
  }
  return master
}


/**
 * Setup prism access
 * @param {object} options
 * @return {request}
 */
exports.prism = function(options){
  if(!options) options = config.prism
  var prism = request.defaults({
    auth: {
      username: options.username || config.prism.username,
      password: options.password || config.prism.password
    }
  })
  prism.url = function(uri){
    return 'https://' + options.host + ':' + options.port + uri
  }
  return prism
}


/**
 * Store access
 * @param {object} options
 * @return {request}
 */
exports.store = function(options){
  if(!options) options = config.store
  var store = request.defaults({
    auth: {
      username: options.username || config.store.username,
      password: options.password || config.store.password
    }
  })
  store.url = function(uri){
    return 'https://' + options.host + ':' + options.port + uri
  }
  return store
}


/**
 * Set session on any request object
 * @param {object} session
 * @param {request} request
 * @return {request}
 */
exports.setSession = function(session,request){
  return request.defaults({
    headers: {
      'X-OOSE-Token': session.token
    }
  })
}
