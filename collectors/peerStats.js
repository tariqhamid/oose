'use strict';
/*jshint bitwise: false*/
var async = require('async')
var ds = require('diskspace')
var os = require('os')
var path = require('path')

var Collector = require('../helpers/collector')
var logger = require('../helpers/logger').create('collector:peerStats')
var redis = require('../helpers/redis')
var snmp = require('../helpers/snmp')

var config = require('../config')

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
        snmpSession.get([snmp.mib.ipRouteIfIndex('0.0.0.0')],function(err,result){
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
            snmp.mib.ifAlias(ifInfo.index),
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
  var root = path.resolve(config.root)
  //Windows needs to call with only the drive letter
  if('win32' === os.platform()) root = root.substr(0,1)
  ds.check(root,function(err,total,free){
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
        snmpSession.getBulk([snmp.mib.hrDeviceType,snmp.mib.hrProcessorLoad],function(err,result){
          if(err) return next(err)
          if(!result || !result[0] || !result[0].length || !result[1] || !result[1].length)
            return next('Could not get CPU statistics from SNMP')
          var cpus = []
          result[0].forEach(function(item){
            if(item.oid &&
              snmp.ObjectType.OID === item.type &&
              snmp.mib.hrDeviceTypes(3) === item.value
              ) cpus.push(item.oid.split('.').slice(-1)[0])
          })
          result[1].forEach(function(item){
            if(item.oid &&
              snmp.ObjectType.Integer32 === item.type &&
              cpus.indexOf(item.oid.split('.').slice(-1)[0]) !== -1
              ){
              cpuUsed += item.value
              cpuCount++
            }
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
            basket.memoryFree = basket.memoryTotal - result[0].value * result[2].value
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
  if(config.mesh.enabled) basket.services += ',mesh'
  if(config.supervisor.enabled) basket.services += ',supervisor'
  if(config.store.enabled) basket.services += ',store'
  if(config.prism.enabled) basket.services += ',prism'
  if(config.shredder.enabled) basket.services += ',shredder'
  if(config.gump.enabled) basket.services += ',gump'
  if(config.lg.enabled) basket.services += ',lg'
  //service ports
  if(config.store.enabled){
    basket.portImport = config.store.import.portPublic || config.store.import.port
    basket.portExport = config.store.export.portPublic || config.store.export.port
  }
  if(config.prism.enabled){
    basket.portPrism = config.prism.portPublic || config.prism.port
  }
  basket.portMesh = config.mesh.portPublic || config.mesh.port
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
  basket.availableCapacity = 100 * (basket.diskFree / basket.diskTotal)
  //issue #32 avail comes back infinity (this is a safeguard)
  if('Infinity' === basket.availableCapacity) basket.availableCapacity = 100
  next(null,basket)
}

var save = function(basket,next){
  redis.hmset('peer:db:' + config.hostname,basket,function(err){
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
