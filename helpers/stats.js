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

  var redisOut = {}
  var redisDataH = function(redisKey,data,key){
    redisOut[redisKey].push(key,data[key])
  }
  var redisDataZ = function(redisKey,data,key){
    // ZADD takes things 'backwards', below uses val,key
    redisOut[redisKey].push(data[key],key)
  }
  var prep = function(ref,section,redisSection,pusher){
    //convert hash to redis-acceptable array
    if('string' !== typeof redisSection) redisSection = section
    var k = s.keyGen(ref,redisSection)
    redisOut[k] = []
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
    debug('redisPushPromises:redisOut',redisOut)
    //build batch of redis promises
    var batch = []
    Object.keys(redisOut).sort().forEach(function(fKey){
      var p = fKey.split(':')
      switch(p[1]){
      case 'fs':
      case 'oD':
        batch.push(redis.remote.hmsetAsync(fKey,redisOut[fKey]))
        batch.push(redis.remote.expireAsync(fKey,86400))
        break
      case 'hU':
        batch.push(redis.remote.zaddAsync(fKey,redisOut[fKey]))
        batch.push(redis.remote.expireAsync(fKey,86400))
        break
      default:
        console.error(
          'redisPushPromises: redisOut contained unhandled section:',fKey,p
        )
      }
    })
    return batch
  }

  s.push = function(refs){
    if(!refs) refs = s.refList
    return P.try(function(){
      refs.forEach(function(ref){
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

  var redisIn = {}
  var pullKeys = []
  var pullPromise = function(redisKey){
    var rv = false
    var p = redisKey.split(':')
    switch(p[1]){
    case 'fs':
    case 'oD':
      rv = redis.remote.hscanAsync(redisKey,0)
      pullKeys.push(redisKey)
      break
    case 'hU':
      rv = redis.remote.zscanAsync(redisKey,0)
      pullKeys.push(redisKey)
      break
    default:
      console.error(
        'pullPromise: redisKey contained unhandled section:',redisKey,p
      )
    }
    return rv
  }
  var redisPullPromises = function(refs){
    if(!refs) refs = s.refList
    debug('redisPullPromises(',refs,')')
    //build batch of redis promises
    var batch = []
    refs.forEach(function(redisKey){
      batch.push(pullPromise(redisKey))
    })
    return batch
  }

  s.pull = function(refs){
    var pullChain = {}
    if(!refs){
      pullChain = P.try(function(){
          return redis.remote.keysAsync(s.keyGen('*','*'))
        })
          .then(function(result){
            debug('pullChain:',result)
            refs = result
            return P.all(redisPullPromises(refs))
          })
    } else pullChain = P.all(redisPullPromises(refs))
    return pullChain.then(function(result){
        //result = result[0]
        debug('pull(',refs,') =',result)
        var i = 0
        pullKeys.forEach(function(redisKey){
          if(!redisIn[redisKey]) redisIn[redisKey] = {}
          var subKey = ''
          var sync = false
          result[i++][1].forEach(function(j){
            switch(sync){
            case false:
              subKey = j
              break
            case true:
              redisIn[redisKey][subKey] = j
              break
            }
            sync = !sync
          })
        })
        return redisIn
      })
  }

  return s
}
