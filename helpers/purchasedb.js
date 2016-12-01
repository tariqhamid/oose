'use strict';
var P = require('bluebird')
var cradle = require('cradle')
var debug = require('debug')('oose:purchasedb')
var moment = require('moment')
var oose = require('oose-sdk')
var Password = require('node-password').Password
var random = require('random-js')()

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
 * Build configuration
 */
var buildConfig = function(){
  debug('building config')
  Object.keys(config.prism.purchaseZoneCouch).forEach(function(zone){
    debug('building config for zone',zone)
    var couchConfig = [
      {
        host: config.couchdb.host,
        port: config.couchdb.port,
        options: config.couchdb.options
      }
    ]
    if(
      config.prism.purchaseZoneCouch &&
      config.prism.purchaseZoneCouch[zone] instanceof Array
    ){
      couchConfig = config.prism.purchaseZoneCouch[zone]
    }
    debug('config for zone',zone,couchConfig)
    couchConfigs[zone] = couchConfig
  })
  debug('config build complete',couchConfigs)
}
buildConfig()


/**
 * Pick a couch from a zone to use
 * @param {string} zone
 * @return {Object|false}
 */
var pickCouchConfig = function(zone){
  debug('picking couch config',zone)
  if(!couchConfigs || !couchConfigs[zone]){
    debug('no configs',zone)
    return false
  }
  if(1 === couchConfigs[zone].length){
    debug('only one couch returning',zone)
    return couchConfigs[zone][0]
  }
  debug('picking couch from zonelist',zone,couchConfigs[zone])
  var winner = couchConfigs[zone][
    random.integer(0,(couchConfigs[zone].length - 1))]
  debug('winner picked',winner)
  return winner
}


/**
 * Setup replication
 * @param {array} promises
 * @param {string} databaseName
 * @param {object} couchConfig
 * @param {object} replConfig
 * @return {P}
 */
var setupReplication = function(promises,databaseName,couchConfig,replConfig){
  //verify we are not the same server as currently being used
  debug('setupReplication',databaseName,couchConfig,replConfig)
  if(
    replConfig.host === couchConfig.host &&
    replConfig.port === couchConfig.port
  )
  {
    debug('replConfig matches couchConfig returning')
    return
  }
  var couchdb = new (cradle.Connection)(
    couchConfig.host,
    couchConfig.port,
    couchConfig.options
  )
  P.promisifyAll(couchdb)
  var repldb = new (cradle.Connection)(
    replConfig.host,
    replConfig.port,
    replConfig.options
  )
  P.promisifyAll(repldb)
  debug('couchdb creating oose-purchase-' + databaseName)
  repldb.database('oose-purchase-' + databaseName)
  couchdb.database('oose-purchase-' + databaseName)
  return P.all([repldb.createAsync(),couchdb.createAsync()])
    .then(function(){
      couchdb.database('_replicator')
      debug('saving replicator from couch to repl',couchConfig,replConfig)
      return couchdb.saveAsync(
        'oose-purchase-' + databaseName + '-' +
        couchConfig.host + '->' +
        replConfig.host,
        {
          source: 'oose-purchase-' + databaseName,
          target: 'http://' + replConfig.host +
          ':' + replConfig.port + '/' +
          'oose-purchase-' + databaseName,
          continuous: true,
          use_checkpoints: true,
          checkpoint_interval: '30',
          owner: 'root'
        }
      )
    })
    .then(function(){
      repldb.database('_replicator')
      debug('saving replicator from repl to couch',replConfig,couchConfig)
      return repldb.saveAsync(
        'oose-purchase-' + databaseName + '-' +
        replConfig.host + '->' +
        couchConfig.host,
        {
          source: 'oose-purchase-' + databaseName,
          target: 'http://' + couchConfig.host + ':' +
          couchConfig.port + '/' +
          'oose-purchase-' + databaseName,
          continuous: true,
          use_checkpoints: true,
          checkpoint_interval: '30',
          owner: 'root'
        }
      )
    })
}


