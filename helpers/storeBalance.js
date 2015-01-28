'use strict';
var P = require('bluebird')
var oose = require('oose-sdk')

var NotFoundError = oose.NotFoundError
var redis = require('../helpers/redis')


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
  var promises = []
  var results = []
  var populate = function(){
    return function(result){
      results.push(JSON.parse(result))
    }
  }
  var store
  for(var i = 0; i < stores.length; i++){
    store = stores[i]
    promises.push(
      redis.getAsync(redis.schema.storeEntry(store))
        .then(populate(store))
    )
  }
  return P.all(promises)
    .then(function(){
      return results
    })
}


/**
 * Populate hits from a token
 * @param {string} token
 * @param {Array} stores
 * @return {Array}
 */
exports.populateHits = function(token,stores){
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
 * @return {P}
 */
exports.winnerFromExists = function(token,exists,skip){
  if(!(skip instanceof Array)) skip = []
  var candidates = exports.existsToArray(exists,skip)
  if(!candidates.length) throw new NotFoundError('No store candidates found')
  return exports.populateStores(candidates)
    .then(function(results){
      return exports.populateHits(token,results)
    })
    .then(function(results){
      return exports.pickWinner(token,results,skip)
    })
}


/**
 * Pick a winner from a prism list
 * @param {Array} storeList
 * @param {Array} skip
 * @return {P}
 */
exports.winner = function(storeList,skip){
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
 * @return {P}
 */
exports.pickWinner = function(token,storeList,skip){
  var store
  var winner = false
  if(!token) token = 'new'
  if(!(skip instanceof Array)) skip = []
  if(!(storeList instanceof Array)) storeList = []
  for(var i = 0; i < storeList.length; i++){
    store = storeList[i]
    if((-1 === skip.indexOf(store.name) && !store.full) &&
      ((!winner) || (winner.hits > store.hits))) winner = store
  }
  return redis.incrAsync(redis.schema.storeHits(token,winner.name))
    .then(function(){
      return winner
    })
}
