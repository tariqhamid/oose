'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:prism:guard')
var infant = require('infant')
var oose = require('oose-sdk')

var api = require('../helpers/api')
var NetworkError = oose.NetworkError
var redis = require('../helpers/redis')

var config = require('../config')
var interval
var masterUp = false

var master = api.master()

var inventoryStart = null
var userSessionListStart = null

var checkMaster = function(){
  return master.postAsync(master.url('/ping'))
    .spread(function(res,body){
      masterUp = (body && body.pong && 'pong' === body.pong)
      return redis.setAsync(redis.schema.masterUp(),masterUp ? 1 : 0)
    })
    .catch(master.handleNetworkError)
    .catch(NetworkError,function(){
      masterUp = false
      return redis.setAsync(redis.schema.masterUp(),0)
    })
}

var collectPrismList = function(){
  return master.postAsync(master.url('/prism/list'))
    .spread(function(res,body){
      debug('got prism list, record count?',body.prism.length)
      return redis.setAsync(redis.schema.prismList(),JSON.stringify(body.prism))
    })
    .catch(master.handleNetworkError)
}

var collectStoreList = function(){
  var storeList
  return master.postAsync(master.url('/store/list'))
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
    .catch(master.handleNetworkError)
}

var collectUserSessionList = function(){
  return master.postAsync({
    url: master.url('/user/session/feed'),
    json: {
      start: userSessionListStart
    }
  })
    .spread(function(res,body){
      debug('got user session list, record count?',body.length)
      var promises = []
      body.forEach(function(session){
        promises.push(
          redis.setAsync(
            redis.schema.userSession(session.token),JSON.stringify(session)))
      })
      return P.all(promises)
    })
    .then(function(){
      userSessionListStart = new Date()
    })
    .catch(master.handleNetworkError)
}

var collectInventory = function(){
  return master.postAsync({
    url: master.url('/inventory/feed'),
    json: {
      start: inventoryStart
    }
  })
    .spread(function(res,body){
      debug('got inventory list, record count?',body.length)
      var promises = []
      body.forEach(function(record){
        promises.push(
          redis.setAsync(
            redis.schema.inventory(record.sha1),JSON.stringify(record)))
      })
      return P.all(promises)
    })
    .then(function(){
      inventoryStart = new Date()
    })
    .catch(master.handleNetworkError)
}


var collect = function(){
  return checkMaster()
    .then(function(){
      if(!masterUp) throw new NetworkError('Master down')
      return P.all([
        collectPrismList(),
        collectStoreList(),
        collectUserSessionList(),
        collectInventory()
      ])
    })
    .catch(NetworkError,function(err){
      //continue as normal on a network error
      debug('network error',err)
    })
}

if(require.main === module){
  infant.child(
    'oose:' + config.prism.name + ':guard',
    function(done){
      //setup the interval for collection from master
      debug('set interval')
      interval = setInterval(collect,config.prism.guardFrequency)
      //do initial collection during startup
      debug('doing initial collection')
      collect()
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
