'use strict';
var P = require('bluebird')
var debug = require('debug')('helper:stat')

var config = require('../config')

var redisHelper = require('../helpers/redis')
var redis = {
  'local': redisHelper(config.redis),
  'remote': redisHelper(config.stats.redis)
}


/**
 * Export client constructor
 * @param {object} options
 * @return {function} constructor
 */
module.exports = function(options){
  var s = {}
  s.config = ('object' === typeof options) ? options : config.stats
  /*jshint bitwise: false*/
  s.timeStamp = ((+new Date())/1000) | 0
  // stats Object.keys are ref (storeName, prismName, etc)
  //  with sub-Object.keys as section, then user-defined data
  s.stats = {}
  s.refList = []
  s.refCount = 0

  s.keyGen = function(ref,section){
    var rv = [ref,section,s.timeStamp].join(':')
    debug('keyGen(',ref,',',section,') =',rv)
    return rv
  }

  s.set = function(ref,section,data){
    debug('set(',ref,',',section,',',data,')')
    if(!(ref in s.stats)){
      s.stats[ref] = {}
      s.refList = (Object.keys(s.stats)).sort()
      s.refCount = +(s.refList.length)
    }
    if(!(section in s.stats[ref])){
      s.stats[ref][section] = null
    }
    s.stats[ref][section] = data
  }

  s.get = function(ref,section){
    var rv = false
    if((ref in s.stats) && (section in s.stats[ref])){
      rv = s.stats[ref][section]
    }
    debug('get(',ref,',',section,') =',rv)
    return rv
  }

  var redisData = {}
  var redisDataH = function(redisKey,data,key){
    redisData[redisKey].push(key,data[key])
  }
  var redisDataZ = function(redisKey,data,key){
    // ZADD takes things 'backwards', below uses val,key
    redisData[redisKey].push(data[key],key)
  }
  var prep = function(ref,section,redisSection,pusher){
    //convert hash to redis-acceptable array
    if('string' !== typeof redisSection) redisSection = section
    var k = s.keyGen(ref,redisSection)
    redisData[k] = []
    var d = s.get(ref,section)
    Object.keys(d).sort().forEach(function(l){
      pusher(k,d,l)
    })
  }
  var prepHMSET = function(ref,section,redisSection){
    //stack the args for HMSET (convert hash to array)
    prep(ref,section,redisSection,redisDataH)
  }
  var prepZADD = function(ref,section,redisSection){
    //stack the args for ZADD (convert hash to array)
    prep(ref,section,redisSection,redisDataZ)
  }
  var redisPushPromises = function(){
    debug('redisPushPromises:redisData',redisData)
    //build batch of redis promises
    var batch = []
    Object.keys(redisData).sort().forEach(function(fKey){
      var p = fKey.split(':')
      switch(p[1]){
      case 'fs':
      case 'oD':
        batch.push(redis.remote.hmsetAsync(fKey,redisData[fKey]))
        batch.push(redis.remote.expireAsync(fKey,86400))
        break
      case 'hU':
        batch.push(redis.remote.zaddAsync(fKey,redisData[fKey]))
        batch.push(redis.remote.expireAsync(fKey,86400))
        break
      default:
        console.error(
          'redisPushPromises: redisData contained unhandled section:',fKey,p
        )
      }
    })
    return batch
  }

  s.push = function(){
    //jam shit in redis here
    return P.try(function(){
      s.refList.forEach(function(ref){
        if('API' === ref){ //API Global stat
          //OOSE section
          prepHMSET(ref,'ooseData','oD')
        } else { //Store Specific stat
          //FS section
          prepHMSET(ref,'fs')
          //HASH section
          prepZADD(ref,'hashUsage','hU')
        }
      })
      //build and run the actual batch of redis promises
      return P.all(redisPushPromises())
    })
  }

  return s
}
