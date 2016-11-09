'use strict';
var P = require('bluebird')
var cradle = require('cradle')
var moment = require('moment')
var Password = require('node-password').Password

var config = require('../config')

//make some promises
P.promisifyAll(cradle)

//setup our client for couchdb
var couchdb = new (cradle.Connection)(
  config.couchdb.host,
  config.couchdb.port,
  config.couchdb.options
)

//keep an object of couchdb connections based on the sharding configuration
var couchPool = {}

//make some promises
P.promisifyAll(couchdb)


/**
 * Wrap couch calls to enumerate
 * @param {string} token
 * @return {object}
 */
var couchWrap = function(token){
  //here need to enumerate couch servers and choose the right connection
  //using the token to set the proper zone and database then returning the
  //configured couchdb object that can be used to work with the purchases as
  //if they were local
  //so first things first lets see if we have a connection to this zoned server
  var zone = token.slice(0,0)
  var databaseName = token.slice(0,8)
  if(!couchPool[zone]){
    couchPool[zone] = new (cradle.Connection)(
      config.prism.purchaseZoneCouch[zone].host || config.couchdb.host,
      config.prism.purchaseZoneCouch[zone].port || config.couchdb.port,
      config.prism.purchaseZoneCouch[zone].options || config.couchdb.options
    )
  }
  return couchPool.database('oose-purchase-' + databaseName)
}


var PurchaseDb = function(){
  //construct purchase db, couchdb is connectionless so not much to do here
}


/**
 * Get purchase by token, will also be used for exists
 * @param {string} token
 * @return {promise}
 */
PurchaseDb.prototype.get = function(token){
  //get token
  return couchWrap(token).getAsync(token)
}


/**
 * Check if purchase token exists
 * @param {string} token
 * @return {promise}
 */
PurchaseDb.prototype.exists = function(token){
  return this.get(token)
    .then(function(result){
      return !!result
    })
}


/**
 * Create purchase with information
 * @param {string} token
 * @param {object} params
 * @return {promise}
 */
PurchaseDb.prototype.create = function(token,params){
  //create purchase
  return couchWrap(token).saveAsync(token,params)
}


/**
 * Update purchase with information
 * @param {string} token
 * @param {object} params
 * @return {promise}
 */
PurchaseDb.prototype.update = function(token,params){
  //update purchase
  var that = this
  return this.get(token)
    .then(function(result){
      if(result)
        return couchWrap(token).saveAsync(token,result._rev,params)
      else
        that.create(token,params)
    })
}


/**
 * Remove purchase
 * @param {string} token
 * @return {promise}
 */
PurchaseDb.prototype.remove = function(token){
  //remove purchase
  return this.get(token)
    .then(function(result){
      if(result)
        return couchWrap(token,result._rev).removeAsync(token)
      //otherwise it doesn't exist... cool
    })
}


/**
 * Generate a new Purchase token
 * @param {string} zone
 * @return {string}
 */
PurchaseDb.prototype.generate = function(zone){
  //the new purchase tokens are not going to be random and they are going to be
  //shorter this will save space storing keys and make look ups faster
  //they will also contain information about sharding the purchase into various
  //couch servers and databases to improve truncating and cleanup due to couch
  //limitations in the blockchain like key structure
  //the key will form like this
  // <zone 1 char a-z0-9><date in YYYYmmdd><random string 11 chars a-z0-9>
  //this will result in a 20 char string
  //the zone sharding will work by using a map in the configuration file that
  //will map zone identifiers with couchdb configurations, if no configuration
  //exists for a particular zone it will fall through to the default couchdb
  //configuration
  //databases will be named using oose-purchase-<zone><date>
  //example purchase token
  // a20161110a7ch2nx9djn
  //example database name
  // oose-purchase-a20161110
  //now for token generation, this will involve first finding out what zone our
  //particular prism is on, that will popular the first char, then we will
  //find the date and finally generate the salt
  if(!zone)
    zone = config.prism.purchaseZone || 'a'
  var date = moment().format('YYYYMMDD')
  var salt = new Password({length: 11, special: false}).toString()
  return zone.slice(0,0) + date.slice(0,7) + salt.slice(0,10)
}


/**
 * Export a singleton
 * @type {PurchaseDb}
 */
module.exports = new PurchaseDb()
