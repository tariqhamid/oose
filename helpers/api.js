'use strict';
var APIClient = require('../helpers/APIClient')

var config = require('../config')

//setup the connection to master
var master = new APIClient(config.master.port,config.master.host)
master.setBasicAuth(config.master.username,config.master.password)


/**
 * Master access
 * @type {APIClient}
 */
exports.master = master


/**
 * Setup prism access
 * @param {number} port
 * @param {string} host
 * @param {string} username
 * @param {string} password
 * @return {APIClient}
 */
exports.prism = function(port,host,username,password){
  if('object' === typeof port){
    host = port.ip || port.host
    username = port.username || port.user || config.prism.username
    password = port.password || port.pass || config.prism.password
    port = +port.port
  }
  var prism = new APIClient(port,host)
  prism.setBasicAuth(
    username || config.prism.username,
    password || config.prism.password
  )
  return prism
}


/**
 * Store access
 * @param {number} port
 * @param {string} host
 * @param {string} username
 * @param {string} password
 * @return {APIClient}
 */
exports.store = function(port,host,username,password){
  if('object' === typeof port){
    host = port.ip || port.host
    username = port.username || port.user || config.store.username
    password = port.password || port.pass || config.store.password
    port = +port.port
  }
  var store = new APIClient(port,host)
  store.setBasicAuth(
    username || config.store.username,
    password || config.store.password)
  return store
}
