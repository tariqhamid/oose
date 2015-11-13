'use strict';
var P = require('bluebird')

var cradle = require('../helpers/couchdb')
var redis = require('../helpers/redis')


/**
 * Get list of prisms and cache the result
 * @return {P}
 */
exports.prismList = function(){
  redis.incr(redis.schema.counter('prism','prismBalance:prismList'))
  var prismKey = cradle.schema.prism()
  return cradle.db.allAsync({startKey: prismKey, endKey: prismKey + '\uffff'})
    .then(function(result){
      console.log(result)
      var promises = []
      for(var i = 0 ; i< result.length ; i++){
        promises.push(cradle.db.getAsync(result[i].key))
      }
      return P.all(promises)
    }).then(function(prisms){
      var results = []
      prisms.forEach(function(prism){
        if(prism.available && prism.active) results.push(prism)
      })
      return results
    })
}


/**
 * Store list by prism
 * @param {string} prism
 * @return {P}
 */
exports.storeListByPrism = function(prism){
  redis.incr(redis.schema.counter('prism','prismBalance:storeListByPrism'))
  var storeKey = cradle.schema.store(prism + ':')
  return cradle.db.all({startKey: storeKey, endKey: storeKey + '\uffff'})
    .then(function(result){
      var results = []
      result.forEach(function(store){
        if(store.available && store.active) results.push(store)
      })
      return results
    })
}


/**
 * Populate hits from a token
 * @param {string} token
 * @param {Array} prismList
 * @return {Array}
 */
exports.populateHits = function(token,prismList){
  redis.incr(redis.schema.counter('prism','prismBalance:populateHits'))
  var populate = function(prism){
    return function(hits){
      prism.hits = +hits
    }
  }
  var promises = []
  var prism
  for(var i = 0; i < prismList.length; i++){
    prism = prismList[i]
    promises.push(
      redis.getAsync(redis.schema.prismHits(token,prism.name))
        .then(populate(prism))
    )
  }
  return P.all(promises)
    .then(function(){
      return prismList
    })
}


/**
 * Pick a winner from a prism list
 * @param {string} token
 * @param {Array} prismList
 * @param {Array} skip
 * @param {boolean} allowFull
 * @return {P}
 */
exports.winner = function(token,prismList,skip,allowFull){
  if(undefined === allowFull) allowFull = false
  redis.incr(redis.schema.counter('prism','prismBalance:winner'))
  if(!(skip instanceof Array)) skip = []
  if(!(prismList instanceof Array)) prismList = []
  var winner = false
  return exports.populateHits(token,prismList)
    .then(function(prismList){
      var prism
      for(var i = 0; i < prismList.length; i++){
        prism = prismList[i]
        if((-1 === skip.indexOf(prism.name)) && (allowFull || prism.writable) &&
          ((!winner) || (winner.hits > prism.hits))) winner = prism
      }
      return redis.incrAsync(redis.schema.prismHits(token,winner.name))
    })
    .then(function(){
      return winner
    })
}


/**
 * Check existence of a SHA1 (cached)
 * @param {string} sha1
 * @return {P}
 */
exports.contentExists = function(sha1){
  redis.incr(redis.schema.counter('prism','prismBalance:contentExists'))
  var existsKey = cradle.schema.inventory(sha1)
  return cradle.db.getAsync(existsKey)
    .then(
      //content exists
      function(doc){
        return {
          sha1: sha1,
          exists: true,
          count: doc.exists.length,
          map: doc.exists
        }
      },
      //content doesnt exist
      function(err){
        //make sure we arent getting a different error
        if(404 !== err.headers.status) throw err
        return {
          sha1: sha1,
          exists: false,
          count: 0,
          map: []
        }
      }
    )
}
