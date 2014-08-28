'use strict';
var async = require('async')
var debug = require('debug')('peer:stats')
var ds = require('diskspace')
var os = require('os')
var path = require('path')

var Collector = require('../helpers/collector')
var logger = require('../helpers/logger').create('collector:peerStats')
var redis = require('../helpers/redis')
var snmp = require('../helpers/snmp')

var config = require('../config')

var snmpSession = snmp.createSession()

var netInfo = {
  index: false,
  name: 'ERROR',
  ip: false,
  speed: 0,
  in: 0,
  out: 0,
  uptime: 0,
  previous: {
    in: 0,
    out: 0,
    uptime: 0
  },
  inBps: 0,
  outBps: 0
}
var cpuInfo = []
var cpuAvgUsed = 0
var memInfo = {
  index: -1,
  unit: -1,
  total: -1,
  free: -1
}

var noResultMsg = function(msg){
  return 'No result for ' + msg
}


/**
 * Get disk byte used/free for whichever disk contains the root
 * @param {object} basket Collector basket
 * @param {function} next Callback
 */
var getDiskFree = function(basket,next){
  debug('getDiskFree() called')
  var root = path.resolve(config.root)
  //Windows needs to call with only the drive letter
  if('win32' === os.platform()) root = root.substr(0,1)
  ds.check(root,function(err,total,free){
    basket.diskFree = (+free) || 0
    basket.diskTotal = (+total) || 0
    next(null,basket)
  })
}

var getServices = function(basket,next){
  debug('getServices() called')
  //services
  basket.services = ''
  var svcList = [
    'mesh','supervisor','store','prism','shredder','gump','lg','executioner'
  ]
  var svc = ''
  for(var i=0; i<svcList.length; i++){
    svc = svcList[i]
    if(config[svc].enabled) basket.services += ',' + svc
  }
  //service ports
  if(config.store.enabled){
    basket.portImport =
      config.store.import.portPublic || config.store.import.port
    basket.portExport =
      config.store.export.portPublic || config.store.export.port
  }
  if(config.prism.enabled){
    basket.portPrism = config.prism.portPublic || config.prism.port
  }
  basket.portMesh = config.mesh.portPublic || config.mesh.port
  next(null,basket)
}

var calcNetStats = function(basket,next){
  debug('calcNetStats() called')
  if(0 !== ((netInfo.previous.in - basket.netIn) + (netInfo.previous.out - basket.netOut))){
    var window = (netInfo.uptime - netInfo.previous.uptime) / 100
    netInfo.inBps = (basket.netIn - netInfo.previous.in) / window
    netInfo.outBps = (basket.netOut - netInfo.previous.out) / window
    netInfo.previous.in = basket.netIn
    netInfo.previous.out = basket.netOut
  }
  basket.netInBps = netInfo.inBps
  basket.netOutBps = netInfo.outBps
  next(null,basket)
}

var calcCapStats = function(basket,next){
  debug('calcCapStats() called')
  basket.availableCapacity = 100 * (basket.diskFree / basket.diskTotal)
  //issue #32 avail comes back infinity (this is a safeguard)
  if('Infinity' === basket.availableCapacity) basket.availableCapacity = 100
  next(null,basket)
}

//only need to get these once, they won't change
var snmpPrep = function(done){
  debug('snmpPrep() called')
  var i = 0
  async.series(
    [
      function(next){
        debug('snmpPrep() calling getBulk()')
        snmpSession.getBulk(
          [
            //locate all CPUs
            snmp.mib.hrDeviceType,
            //locate the Storage index for RAM
            snmp.mib.hrStorageTable,
            //detect our interface index by tracing the default route
            // RFC1213-MIB::ipRouteIfIndex.0.0.0.0
            snmp.mib.ipRouteIfIndex('0.0.0.0')
          ],
          function(err,result){
            debug('snmpPrep() getBulk() returned')
            if(err) return next(err)
            if(!result.length) return next('No getBulk() result (and no error?)')
            var item
            if(!result[0] || !result[0].length)
              return next(noResultMsg('CPU:hrDeviceType table'))
            for(i=0; i < result[0].length; i++){
              item = result[0][i]
              if(item.oid &&
                snmp.ObjectType.OID === item.type &&
                snmp.mib.hrDeviceTypes(3) === item.value //deviceType: CPU
                ){ cpuInfo.push(item.oid.split('.').slice(-1)[0]) }
            }
            if(!result[1] || !result[1].length)
              return next(noResultMsg('Mem:hrStorageTable'))
            for(i=0; i < result[1].length; i++){
              item = result[1][i]
              if(
                item.value &&
                item.value instanceof Buffer &&
                item.value.toString().match(/physical memory/i)
                ){
                memInfo.index = item.oid.split('.').pop()
              }
            }
            if(!result[2][0].value) return next(noResultMsg('Net:ipRouteIfIndex'))
            netInfo.index = result[2][0].value
            next()
          }
        )
      },
      function(next){
        debug('snmpPrep() calling get()')
        snmpSession.get(
          [
            //useful name from IF-MIB::ifAlias.<ifIndex>
            snmp.mib.ifAlias(netInfo.index),
            //speed from IF-MIB::ifSpeed.<ifIndex>
            snmp.mib.ifSpeed(netInfo.index),
            //memory scalar (unit)
            snmp.mib.memoryAllocationUnit(memInfo.index),
            //memory total size
            snmp.mib.memorySize(memInfo.index)
          ],
          function(err,result){
            debug('snmpPrep() get() returned')
            if(err) return next(err)
            if(!result.length)
              return next('No get() result (and no error?)')
            //network stats
            if(result[0].value)
              netInfo.name = result[0].value.toString()
            if(!result[1].value)
              return next(noResultMsg('Net:ifSpeed'))
            netInfo.speed = result[1].value
            //memory stats
            if(!result[2].value)
              return next(noResultMsg('Mem:memoryAllocationUnit'))
            memInfo.unit = result[2].value
            if(!result[3].value)
              return next(noResultMsg('Mem:memorySize'))
            memInfo.total = memInfo.unit * result[3].value
            next()
          }
        )
      },
      //find our IP
      // (is this extra? can we get this from things we got above?)
      function(next){
        debug('snmpPrep() netip collector called')
        var interfaces = os.networkInterfaces()
        var filter = function(address){
          if('IPv4' === address.family && !address.internal && !netInfo.ip)
            netInfo.ip = address.address
        }
        for(var i in interfaces){
          if(interfaces.hasOwnProperty(i))
            interfaces[i].forEach(filter)
        }
        if(!netInfo.ip)
          return next('Failed to get netInfo.ip')
        next()
      }
    ],
    done
  )
}

