'use strict';
/*jshint bitwise: false*/
var Collector = require('../helpers/collector')
  , redis = require('../helpers/redis')
  , logger = require('../helpers/logger').create('collector:peerStats')
  , config = require('../config')
  , os = require('os')
  , ds = require('diskspace')
  , path = require('path')
  , snmp = require('../helpers/SNMPClient')
  , async = require('async')

var snmpSession = snmp.createSession()

var ifInfo = {
  index: false,
  name: 'ERROR',
  ip: false,
  speed: 0,
  in: 0,
  out: 0,
  previous: {
    in: 0,
    out: 0
  },
  lastUpdate: 0
}

var getNetwork = function(basket,next){
  async.series(
    [
      //detect our interface index by tracing the default route
      // RFC1213-MIB::ipRouteIfIndex.0.0.0.0
      function(next){
        snmpSession.get([snmp.mib.defaultRoute],function(err,result){
          if(err) return next(err)
          if(!result || !result[0]) return next('No result for ifIndex')
          ifInfo.index = result[0].value
          next()
        })
      },
      //get interface stats
      function(next){
        snmpSession.get(
          [
            //get useful name from IF-MIB::ifAlias.<ifIndex>
            snmp.mib.ifName(ifInfo.index),
            //get speed from IF-MIB::ifSpeed.<ifIndex>
            snmp.mib.ifSpeed(ifInfo.index),
            //get in counter from IF-MIB::ifInOctets.<ifIndex>
            snmp.mib.ifInOctets(ifInfo.index),
            //get out counter from IF-MIB::ifOutOctets.<ifIndex>
            snmp.mib.ifOutOctets(ifInfo.index)
          ],
          function(err,result){
            if(err) return next(err)
            if(!result || 4 !== result.length) return next('No result for interface statistics')
            ifInfo.name = result[0].value.toString()
            ifInfo.speed = result[1].value
            ifInfo.in = result[2].value
            ifInfo.out = result[3].value
            next()
          }
        )
      },
      function(next){
        var interfaces = os.networkInterfaces()
        var filter = function(address){
          if('IPv4' === address.family && !address.internal && !ifInfo.ip)
            ifInfo.ip = address.address
        }
        for(var i in interfaces){
          if(interfaces.hasOwnProperty(i))
            interfaces[i].forEach(filter)
        }
        next()
      }
    ],
    function(err){
      if(err) return next(err)
      //save info to basket
      basket.netIndex = ifInfo.index
      basket.netName = ifInfo.name
      basket.netSpeed = ifInfo.speed
      basket.netIp = ifInfo.ip
      basket.netIn = ifInfo.in
      basket.netOut = ifInfo.out
      next(null,basket)
    }
  )
}


/**
 * Get disk byte used/free for whichever disk contains the root
 * @param {object} basket Collector basket
 * @param {function} next Callback
 */
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

var getCPU = function(basket,next){
  var cpuUsed = 0
  var cpuCount = 0
  async.series(
    [
      function(next){
        snmpSession.getBulk([snmp.mib.cpuLoadTable],function(err,result){
          if(err) return next(err)
          if(!result || !result[0] || !result[0].length) return next('Could not get CPU statistics from SNMP')
          cpuCount = result[0].length
          result[0].forEach(function(item){
            cpuUsed += item.value
          })
          cpuUsed = cpuUsed / cpuCount
          next()
        })
      }
    ],
    function(err){
      if(err) return next(err)
      basket.cpuUsed = cpuUsed
      basket.cpuCount = cpuCount
      next(null,basket)
    }
  )
}

var getMemory = function(basket,next){
  var memoryIndex
  async.series(
    [
      //get memory index from hrStorageTable
      function(next){
        snmpSession.getBulk([snmp.mib.hrStorageTable],function(err,result){
          if(err) return next(err)
          if(!result || !result[0]) return next('Could not look up memory index')
          result[0].forEach(function(item){
            if(
              item.value &&
              item.value instanceof Buffer &&
              item.value.toString().match(/physical memory/i) &&
              !memoryIndex
            ){
              memoryIndex = item.oid.split('.').pop()
            }
          })
          next()
        })
      },
      function(next){
        snmpSession.get(
          [
            snmp.mib.memoryAllocationUnit(memoryIndex),
            snmp.mib.memorySize(memoryIndex),
            snmp.mib.memoryUsed(memoryIndex)
          ],
          function(err,result){
            if(err) return next(err)
            if(!result || 3 !== result.length) return next('Could not get memory info from SNMP')
            basket.memoryTotal = result[0].value * result[1].value
            basket.memoryFree = result[0].value * result[2].value
            next()
          }
        )
      }
    ],
    function(err){
      if(err) return next(err)
      next(null,basket)
    }
  )
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
  if(config.get('store.enabled')){
    basket.portImport = config.get('store.import.port')
    basket.portExport = config.get('store.export.port')
  }
  if(config.get('prism.enabled')){
    basket.portPrism = config.get('prism.port')
  }
  basket.portMesh = config.get('mesh.port')
  next(null,basket)
}

var networkStats = function(basket,next){
  var stats = {
    inBps: 0,
    outBps: 0
  }
  var now = new Date().getTime()
  if(0 !== ifInfo.lastUpdate){
    var window = (now - ifInfo.lastUpdate) / 1000
    stats.inBps = (basket.netIn - ifInfo.previous.in) / window
    stats.outBps = (basket.netOut - ifInfo.previous.out) / window
  }
  ifInfo.previous.in = basket.netIn
  ifInfo.previous.out = basket.netOut
  ifInfo.lastUpdate = now
  basket.netInBps = stats.inBps
  basket.netOutBps = stats.outBps
  basket.netLastUpdate = now
  next(null,basket)
}

var availableCapacity = function(basket,next){
  basket.availableCapacity = Math.round(
    (
      (basket.cpuUsed) +
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
peerStats.collect(getCPU)
peerStats.collect(getNetwork)
peerStats.collect(getDiskFree)
peerStats.collect(getMemory)
peerStats.collect(getServices)
peerStats.process(availableCapacity)
peerStats.process(networkStats)
peerStats.save(save)
peerStats.on('error',function(err){
  logger.error(err)
})


/**
 * Export module
 * @type {Collector}
 */
module.exports = peerStats
