'use strict';
var P = require('bluebird')
var oose = require('oose-sdk')

var NotFoundError = oose.NotFoundError
var cradle = require('../helpers/couchdb')
var redis = require('../helpers/redis')


/**
 * Get list of stores by prism@
 * @param {string} prism
 * @return {P}
 */
exports.storeList = function(prism){
  redis.incr(redis.schema.counter('prism','storeBalance:storeList'))
  var storeKey = cradle.schema.store(prism + ':')
  return cradle.db.allAsync({startKey: storeKey, endKey: storeKey + '\uffff'})
    .then(function(result){
      var results = []
      result.forEach(function(store){
        if(store.available && store.active) results.push(store)
      })
      return results
    })
}


/**
 * Take an existence map and turn it into an array of store instances
 * @param {object} exists
 * @param {Array} skip
 * @return {Array}
 */
exports.existsToArray = function(exists,skip){
  if(!(skip instanceof Array)) skip = []
  var i, k
  var stores = []
  var prism, store, sk
  var pk = Object.keys(exists.map)
  for(i = 0; i < pk.length; i++){
    prism = exists.map[pk[i]]
    sk = Object.keys(prism.map)
    for(k = 0; k < sk.length; k++){
      store = prism.map[sk[k]]
      if(store && -1 === skip.indexOf(sk[k])) stores.push(sk[k])
    }
  }
  return stores
}


/**
 * Populate stores from array of names
 * @param {Array} stores
 * @return {P}
 */
exports.populateStores = function(stores){
  redis.incr(redis.schema.counter('prism','storeBalance:populateStores'))
  var promises = []
  for(var i = 0; i < stores.length; i++){
    promises.push(cradle.db.getAsync(cradle.schema.store(stores[i])))
  }
  return P.all(promises)
}


/**
 * Populate hits from a token
 * @param {string} token
 * @param {Array} stores
 * @return {Array}
 */
exports.populateHits = function(token,stores){
  redis.incr(redis.schema.counter('prism','storeBalance:populateHits'))
  var populate = function(store){
    return function(hits){
      store.hits = +hits
    }
  }
  var promises = []
  var store
  for(var i = 0; i < stores.length; i++){
    store = stores[i]
    promises.push(
      redis.getAsync(redis.schema.storeHits(token,store.name))
        .then(populate(store))
    )
  }
  return P.all(promises)
    .then(function(){
      return stores
    })
}


/**
 * Take the result of an existence check and pick a winner
 * @param {string} token
 * @param {object} exists
 * @param {Array} skip
 * @param {boolean} allowFull
 * @return {P}
 */
exports.winnerFromExists = function(token,exists,skip,allowFull){
  if(undefined === allowFull) allowFull = false
  redis.incr(redis.schema.counter('prism','storeBalance:winnerFromExists'))
  if(!(skip instanceof Array)) skip = []
  var candidates = exports.existsToArray(exists,skip)
  if(!candidates.length) throw new NotFoundError('No store candidates found')
  return exports.populateStores(candidates)
    .then(function(results){
      return exports.populateHits(token,results)
    })
    .then(function(results){
      return exports.pickWinner(token,results,skip,allowFull)
    })
}


/**
 * Pick a winner from a prism list
 * @param {Array} storeList
 * @param {Array} skip
 * @return {P}
 */
exports.winner = function(storeList,skip){
  redis.incr(redis.schema.counter('prism','storeBalance:winner'))
  var token = 'new'
  return exports.populateHits(token,storeList)
    .then(function(storeList){
      return exports.pickWinner(token,storeList,skip)
    })
}


/**
 * Pick a winner
 * @param {string} token
 * @param {array} storeList
 * @param {array} skip
 * @param {bool} allowFull
 * @return {P}
 */
exports.pickWinner = function(token,storeList,skip,allowFull){
  if(undefined === allowFull) allowFull = false
  var store
  var winner = false
  if(!token) token = 'new'
  if(!(skip instanceof Array)) skip = []
  if(!(storeList instanceof Array)) storeList = []
  for(var i = 0; i < storeList.length; i++){
    store = storeList[i]
    if((-1 === skip.indexOf(store.name) && (allowFull || store.writable)) &&
      ((!winner) || (winner.hits > store.hits))) winner = store
  }
  return redis.incrAsync(redis.schema.storeHits(token,winner.name))
    .then(function(){
      return winner
    })
}