//all .getBulk() and .get() calls in one
var snmpPoll = function(basket,done){
  debug('snmpPoll() called')
  var i = 0
  //set the basket up with stuff that never changes
  basket.netIndex = netInfo.index
  basket.netName = netInfo.name
  basket.netSpeed = netInfo.speed
  basket.netIp = netInfo.ip
  basket.cpuCount = cpuInfo.length
  basket.memoryTotal = memInfo.total
  async.series(
    [
      function(next){
        debug('snmpPoll() calling getBulk()')
        snmpSession.getBulk([snmp.mib.hrProcessorLoad],function(err,result){
          debug('snmpPoll() getBulk() returned')
          if(err) return next(err)
          if(!result.length) return next('No getBulk() result (and no error?)')
          if(!result[0] || !result[0].length)
            return next(noResultMsg('CPU:hrProcessorLoad table'))
          for(i = 0; i < result[0].length; i++){
            var item = result[0][i]
            if(
              item.oid && snmp.ObjectType.Integer32 === item.type &&
              -1 !== cpuInfo.indexOf(item.oid.split('.').slice(-1)[0])
            ){ cpuAvgUsed += item.value }
          }
          basket.cpuUsed = cpuAvgUsed = cpuAvgUsed / cpuInfo.length
          next()
        })
      },
      function(next){
        debug('snmpPoll() calling get()')
        snmpSession.get(
          [
            //Net:in counter from IF-MIB::ifInOctets.<ifIndex>
            snmp.mib.ifInOctets(netInfo.index),
            //Net:out counter from IF-MIB::ifOutOctets.<ifIndex>
            snmp.mib.ifOutOctets(netInfo.index),
            //Mem: used
            snmp.mib.memoryUsed(memInfo.index),
            //Net:in counter from IF-MIB::ifInOctets.<ifIndex>
            snmp.mib.sysUpTime
          ],
          function(err,result){
            debug('snmpPoll() getBulk() returned')
            if(err) return next(err)
            if(!result.length)
              return next('No getBulk() result (and no error?)')
            //network stats
            if('number' !== typeof result[0].value)
              return next(noResultMsg('Net:ifInOctets'))
            basket.netIn = netInfo.in = result[0].value
            if('number' !== typeof result[1].value)
              return next(noResultMsg('Net:ifOutOctets'))
            basket.netOut = netInfo.out = result[1].value
            //memory stats
            if('number' !== typeof result[2].value)
              return next(noResultMsg('Mem:memoryUsed'))
            basket.memoryFree = memInfo.free =
              memInfo.total - (memInfo.unit * result[2].value)
            //remote time
            if('number' !== typeof result[3].value)
              return next(noResultMsg('Sys:uptime'))
            netInfo.previous.uptime = netInfo.uptime
            netInfo.uptime = result[3].value
            next()
          }
        )
      }
    ],
    function(err){
      done(err,basket)
    }
  )
}

var save = function(basket,next){
  redis.hmset('peer:db:' + config.hostname,basket,function(err){
    if(err) next(err)
    else next(null,basket)
  })
}

var collector = new Collector()
collector.on('error',function(err){
  logger.error(err)
})
collector.collect(snmpPoll)
collector.collect(getServices)
collector.collect(getDiskFree)
collector.process(calcNetStats)
collector.process(calcCapStats)
collector.save(save)


/**
 * Export module
 * @type {Collector}
 */
module.exports = {
  prep: snmpPrep,
  collector: collector
}
