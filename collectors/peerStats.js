'use strict';
/*jshint bitwise: false*/
var Collector = require('../helpers/collector')
  , redis = require('../helpers/redis')
  , logger = require('../helpers/logger').create('collector:peerStats')
  , config = require('../config')
  , os = require('os')
  , ds = require('diskspace')
  , path = require('path')
  , snmp = require('snmp-native')
  , async = require('async')

var session = new snmp.Session({community: 'esitedllc'})
var snmpNetOID = config.get('snmp.interface.public')

var getDiskFree = function(basket,next){
  var root = path.resolve(config.get('root'))
  //Windows needs to call with only the drive letter
  if('win32' === os.platform()) root = root.substr(0,1)
  ds.check(root,function(total,free){
    basket.diskFree = parseInt(free,10) || 0
    basket.diskTotal = parseInt(total,10) || 0
    next(null,basket)
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
  basket.cpuIdle = (thisMeasure.idle - lastMeasure.idle) || 100
  basket.cpuTotal = (thisMeasure.total - lastMeasure.total) || 100
  //set this value for next use
  lastMeasure = thisMeasure
  next(null,basket)
}

var getMemory = function(basket,next){
  basket.memoryFree = os.freemem()
  basket.memoryTotal = os.totalmem()
  next(null,basket)
}

var getServices = function(basket,next){
  //services
  basket.services = ''
  if(config.get('mesh.enabled')) basket.services += ',mesh'
  if(config.get('supervisor.enabled')) basket.services += ',supervisor'
  if(config.get('store.enabled')) basket.services += ',store'
  if(config.get('prism.enabled')) basket.services += ',prism'
  if(config.get('shredder.enabled')) basket.services += ',shredder'
  if(config.get('gump.enabled')) basket.services += ',gump'
  if(config.get('lg.enabled')) basket.services += ',lg'
  //service ports
  var servicePorts = {}
  if(config.get('store.enabled')){
    servicePorts.import = config.get('store.import.port')
    servicePorts.export = config.get('store.export.port')
  }
  if(config.get('prism.enabled')){
    servicePorts.prism = config.get('prism.port')
  }
  basket.servicePorts = JSON.stringify(servicePorts)
  next(null,basket)
}

var previousNet = {
  in: 0,
  out: 0,
  lastCollected: 0
}

var getNetwork = function(basket,next){
  var net = {
    speed: 0,
    in: 0,
    out: 0
  }
  async.parallel(
    [
      //get speed
      function(next){
        session.get({oid: '.1.3.6.1.2.1.2.2.1.5.' + snmpNetOID},function(err,result){
          if(err) return next(err)
          net.speed = result[0].value
          next()
        })
      },
      //get in counter
      function(next){
        session.get({oid: '.1.3.6.1.2.1.2.2.1.10.' + snmpNetOID},function(err,result){
          if(err) return next(err)
          net.in = result[0].value
          next()
        })
      },
      //get out counter
      function(next){
        session.get({oid: '.1.3.6.1.2.1.2.2.1.16.' + snmpNetOID},function(err,result){
          if(err) return next(err)
          net.out = result[0].value
          next()
        })
      }
    ],
    function(err){
      if(err) return next(err)
      var stats = {
        inBps: 0,
        outBps: 0
      }
      var now = new Date().getTime()
      var window = (now - previousNet.lastCollected) / 1000
      if(0 !== previousNet.lastCollected){
        stats.inBps = (net.in - previousNet.in) / window
        stats.outBps = (net.out - previousNet.out) / window
      }
      previousNet.in = net.in
      previousNet.out = net.out
      previousNet.lastCollected = now
      basket.net = JSON.stringify({
        speed: net.speed,
        inBps: stats.inBps,
        outBps: stats.outBps
      })
      next(null,basket)
    }
  )


}

var availableCapacity = function(basket,next){
  basket.availableCapacity = Math.round(
    (
      (100 * (basket.cpuIdle / basket.cpuTotal)) +
      (2 * (100 * (basket.diskFree / basket.diskTotal)))
    ) / 3
  )
  next(null,basket)
}

var save = function(basket,next){
  redis.hmset('peer:db:' + config.get('hostname'),basket,function(err){
    if(err) next(err)
    else next(null,basket)
  })
}

var peerStats = new Collector()
peerStats.collect(getDiskFree)
peerStats.collect(getCPU)
peerStats.collect(getMemory)
peerStats.collect(getServices)
peerStats.collect(getNetwork)
peerStats.process(availableCapacity)
peerStats.save(save)
peerStats.on('error',logger.warn)


/**
 * Export module
 * @type {Collector}
 */
module.exports = peerStats
