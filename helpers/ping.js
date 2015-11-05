'use strict';
var P = require('bluebird')
var debug = null
var infant = require('infant')
var oose = require('oose-sdk')
var request = require('request')

var api = require('../helpers/api')
var NetworkError = oose.NetworkError
var redis = require('../helpers/redis')

var config = require('../config')
var extend = require('util')._extend;

var instance = null

//make some promises
P.promisifyAll(request)


var pinger = function(type,name,port){
  var that = this
  var myDesc = type+":"+name+":"+port
  var master = null
  var masterUp = false
  var checkCounter = 0
  var interval = null
  var storeList = null
  var prismList = null

  that.setMaster = function(newMaster){
    master = api.master(newMaster)
    if(!interval) createInterval()
  }

  var checkMaster = function(){

    return master.postAsync(master.url('/ping'))
      .spread(function(res,body){
        /*var result= (body)?JSON.parse(body):false
        masterUp = (result && result.pong && 'pong' === result.pong)*/
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
        if(body.prism.length){
          for(var i = 0 ; i<body.prism.length; i++){
            body.prism[i].request = api.prism(body.prism[i])
            body.prism[i].type = "prism"
            prismList.push(body.prism[i])
          }
        }

        return prismList
      })
      .catch(function(err){
        debug(err)
      })
  }

  var collectStoreList = function(){
    //var storeList
    return master.postAsync(master.url('/store/list'))
      .spread(function(res,body){
        debug('got store list, record count?',body.store.length)
        storeList = []
        if(body.store.length){
          for(var i = 0 ; i<body.store.length; i++){
            body.store[i].request = api.store(body.store[i])
            body.store[i].type = "store"
            storeList.push(body.store[i])
          }
        }
        return storeList
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

        ])
      })
      .catch(NetworkError,function(err){
        //continue as normal on a network error
        debug('network error',err)
      })
  }

  var checkStuff = function(){
    if((checkCounter++%5) == 0){
      checkCounter=1
      return collect().then(function(){
        return pingAll()
      })
      .catch(NetworkError,function(err){
        //continue as normal on a network error
        debug('network error',err)
      })
    }else{
      return pingAll()
    }
  }

  var createInterval = function(){
    interval = setInterval(function(){
      return checkStuff()
    },config.pingFrequency)
  }

  var downVote = function(host){
    var downHost = extend({},host)
    if(downHost.request) delete(downHost.request)
    return master.postAsync({
      url:master.url('/vote/downvote'),
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
    debug("Pinging " + host.name)
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
      for(var i =0 ; i < prismList.length;i++){
        promises.push(pingHost(prismList[i]));
      }
    }
    if(storeList && storeList.length){
      for(var i =0 ; i < storeList.length;i++){
        promises.push(pingHost(storeList[i]));
      }
    }

    return P.all(promises)
  }

  if(config.master)that.setMaster(config.master)
}


/**
 * Return instance of peer handler, singleton
 * @return {instance}
 */
exports.getInstance = function(type,name,port){
  if(!instance){
    instance = new pinger(type,name,port)
    debug=require('debug')('oose:ping:'+type)
  }
  return instance

}
