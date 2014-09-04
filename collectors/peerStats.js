'use strict';
var async = require('async')
var debug = require('debug')('oose:peerStats')
var dump = require('debug')('oose:peerStats:dump')
var path = require('path')
var util = require('util')

var Collector = require('../helpers/collector')
var logger = require('../helpers/logger').create('collector:peerStats')
var redis = require('../helpers/redis')
var SnmpHelper = require('../helpers/snmp')

var config = require('../config')
var root = path.resolve(config.root)

var snmp = new SnmpHelper()
var hrDeviceProcessor = snmp.mib.hrDeviceTypes(3).join('.')
var hrStorageRam = snmp.mib.hrStorageTypes(2).join('.')

var isWin = ('win32' === process.platform)
var item
var i
var j

var netInfo = {
  index: false,
  name: 'ERROR',
  ip: false,
  netmask: false,
  gateway: false,
  localListeners: [],
  speedIndexes: [],
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
var ramInfo = {
  index: -1,
  unit: -1,
  total: -1,
  free: -1
}
var diskInfo = {
  index: -1,
  unit: -1,
  total: -1,
  free: -1
}

var getServices = function(basket,next){
  debug('getServices() called')
  //services
  basket.services = ''
  var svcList = [
    'mesh','supervisor','store','prism','shredder','gump','lg','executioner'
  ]
  var svc = ''
  for(i=0; i < svcList.length; i++){
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
    if(60 > window){
      netInfo.inBps = (basket.netIn - netInfo.previous.in) / window
      netInfo.outBps = (basket.netOut - netInfo.previous.out) / window
    }
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
  async.series(
    [
      function(next){
        debug('snmpPrep() calling addBulk()')
        //locate all CPUs
        snmp.addBulk(
          snmp.mib.hrDeviceType(),
          function(result){
            dump('hrDeviceType',result)
            if(!result || !result.length) return
            for(i=0; i < result.length; i++){
              item = result[i]
              if(item.oid &&
                snmp.types.ObjectIdentifier === item.type &&
                hrDeviceProcessor === item.value
                ){ cpuInfo.push(item.oid.split('.').slice(-1)[0]) }
            }
            debug('found CPU indexes:',cpuInfo)
          }
        )
        //load storage tables
        snmp.addBulk(
          snmp.mib.hrStorageType(),
          function(result){
            dump('hrStorageType',result)
            if(!result || !result.length) return
            for(i=0; i < result.length; i++){
              item = result[i]
              if(item.oid && snmp.types.ObjectIdentifier === item.type){
                if(hrStorageRam === item.value)
                  ramInfo.index = item.oid.split('.').pop()
              }
            }
            debug('found RAM index:',ramInfo.index)
          }
        )
        snmp.addBulk(
          snmp.mib.hrStorageDescr(),
          function(result){
            dump('hrStorageDescr',result)
            if(!result || !result.length) return
            for(i=0; i < result.length; i++){
              item = result[i]
              if(item.value && snmp.types.OctetString === item.type){
                var x = item.value.split(' ').shift()
                if(0 === root.indexOf(x)){
                  diskInfo.index = item.oid.split('.').pop()
                }
              }
            }
            debug('found Disk index for "' + root + '": ' + diskInfo.index)
          }
        )
        snmp.addBulk(
          snmp.mib.hrStorageAllocationUnits(),
          function(result){
            dump('hrStorageAllocationUnits',result)
            if(!result || !result.length) return
            var ramOID = snmp.mib.hrStorageAllocationUnits(ramInfo.index).join('.')
            var diskOID = snmp.mib.hrStorageAllocationUnits(diskInfo.index).join('.')
            for(i=0; i < result.length; i++){
              item = result[i]
              if(item.value && snmp.types.Integer === item.type){
                if(ramOID === item.oid)
                  ramInfo.unit = +item.value
                if(diskOID === item.oid)
                  diskInfo.unit = +item.value
              }
            }
            debug('found allocation units: RAM=' + ramInfo.unit +
                ', Disk=' + diskInfo.unit
            )
          }
        )
        snmp.addBulk(
          snmp.mib.hrStorageSize(),
          function(result){
            dump('hrStorageSize',result)
            if(!result || !result.length) return
            var ramOID = snmp.mib.hrStorageSize(ramInfo.index).join('.')
            var diskOID = snmp.mib.hrStorageSize(diskInfo.index).join('.')
            for(i=0; i < result.length; i++){
              item = result[i]
              if(item.value && snmp.types.Integer === item.type){
                if(ramOID === item.oid)
                  ramInfo.total = ramInfo.unit * item.value
                if(diskOID === item.oid)
                  diskInfo.total = diskInfo.unit * item.value
              }
            }
            debug('found total size: RAM=' + ramInfo.total +
                ', Disk=' + diskInfo.total
            )
          }
        )
        //detect our interface index by tracing the default route
        // RFC1213-MIB::ipRouteIfIndex.0.0.0.0
        snmp.addBulk(
          snmp.mib.ip(),
          function(result){
            if(!result || !result.length) return
            var entAddr = snmp.mib.ipAdEntAddr().join('.')
            var entIndex = snmp.mib.ipAdEntIfIndex().join('.')
            var entMask = snmp.mib.ipAdEntNetMask().join('.')
            var defaultRouteOID = snmp.mib.ipRouteIfIndex('0.0.0.0').join('.')
            var defaultGateway = snmp.mib.ipRouteNextHop('0.0.0.0').join('.')
            var ipInfo = {}
            var ip
            for(i=0; i < result.length; i++){
              item = result[i]
              if(-1 !== item.oid.indexOf(entAddr))
                ipInfo[item.value] = {index:null,netmask:null}
              if(-1 !== item.oid.indexOf(entIndex)){
                ip = item.oid.split('.').slice(-4).join('.')
                ipInfo[item.value] = {ip:ip}
                ipInfo[ip].index = item.value
              }
              if(-1 !== item.oid.indexOf(entMask)){
                ip = item.oid.split('.').slice(-4).join('.')
                ipInfo[ip].netmask = item.value
                ipInfo[ipInfo[ip].index].netmask = item.value
              }
              if(item.value && snmp.types.Integer === item.type){
                if(defaultRouteOID === item.oid)
                  netInfo.index = item.value
              }
              if(-1 !== item.oid.indexOf(defaultGateway)){
                ipInfo[netInfo.index].gateway = item.value
              }
            }
            netInfo.ip = ipInfo[netInfo.index].ip
            netInfo.netmask = ipInfo[netInfo.index].netmask
            netInfo.gateway = ipInfo[netInfo.index].gateway
            debug('found routed network index=' + netInfo.index +
              ', IP=' + netInfo.ip +
              ', netmask=' + netInfo.netmask +
              ', gateway=' + netInfo.gateway
            )
          }
        )
        //useful name from IF-MIB::ifAlias.<ifIndex> (windows)
        // or IF-MIB::ifDescr.<ifIndex> (UNIX)
        snmp.addBulk(
          isWin ? snmp.mib.ifAlias() : snmp.mib.ifDescr(),
          function(result){
            dump(isWin ? 'ifAlias' : 'ifDescr',result)
            if(!result || !result.length) return
            var searchOID =
              (isWin ?
                snmp.mib.ifAlias(netInfo.index).join('.') :
                snmp.mib.ifDescr(netInfo.index).join('.')
              )
            for(i=0; i < result.length; i++){
              item = result[i]
              if(
                (snmp.types.OctetString === item.type) &&
                (searchOID === item.oid)
              ){ netInfo.name = item.value }
            }
            debug('found routed network name=' + netInfo.name)
          }
        )
        //bonding workaround
        snmp.addBulk(
          snmp.mib.ifPhysAddress(),
          function(result){
            dump('ifPhysAddress',result)
            var macIndexes = {}
            if(!result || !result.length) return
            var index
            for(i=0; i < result.length; i++){
              item = result[i]
              var mac = item.valueHex.replace(/^(..)(..)(..)(..)(..)(..)$/,'$1:$2:$3:$4:$5:$6')
              if(-1 !== mac.indexOf(':')){
                index = +item.oid.split('.').slice(-1)
                if(!macIndexes[mac])
                  macIndexes[mac] = []
                macIndexes[mac].push(index)
              }
            }
            var k = Object.keys(macIndexes)
            for(i=0; i < k.length; i++){
              var list = macIndexes[k[i]]
              if(-1 !== list.indexOf(netInfo.index))
                netInfo.speedIndexes = list
            }
          }
        )
        debug('snmpPrep() calling run()')
        snmp.run(next)
      }
    ],
    function(err){
      debug('snmpPrep() completed')
      dump('FINAL RESULT',
        '\ncpuInfo:' + util.inspect(cpuInfo),
        '\nramInfo:' + util.inspect(ramInfo),
        '\ndiskInfo:' + util.inspect(diskInfo),
        '\nnetInfo:' + util.inspect(netInfo)
      )
      done(err)
    }
  )
}

//all .getBulk() and .get() calls in one
var snmpPoll = function(basket,done){
  debug('snmpPoll() called')
  //set the basket up with stuff that never changes
  basket.netIndex = netInfo.index
  basket.netName = netInfo.name
  basket.netIp = netInfo.ip
  basket.cpuCount = cpuInfo.length
  basket.memoryTotal = ramInfo.total
  basket.diskTotal = diskInfo.total
  async.series(
    [
      function(next){
        debug('snmpPoll() calling addBulk()')
        snmp.addBulk(
          snmp.mib.hrProcessorLoad(),
          function(result){
            if(!result || !result.length) return
            var cpuAvgUsed = 0
            for(i=0; i < result.length; i++){
              item = result[i]
              if(
                item.oid && snmp.types.Integer === item.type &&
                -1 !== cpuInfo.indexOf(item.oid.split('.').slice(-1)[0])
                ){ cpuAvgUsed += item.value }
            }
            basket.cpuUsed = cpuAvgUsed / cpuInfo.length
            debug('collected cpuUsed: ' + basket.cpuUsed)
          }
        )
        snmp.addBulk(
          snmp.mib.hrStorageUsed(),
          function(result){
            dump('hrStorageUsed',result)
            if(!result || !result.length) return
            var ramOID = snmp.mib.hrStorageUsed(ramInfo.index).join('.')
            var diskOID = snmp.mib.hrStorageUsed(diskInfo.index).join('.')
            for(i=0; i < result.length; i++){
              item = result[i]
              if(item.value && snmp.types.Integer === item.type){
                if(ramOID === item.oid)
                  ramInfo.used = ramInfo.unit * item.value
                if(diskOID === item.oid)
                  diskInfo.used = diskInfo.unit * item.value
              }
            }
            basket.memoryFree = ramInfo.free = ramInfo.total - ramInfo.used
            basket.diskFree = diskInfo.free = diskInfo.total - diskInfo.used
            debug('collected free: RAM=' + basket.memoryFree +
              ', Disk=' + basket.diskFree
            )
          }
        )
        //localhost listening TCP ports
        snmp.addBulk(
          snmp.mib.tcpConnectionState('127.0.0.1'),
          function(result){
            dump('tcpConnectionState',result)
            netInfo.localListeners = []
            if(!result || !result.length) return
            var connections = snmp.mib.tcpConnectionState('127.0.0.1').join('.')
            var port
            for(i=0; i < result.length; i++){
              item = result[i]
              if(-1 !== item.oid.indexOf(connections)){
                if(2 === item.value){
                  port = item.oid.split('.').slice(-8).shift()
                  netInfo.localListeners.push(port)
                }
              }
            }
          }
        )
        //speed from IF-MIB::ifSpeed.<ifIndex>
        snmp.addBulk(
          snmp.mib.ifSpeed(),
          function(result){
            dump('ifSpeed',result)
            if(!result || !result.length) return
            for(i=0; i < result.length; i++){
              item = result[i]
              for(j=0; j < netInfo.speedIndexes.length; j++){
                if(snmp.mib.ifSpeed(netInfo.speedIndexes[j]).join('.') === item.oid){
                  if(0 !== item.value)
                    basket.netSpeed = netInfo.speed = item.value
                }
              }
            }
            debug('collected netSpeed: ' + basket.netSpeed)
          }
        )
        debug('snmpPoll() calling add()')
        //Net:in counter from IF-MIB::ifInOctets.<ifIndex>
        snmp.add(
          snmp.mib.ifInOctets(netInfo.index),
          function(result){
            dump('ifInOctets',result)
            if('number' !== typeof result.value) return
            basket.netIn = netInfo.in = result.value
            debug('collected netIn: ' + basket.netIn)
          }
        )
        //Net:out counter from IF-MIB::ifOutOctets.<ifIndex>
        snmp.add(
          snmp.mib.ifOutOctets(netInfo.index),
          function(result){
            dump('ifOutOctets',result)
            if('number' !== typeof result.value) return
            basket.netOut = netInfo.out = result.value
            debug('collected netOut: ' + basket.netOut)
          }
        )
        //Sys:uptime counter from SNMPv2-MIB::sysUpTime.0
        snmp.add(
          snmp.mib.sysUpTimeInstance(),
          function(result){
            dump('sysUpTimeInstance',result)
            if('number' !== typeof result.value) return
            netInfo.previous.uptime = netInfo.uptime
            netInfo.uptime = result.value
          }
        )
        debug('snmpPoll() calling run()')
        snmp.run(next)
      }
    ],
    function(err){
      debug('snmpPoll() completed')
      dump('poll results',
          '\ncpuInfo:' + util.inspect(cpuInfo),
          '\nramInfo:' + util.inspect(ramInfo),
          '\ndiskInfo:' + util.inspect(diskInfo),
          '\nnetInfo:' + util.inspect(netInfo)
      )
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
  logger.warning(err)
})
collector.collect(snmpPoll)
collector.collect(getServices)
collector.process(calcNetStats)
collector.process(calcCapStats)
collector.process(function(basket,next){
  dump('collected:',basket)
  next(null,basket)
})
collector.save(save)


/**
 * Export module
 * @type {Collector}
 */
module.exports = {
  prep: snmpPrep,
  collector: collector
}
