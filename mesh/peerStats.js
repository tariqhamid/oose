'use strict';
/*jshint bitwise: false*/
var Collector = require('./../helpers/collector')
  , config = require('../config')
  , os = require('os')
  , ds = require('diskspace')
  , path = require('path')
  , redis = require('./../helpers/redis')

var getDiskFree = function(basket,next){
  var root = path.resolve(config.get('root'))
  //Windows needs to call with only the drive letter
  if('win32' === os.platform()) root = root.substr(0,1)
  ds.check(root,function(total,free){
    basket.diskFree = parseInt(free,10) || 0
    basket.diskTotal = parseInt(total,10) || 0
    next()
  })
}

var lastMeasure
var getCPU = function(basket,next){
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
  basket.cpuIdle = thisMeasure.idle - lastMeasure.idle
  basket.cpuTotal = thisMeasure.total - lastMeasure.total
  //set this value for next use
  lastMeasure = thisMeasure
  next()
}

var availableCapacity = function(basket,next){
  basket.availableCapacity = Math.round(
    (
      (100 * (basket.cpuIdle / basket.cpuTotal)) +
      (2 * (100 * (basket.diskFree / basket.diskTotal)))
    ) / 3
  )
  next()
}

var save = function(basket,next){
  redis.hmset('peers:' + config.get('hostname'),basket,next)
}

var peerStats = new Collector()
peerStats.use(getDiskFree)
peerStats.use(getCPU)
peerStats.use('process',availableCapacity)
peerStats.use('store',save)


/**
 * Export module
 * @type {Collector}
 */
module.exports = peerStats
