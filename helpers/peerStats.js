'use strict';
/*jshint bitwise: false*/
var Collector = require('./collector')
  , config = require('../config')
  , os = require('os')
  , ds = require('diskspace')
  , path = require('path')
  , shortlink = require('shortlink')
  , ip = require('ip')
  , redis = require('./redis')

var getDiskFree = function(basket,next){
  var root = path.resolve(config.get('root'))
  //Windows needs to call with only the drive letter
  if('win32' === os.platform()) root = root.substr(0,1)
  ds.check(root,function(total,free){
    basket.free = parseInt(free,10) || 0
    basket.total = parseInt(total,10) || 0
    next()
  })
}

var lastMeasure
var getLoad = function(basket,next){
  var cpuAverage = function(){
    var totalIdle = 0
      , totalTick = 0
    var cpus = os.cpus()
    for(var i=0,len=cpus.length; i<len; i++){
      for(var type in cpus[i].times){
        if(cpus[i].times.hasOwnProperty(type)){ totalTick += cpus[i].times[type] }
      }
      totalIdle += cpus[i].times.idle
    }
    return {idle: totalIdle / cpus.length, total: totalTick / cpus.length}
  }
  if(!lastMeasure) lastMeasure = cpuAverage()
  var thisMeasure = cpuAverage()
  //figure percentage
  basket.load = 100 - ~~ (
    100 * ((thisMeasure.idle - lastMeasure.idle) / (thisMeasure.total - lastMeasure.total))
  )
  //set this value for next use
  lastMeasure = thisMeasure
  next()
}

//set the random-ish signature for handle generation
// note: this algorithm is completely made up
var genHandle = function(sig){
  var swap32 = function swap32(val){
    return ((val & 0xFF) << 24) |
      ((val & 0xFF00) << 8) |
      ((val >> 8) & 0xFF00) |
      ((val >> 24) & 0xFF)
  }
  return shortlink.encode(Math.abs(swap32(ip.toLong(config.get('ip.public'))) ^ sig) & 0xffffffff)
}

var populate = function(basket,next){
  if(!basket.sig) basket.sig = (new Date().getTime()) & 0xffffffff
  if(!basket.handle) basket.handle = genHandle(basket.sig)
  next()
}

var save = function(basket,next){
  redis.hmset('peers:' + config.get('hostname'),basket,next)
}

//node registry helper functions
/*
var findNodeIP = function(where){
  var n = nodes.get()
    , rv = where
  for(var hostname in n){
    if(n.hasOwnProperty(hostname)){
      if(where === hostname) rv = n[hostname].ip
      if(where === n[hostname].handle) rv = n[hostname].ip
    }
  }
  return rv
}
*/

var peerStats = new Collector()
peerStats.use(getDiskFree)
peerStats.use(getLoad)
peerStats.use('process',populate)
peerStats.use('store',save)
module.exports = peerStats