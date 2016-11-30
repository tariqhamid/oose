'use strict';
var P = require('bluebird')
var cradle = require('cradle')
var moment = require('moment')
var oose = require('oose-sdk')
var Password = require('node-password').Password

var UserError = oose.UserError

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

//keep an object of configurations relation to the pool
var couchConfigs = {}

//make some promises
P.promisifyAll(couchdb)


/**
 * Get Zone from Token
 * @param {string} token
 * @return {string}
 */
var getZone = function(token){
  return token.slice(0,1)
}


/**
 * Get database name from token
 * @param {string} token
 * @return {string}
 */
var getDatabaseName = function(token){
  return token.slice(0,9)
}


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
  if(!token.match(/^[a-z]{1}[0-9]{8}/))
    return null
  var now = new Date()
  var year = +token.slice(1,5)
  if(year !== now.getFullYear() && year !== (now.getFullYear() -1))
    return null
  var zone = getZone(token)
  var databaseName = getDatabaseName(token)
  var couchConfig = couchConfigs[zone]
  if(!couchConfig){
    couchConfig = {
      host: config.couchdb.host,
      port: config.couchdb.port,
      options: config.couchdb.options
    }
    if(config.prism.purchaseZoneCouch &&
      config.prism.purchaseZoneCouch[zone] instanceof Array){
      if(config.prism.purchaseZoneCouch[zone][0].host){
        couchConfig.host = config.prism.purchaseZoneCouch[zone][0].host
      }
      if(config.prism.purchaseZoneCouch[zone][0].port){
        couchConfig.port = config.prism.purchaseZoneCouch[zone][0].port
      }
      if(config.prism.purchaseZoneCouch[zone][0].options){
        couchConfig.options = config.prism.purchaseZoneCouch[zone][0].options
      }
      //finally activate replication scaffold automation
      couchConfig.secondary = config.prism.purchaseZoneCouch[zone][1]
    } else if(config.prism.purchaseZoneCouch &&
      'object' === typeof config.prism.purchaseZoneCouch[zone]){
      if(config.prism.purchaseZoneCouch[zone].host){
        couchConfig.host = config.prism.purchaseZoneCouch[zone].host
      }
      if(config.prism.purchaseZoneCouch[zone].port){
        couchConfig.port = config.prism.purchaseZoneCouch[zone].port
      }
      if(config.prism.purchaseZoneCouch[zone].options){
        couchConfig.options = config.prism.purchaseZoneCouch[zone].options
      }
    }
    couchConfigs[zone] = couchConfig
  }
  couchPool[zone] = new (cradle.Connection)(
    couchConfig.host,
    couchConfig.port,
    couchConfig.options
  )
  return couchPool[zone].database('oose-purchase-' + databaseName)
}


var PurchaseDb = function(){
  //construct purchase db, couchdb is connectionless so not much to do here
}


/**
 * Create new database based on token and a no db file error
 * @param {object} couchdb
 * @param {string} token
 * @return {P}
 */
PurchaseDb.prototype.createDatabase = function(couchdb,token){
  //the couchdb object should already be wrapped and pointed at the correct zone
  //next would involve create the database
  return couchdb.createAsync()
    .then(function(){
      //next we need to create this database on the secondary which
      //we need to look up by
      var zone = getZone(token)
      var databaseName = getDatabaseName(token)
      if(!couchConfigs[zone].secondary){
        return
      }
      var couchdb2 = new (cradle.Connection)(
        couchConfigs[zone].secondary.host,
        couchConfigs[zone].secondary.port,
        couchConfigs[zone].secondary.options
      )
      couchdb2.database('oose-purchase-' + databaseName)
      return couchdb2.createAsync()
        .then(function(){
          //finally we need to establish replication
          return P.all([
            function(){
              //from primary -> secondary
              couchdb.database('_replicator')
              return couchdb.saveAsync(
                'oose-purchase-' +
                couchConfigs[zone].host + '->' +
                couchConfigs[zone].secondary.host,
                {
                  source: 'oose-purchase-' + databaseName,
                  target: 'http://' + couchConfigs[zone].secondary.host +
                    ':' + couchConfigs[zone].secondary.port + '/' +
                    'oose-purchase-' + databaseName,
                  continuous: true,
                  use_checkpoints: true,
                  checkpoint_interval: '30',
                  owner: 'root'
                }
              )
                .then(function(){
                  couchdb.database('oose-purchase-' + databaseName)
                })
            },
            function(){
              //from secondary -> primary
              couchdb2.database('_replicator')
              return couchdb2.saveAsync(
                'oose-purchase-' +
                couchConfigs[zone].secondary.host + '->' +
                couchConfigs[zone].host,
                {
                  source: 'oose-purchase-' + databaseName,
                  target: 'http://' + couchConfigs[zone].host + ':' +
                    couchConfigs[zone].port + '/' +
                    'oose-purchase-' + databaseName,
                  continuous: true,
                  use_checkpoints: true,
                  checkpoint_interval: '30',
                  owner: 'root'
                }
              )
                .then(function(){
                  couchdb2.database('oose-purchase-' + databaseName)
                })
            }
          ])
        })
    })
}


/**
 * Get purchase by token, will also be used for exists
 * @param {string} token
 * @return {promise}
 */
PurchaseDb.prototype.get = function(token){
  //get token
  var couchdb
  var that = this
  return P.try(function(){
    couchdb = couchWrap(token)
    if(!couchdb) throw new UserError('Could not validate purchase token')
    return couchdb.getAsync(token)
  })
    .catch(function(err){
      if(!err.headers || !err.headers.status) throw err
      else if(404 === err.headers.status &&
        ('Database does not exist.' === err.reason ||
        'no_db_file' === err.reason)
      ){
        return that.createDatabase(couchdb,token)
          .then(function(){
            return couchdb.getAsync(token)
          })
      } else throw err
    })
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
    .catch(function(){
      return false
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
  var couchdb
  var that
  return P.try(function(){
    couchdb = couchWrap(token)
    if(!couchdb) throw new UserError('Could not validate purchase token')
    return couchdb.saveAsync(token,params)
  })
    .catch(function(err){
      if(!err.headers || !err.headers.status) throw err
      else if(404 === err.headers.status &&
        ('Database does not exist.' === err.reason ||
        'no_db_file' === err.reason)
      ){
        return that.createDatabase(couchdb,token)
          .then(function(){
            return couchdb.saveAsync(token,params)
          })
      } else throw err
    })
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
  var couchdb
  return P.try(function(){
    couchdb = couchWrap(token)
    if(!couchdb) throw new UserError('Could not validate purchase token')
    return that.get(token)
  })
    .then(function(result){
      if(result)
        return couchdb.saveAsync(token,result._rev,params)
      else
        that.create(token,params)
    })
    .catch(function(err){
      if(!err.headers || !err.headers.status) throw err
      else if(404 === err.headers.status &&
        ('Database does not exist.' === err.reason ||
        'no_db_file' === err.reason)
      ){
        return that.createDatabase(couchdb,token)
          .then(function(){
            return couchdb.saveAsync(token,params)
          })
      } else throw err
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
  return zone.slice(0,1) + date.slice(0,8) + salt.slice(0,11)
}


/**
 * Export a singleton
 * @type {PurchaseDb}
 */
module.exports = new PurchaseDb()
