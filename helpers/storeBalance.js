'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:storeBalance')

var api = require('../helpers/api')
var NotFoundError = require('../helpers/NotFoundError')
var redis = require('../helpers/redis')

var config = require('../config')

var cache = {}


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
  var result = []
  var populate = function(res,body){
    cache[body.name] = {
      store: body,
      expires: +new Date() + (config.prism.storeCache * 1000)
    }
    result.push(cache[body.name].store)
  }
  var populateFromCache = function(store){
    return new P(function(resolve){
      process.nextTick(function(){
        result.push(cache[store].store)
        resolve()
      })
    })
  }
  var promises = []
  var store
  for(var i = 0; i < stores.length; i++){
    store = stores[i]
    if(cache[store] && cache[store].expires >= +new Date()){
      debug('cache hit',store)
      promises.push(populateFromCache(store))
    } else{
      debug('cache miss',store)
      promises.push(
        api.master.post('/store/find',{name: store}).spread(populate))
    }
  }
  return P.all(promises)
    .then(function(){
      return result
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
      redis.getAsync('hits:' + token + ':' + store.name).then(populate(store)))
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
  var candidates = exports.existsToArray(exists,skip)
  var winner
  if(!candidates.length) throw new NotFoundError('No store candidates found')
  return exports.populateStores(candidates)
    .then(function(results){
      return exports.populateHits(token,results)
    })
    .then(function(results){
      var store
      for(var i = 0; i < results.length; i++){
        store = results[i]
        if(!winner){
          winner = store
          continue
        }
        if(store.hits < winner.hits){
          winner = store
        }
      }
      return redis.incrAsync('hits:' + token + ':' + winner.name)
    })
    .then(function(){
      return winner
    })
}


/**
 * Pick a winner from a prism list
 * @param {Array} storeList
 * @param {Array} skip
 * @return {P}
 */
exports.winner = function(storeList,skip){
  if(!(skip instanceof Array)) skip = []
  if(!(storeList instanceof Array)) storeList = []
  var token = 'new'
  var winner = false
  return exports.populateHits(token,storeList)
    .then(function(storeList){
      var store
      for(var i = 0; i < storeList.length; i++){
        store = storeList[i]
        if(-1 !== skip.indexOf(store.name)) continue
        if(!winner){
          winner = store
          continue
        }
        if(winner.hits > store.hits){
          winner = store
        }
      }
      return redis.incrAsync('hits:' + token + ':' + winner.name)
    })
    .then(function(){
      return winner
    })
}
