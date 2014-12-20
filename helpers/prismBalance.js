'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:prismBalance')

var api = require('../helpers/api')
var redis = require('../helpers/redis')

var config = require('../config')


/**
 * Get list of prisms and cache the result
 * @return {P}
 */
exports.prismList = function(){
  var prismList
  return redis.getAsync(redis.schema.prismList())
    .then(function(result){
      if(!result){
        debug('cache miss',redis.schema.prismList())
        return api.master.post('/prism/list')
          .spread(function(res,body){
            prismList = body.prism
            return redis.setAsync(
              redis.schema.prismList(),JSON.stringify(prismList))
          })
          .then(function(){
            return redis.expireAsync(
              redis.schema.prismList(),config.prism.cache.prismList)
          })
          .then(function(){
            return prismList
          })
      } else {
        debug('cache hit',redis.schema.prismList())
        prismList = JSON.parse(result)
        return prismList
      }
    })
}


/**
 * Populate hits from a token
 * @param {string} token
 * @param {Array} prismList
 * @return {Array}
 */
exports.populateHits = function(token,prismList){
  var promises = []
  prismList.forEach(function(prism){
    promises.push(
      redis.getAsync(redis.schema.prismHits(token,prism.name))
        .then(function(hits){
          prism.hits = +hits
        })
    )
  })
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
 * @return {P}
 */
exports.winner = function(token,prismList,skip){
  if(!(skip instanceof Array)) skip = []
  if(!(prismList instanceof Array)) prismList = []
  var winner = false
  return exports.populateHits(token,prismList)
    .then(function(prismList){
      var prism
      for(var i = 0; i < prismList.length; i++){
        prism = prismList[i]
        if(-1 !== skip.indexOf(prism.name)) continue
        if(!winner){
          winner = prism
          continue
        }
        if(winner.hits > prism.hits){
          winner = prism
        }
      }
      return redis.incrAsync(redis.schema.prismHits(token,prism.name))
    })
    .then(function(){
      return winner
    })
}


/**
 * Check existenced of a SHA1 (cached)
 * @param {string} sha1
 * @return {P}
 */
exports.contentExists = function(sha1){
  var contentExists
  return redis.getAsync(redis.schema.contentExists(sha1))
    .then(function(result){
      if(!result){
        debug('cache miss, contentExists',sha1)
        return api.prism(config.prism).post('/content/exists',{sha1: sha1})
          .spread(function(res,body){
            contentExists = body
            return redis.setAsync(
              redis.schema.contentExists(sha1),JSON.stringify(contentExists))
          })
          .then(function(){
            return redis.expireAsync(
              redis.schema.contentExists(sha1),config.prism.contentExistsCache)
          })
          .then(function(){
            return contentExists
          })
      } else {
        debug('cache  hit, contentExists',sha1)
        contentExists = JSON.parse(result)
        return contentExists
      }
    })
}
