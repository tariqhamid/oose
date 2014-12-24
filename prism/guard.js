'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:prism:guard')
var infant = require('infant')

var api = require('../helpers/api')
var NetworkError = require('../helpers/NetworkError')
var redis = require('../helpers/redis')

var config = require('../config')
var interval
var masterUp = false

var master = api.master()

var checkMaster = function(){
  return master.postAsync(master.url('/ping'))
    .spread(function(res,body){
      masterUp = (body && body.pong && 'pong' === body.pong)
      return redis.setAsync(redis.schema.masterUp(),masterUp ? 1 : 0)
    })
    .catch(NetworkError,function(){
      masterUp = false
      return redis.setAsync(redis.schema.masterUp(),0)
    })
}

var collectPrismList = function(){
  return master.postAsync({url: master.url('/prism/list')})
    .spread(function(res,body){
      debug('got prism list, record count?',body.prism.length)
      return redis.setAsync(redis.schema.prismList(),JSON.stringify(body.prism))
    })
}

var collectStoreList = function(){
  var storeList
  return master.postAsync({url: master.url('/store/list')})
    .spread(function(res,body){
      debug('got store list, record count?',body.store.length)
      storeList = body.store
      return redis.setAsync(redis.schema.storeList(),JSON.stringify(storeList))
    })
    .then(function(){
      var promises = []
      var store
      for(var i = 0; i < storeList.length; i++){
        store = storeList[i]
        promises.push(
          redis.setAsync(redis.schema.storeEntry(store.name),
            JSON.stringify(store))
        )
      }
      return P.all(promises)
    })
}

var collect = function(){
  return checkMaster()
    .then(function(){
      if(!masterUp) throw new NetworkError('Master down')
      return P.all([
        collectPrismList(),
        collectStoreList()
      ])
    })
    .catch(NetworkError,function(){
      //continue as normal on a network error
    })
}

if(require.main === module){
  infant.child(
    'oose:' + config.prism.name + ':guard',
    function(done){
      //setup the interval for collection from master
      redis.removeKeysPattern(redis.schema.flushKeys())
        .then(function(){
          debug('set interval')
          interval = setInterval(collect,config.prism.guardFrequency)
          //do initial collection during startup
          debug('doing initial collection')
          return collect()
        })
        .then(function(){
          debug('initial collection complete')
          done()
        })
    },
    function(done){
      clearInterval(interval)
      debug('cleared interval')
      process.nextTick(done)
    }
  )
}
