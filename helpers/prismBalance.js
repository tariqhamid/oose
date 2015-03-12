'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:prism:balance')

var api = require('../helpers/api')
var redis = require('../helpers/redis')

var config = require('../config')


/**
 * Get list of prisms and cache the result
 * @return {P}
 */
exports.prismList = function(){
  redis.incr(redis.schema.counter('prism','prismBalance:prismList'))
  var prismList
  return redis.getAsync(redis.schema.prismList())
    .then(function(result){
      prismList = JSON.parse(result)
      return prismList
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
        if((-1 === skip.indexOf(prism.name)) && (allowFull || !prism.full) &&
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
 * @param {boolean} hardLookup
 * @return {P}
 */
exports.contentExists = function(sha1,hardLookup){
  redis.incr(redis.schema.counter('prism','prismBalance:contentExists'))
  if(undefined === hardLookup) hardLookup = true
  var contentExists
  return redis.getAsync(redis.schema.contentExists(sha1))
    .then(function(result){
      if(!result){
        debug(sha1,'cache miss, contentExists')
        if(!hardLookup){
          debug(sha1,'hard lookup disabled, returning false')
          return false
        } else {
          var prism = api.prism(config.prism)
          debug(sha1,'sending existence check to ' + config.prism.host)
          return prism.postAsync({
            url: prism.url('/content/exists'),
            json: {sha1: sha1}
          })
            .spread(function(res,body){
              debug(sha1,'existence returned, count',body.count)
              contentExists = body
              return redis.setAsync(
                redis.schema.contentExists(sha1),JSON.stringify(contentExists))
            })
            .then(function(){
              return redis.expireAsync(
                redis.schema.contentExists(sha1),
                config.prism.contentExistsCache)
            })
            .then(function(){
              return contentExists
            })
            .catch(prism.handleNetworkError)
        }
      } else {
        debug('cache  hit, contentExists',sha1)
        contentExists = JSON.parse(result)
        return contentExists
      }
    })
}


/**
 * Invalidate cache for an existence record
 * @param {string} sha1
 * @return {P}
 */
exports.invalidateContentExists = function(sha1){
  redis.incr(
    redis.schema.counter('prism','prismBalance:invalidateContentExists'))
  var prism = api.prism(config.prism)
  return prism.postAsync({
    url: prism.url('/content/exists/invalidate'),
    json: {sha1: sha1}
  })
}


/**
 * Store list by prism
 * @param {string} prism
 * @return {P}
 */
exports.storeListByPrism = function(prism){
  redis.incr(redis.schema.counter('prism','prismBalance:storeListByPrism'))
  var storeList = []
  return redis.getAsync(redis.schema.storeList())
    .then(function(result){
      result = JSON.parse(result)
      for(var i = 0; i < result.length; i++){
        if(prism === result[i].Prism.name) storeList.push(result[i])
      }
      return storeList
    })
    .catch(SyntaxError,function(){
      return []
    })
}
