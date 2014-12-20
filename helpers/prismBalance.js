'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:prismBalance')

var api = require('../helpers/api')
var redis = require('../helpers/redis')

var config = require('../config')

var cache = {}


/**
 * Get list of prisms and cache the result
 * @return {P}
 */
exports.prismList = function(){
  if(cache.expires >= +new Date()){
    debug('cache hit','prism list')
    return new P(function(resolve){
      process.nextTick(function(){
        resolve(cache.prism)
      })
    })
  } else {
    debug('cache miss','prism list')
    return api.master.post('/prism/list')
      .spread(function(res,body){
        cache = {
          prism: body.prism,
          expires: +new Date() + (config.prism.prismCache * 1000)
        }
        return cache.prism
      })
  }
}


/**
 * Populate hits from a token
 * @param {string} token
 * @param {Array} prismList
 * @return {Array}
 */
exports.populateHits = function(token,prismList){
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
      redis.getAsync('hits:' + token + ':prism:' + prism.name)
        .then(populate(prism)))
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
      return redis.incrAsync('hits:' + token + ':prism:' + winner.name)
    })
    .then(function(){
      return winner
    })
}
