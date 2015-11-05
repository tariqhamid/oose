'use strict';
var P = require('bluebird')
var debug = null
var oose = require('oose-sdk')

var api = require('../helpers/api')
var NetworkError = oose.NetworkError
var redis = require('../helpers/redis')

var config = require('../config')
var extend = require('util')._extend;

var instance = null



/**
 * Ping Helper for Cluster Consistency
 * @param {string} type
 * @param {string} name
 * @param {number} port
 * @constructor
 */
var Pinger = function(type,name,port){
  var that = this
  var myDesc = type+':'+name+':'+port
  var master = null
  var masterUp = false
  var checkCounter = 0
  var interval = null
  var storeList = null
  var prismList = null

  var checkMaster = function(){
    return master.postAsync(master.url('/ping'))
      .spread(function(res,body){
        masterUp = (body && body.pong && 'pong' === body.pong)
        return redis.setAsync(redis.schema.masterUp(),masterUp ? 1 : 0)
      })
      .catch(function(){
        masterUp = false
        return redis.setAsync(redis.schema.masterUp(),0)
      })
  }

  var collectPrismList = function(){
    return master.postAsync(master.url('/prism/list'))
      .spread(function(res,body){
        debug('got prism list, record count?',body.prism.length)
        prismList = []
        var strPrismList = JSON.stringify(body.prism)
        if(body.prism.length){
          for(var i = 0; i<body.prism.length; i++){
            body.prism[i].request = api.prism(body.prism[i])
            body.prism[i].type = 'prism'
            prismList.push(body.prism[i])
          }
        }
        return redis.setAsync(redis.schema.prismList(),strPrismList)
        //return prismList
      })
      .catch(function(err){
        debug(err)
      })
  }

  var collectStoreList = function(){
    var srvStoreList
    return master.postAsync(master.url('/store/list'))
      .spread(function(res,body){
        debug('got store list, record count?',body.store.length)
        storeList = []
        srvStoreList = body.store
        if(body.store.length){
          for(var i = 0; i<body.store.length; i++){
            var tmpStore = extend({},body.store[i])
            tmpStore.request = api.store(tmpStore)
            tmpStore.type = 'store'
            storeList.push(tmpStore)
          }
        }
        return redis.setAsync(
          redis.schema.storeList(),
          JSON.stringify(srvStoreList)
        )
      })
      .then(function(){
        var promises = []
        var store
        for(var i = 0; i < srvStoreList.length; i++){
          store = srvStoreList[i]
          promises.push(
            redis.setAsync(redis.schema.storeEntry(store.name),
              JSON.stringify(store))
          )
        }
        return P.all(promises)
      })
      .catch(master.handleNetworkError)
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
      .catch(NetworkError,function(err){
        //continue as normal on a network error
        debug('network error',err)
      })
  }

  var downVote = function(host){
    var downHost = extend({},host)
    if(downHost.request) delete(downHost.request)
    return master.postAsync({
        url:master.url('/vote/down'),
        json: {
          host: downHost,
          caster: myDesc
        }
      })
      .spread(function(res,body){
        debug(body)
      })
      .catch(function(){

      })
  }

  var pingHost = function(host){
    debug('Pinging ' + host.name)
    return host.request.postAsync(host.request.url('/ping'))
      .spread(function(res,body){
        if(body && body.pong && 'pong' === body.pong){
          return true
        }else{
          return downVote(host)
        }
      })
      .catch(function(){
        return downVote(host)
      })
  }

  var pingAll = function(){
    var promises = []
    if(prismList && prismList.length){
      for(var i =0; i < prismList.length;i++){
        promises.push(pingHost(prismList[i]));
      }
    }
    if(storeList && storeList.length){
      for(var j =0; j < storeList.length;j++){
        promises.push(pingHost(storeList[j]));
      }
    }
    return P.all(promises)
  }

  var checkStuff = function(){
    if((checkCounter++ % 5) === 0){
      checkCounter = 1
      return collect().then(function(){
          return pingAll()
        })
        .catch(NetworkError,function(err){
          //continue as normal on a network error
          debug('network error',err)
        })
    }
    else{
      return pingAll()
    }
  }

  var createInterval = function(){
    interval = setInterval(function(){
      return checkStuff()
    },config.pingFrequency)
    return checkStuff()
  }

  that.setMaster = function(newMaster){
    master = api.master(newMaster)
    if(!interval) createInterval()
  }

  //this will start the pinger automatically if the config exists
  if(config.master) that.setMaster(config.master)
}


/**
 * Return instance of peer handler, singleton
 * @param {string} type
 * @param {string} name
 * @param {number} port
 * @return {instance}
 */
exports.getInstance = function(type,name,port){
  if(!instance){
    debug = require('debug')('oose:ping:'+type)
    instance = new Pinger(type,name,port)
  }
  return instance
}