/**
 * Create new database based on token and a no db file error
 * @param {string} token
 * @return {P}
 */
var createDatabase = function(token){
  //the couchdb object should already be wrapped and pointed at the correct zone
  //next would involve create the database
  var databaseName = getDatabaseName(token)
  var zone = getZone(token)
  var promises = []
  debug('create database',token,zone,databaseName)
  couchConfigs[zone].forEach(function(couchConfig){
    couchConfigs[zone].forEach(function(replConfig){
      setupReplication(promises,databaseName,couchConfig,replConfig)
    })
  })
  debug('promises set for creation',databaseName,promises)
  return P.all(promises)
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
  var couchConfig = pickCouchConfig(zone)
  if(!couchConfig) return null
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
 * Get purchase by token, will also be used for exists
 * @param {string} token
 * @return {promise}
 */
PurchaseDb.prototype.get = function(token){
  //get token
  var couchdb
  return P.try(function(){
    debug(token,'get')
    couchdb = couchWrap(token)
    debug(token,'couch wrapped')
    if(!couchdb) throw new UserError('Could not validate purchase token')
    return couchdb.getAsync(token)
  })
    .then(function(result){
      debug(token,'get result',result)
      return result
    })
    .catch(function(err){
      debug(token,'get error',err)
      if(!err.headers || !err.headers.status) throw err
      else if(404 === err.headers.status &&
        ('Database does not exist.' === err.reason ||
        'no_db_file' === err.reason)
      ){
        debug(token,'creating database for get')
        return createDatabase(token)
          .then(function(){
            debug(token,'database created reattempted get')
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
  debug(token,'exists')
  return this.get(token)
    .then(function(result){
      debug(token,'exists result',result)
      return !!result
    })
    .catch(function(err){
      debug(token,'exists error',err)
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
  debug(token,'create')
  return P.try(function(){
    couchdb = couchWrap(token)
    if(!couchdb) throw new UserError('Could not validate purchase token')
    debug(token,'couch wrapped')
    return couchdb.saveAsync(token,params)
  })
    .then(function(result){
      debug(token,'create result',result)
      return result
    })
    .catch(function(err){
      debug(token,'create error',err)
      if(!err.headers || !err.headers.status) throw err
      else if(404 === err.headers.status &&
        ('Database does not exist.' === err.reason ||
        'no_db_file' === err.reason)
      ){
        debug(token,'creating database for create',params)
        return createDatabase(token)
          .then(function(){
            debug(token,'database created reattempt create',params)
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
  debug(token,'update')
  return P.try(function(){
    couchdb = couchWrap(token)
    if(!couchdb) throw new UserError('Could not validate purchase token')
    debug(token,'couch wrapped getting')
    return that.get(token)
  })
    .then(function(result){
      if(result){
        debug(token,'update result received, udpating',result,params)
        return couchdb.saveAsync(token,result._rev,params)
      } else{
        debug(token,'doesnt exist, creating',result,params)
        that.create(token,params)
      }
    })
    .catch(function(err){
      debug(token,'update error',err)
      if(!err.headers || !err.headers.status) throw err
      else if(404 === err.headers.status &&
        ('Database does not exist.' === err.reason ||
        'no_db_file' === err.reason)
      ){
        debug(token,'creating database for update',params)
        return createDatabase(token)
          .then(function(){
            debug(token,'database created reattempted update',params)
            return that.create(token,params)
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
  debug(token,'remove')
  return this.get(token)
    .then(function(result){
      debug(token,'remove result',result)
      if(result){
        debug(token,'remove exists, removing')
        return couchWrap(token).removeAsync(token,result._rev)
      } else {
        debug(token,'remove doesnt exist do nothing')
        //otherwise it doesn't exist... cool
      }
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
  var token = zone.slice(0,1) + date.slice(0,8) + salt.slice(0,11)
  debug('generated token',token)
  return token
}


/**
 * Export a singleton
 * @type {PurchaseDb}
 */
module.exports = new PurchaseDb()
