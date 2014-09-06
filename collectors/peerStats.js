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
var hrDeviceProcessor = snmp.mib.hrDeviceTypes(3)
var hrStorageRam = snmp.mib.hrStorageTypes(2)

var isWin = ('win32' === process.platform)
var maxint32 = Math.pow(2,32)
var item
var i
var j

var netInfo = {
  //routed network interface SNMP index
  index: false,
  //friendly name, win: 'Local Area Connection' or similar, unix: 'eth0' etc
  name: 'unknown',
  //ip address and related info
  ip: false,
  netmask: false,
  gateway: false,
  //list of listening ports on 127.0.0.1 (monitor own services)
  localListeners: [],
  //link speed
  speedIndexes: [],
  speed: 0,
  //octet histories for rate calc
  use64in: true,
  use64out: true,
  in: [],
  out: [],
  uptime: [],
  //set by summarizing the above
  inBps: 0,
  outBps: 0
}
//simple list of CPU SNMP indexes
var cpuInfo = []
var ramInfo = {
  //RAM storage SNMP index
  index: -1,
  //scalar for SNMP-value to bytes conversion
  unit: -1,
  //total size in bytes
  total: -1,
  //free space in bytes
  free: -1
}
var diskInfo = {
  //Disk storage SNMP index (of whichever disk contains store data root)
  index: -1,
  //scalar for SNMP-value to bytes conversion
  unit: -1,
  //total size in bytes
  total: -1,
  //free space in bytes
  free: -1
}

var nullFunc = function(){}

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
  if(config.shredder.enabled){
    basket.portShredder = config.shredder.portPublic || config.shredder.port
  }
  basket.portMesh = config.mesh.portPublic || config.mesh.port
  next(null,basket)
}

var calcNetStats = function(basket,next){
  debug('calcNetStats() called')
  if(netInfo.uptime.length !== (netInfo.in.length + netInfo.out.length)/2)
    return next('netInfo octet info corrupt?')
  //pass-thru bailout for insufficient samples available (just restarted?)
  if(1 === netInfo.uptime.length){
    basket.netInBps = 0
    basket.netOutBps = 0
    return next(null,basket)
  }
  var deltaIn
  var deltaOut
  var window
  for(i=1; i < netInfo.uptime.length; i++){
    deltaIn = (netInfo.in[i] - netInfo.in[i-1])
    deltaOut = (netInfo.out[i] - netInfo.out[i-1])
    if(0 > deltaIn){
      debug('inOctets wrap detected, reducing previous history',netInfo.in)
      for(j=i-1; j >= 0; j--){
        netInfo.in[j] = netInfo.in[j] - maxint32
      }
      debug('inOctets post-reduction: ',netInfo.in)
      deltaIn = (netInfo.in[i] - netInfo.in[i-1])
    }
    if(0 > deltaOut){
      debug('outOctets wrap detected, reducing previous history',netInfo.out)
      for(j=i-1; j >= 0; j--){
        netInfo.out[j] = netInfo.out[j] - maxint32
      }
      debug('outOctets post-reduction: ',netInfo.out)
      deltaOut = (netInfo.out[i] - netInfo.out[i-1])
    }
    window = (netInfo.uptime[i] - netInfo.uptime[i-1])
    netInfo.inBps = (deltaIn * 8) / window
    netInfo.outBps = (deltaOut * 8) / window
  }
  var len = netInfo.uptime.length - 10
  if(0 < len){
    netInfo.uptime = netInfo.uptime.splice(len)
    netInfo.in = netInfo.in.splice(len)
    netInfo.out = netInfo.out.splice(len)
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
          function(result,complete){
            dump('hrDeviceType',result)
            if('function' !== typeof complete) complete = nullFunc
            if(!result || !result.length) return complete()
            for(i=0; i < result.length; i++){
              item = result[i]
              if(item.oid &&
                snmp.types.ObjectIdentifier === item.type &&
                hrDeviceProcessor === item.value
                ){ cpuInfo.push(item.oid.split('.').slice(-1)[0]) }
            }
            debug('found CPU indexes:',cpuInfo)
            complete()
          }
        )
        //load storage tables
        snmp.addBulk(
          snmp.mib.hrStorageType(),
          function(result,complete){
            dump('hrStorageType',result)
            if('function' !== typeof complete) complete = nullFunc
            if(!result || !result.length) return complete()
            for(i=0; i < result.length; i++){
              item = result[i]
              if(item.oid && snmp.types.ObjectIdentifier === item.type){
                if(hrStorageRam === item.value)
                  ramInfo.index = item.oid.split('.').pop()
              }
            }
            debug('found RAM index:',ramInfo.index)
            complete()
          }
        )
        snmp.addBulk(
          snmp.mib.hrStorageDescr(),
          function(result,complete){
            dump('hrStorageDescr',result)
            if('function' !== typeof complete) complete = nullFunc
            if(!result || !result.length) return complete()
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
            complete()
          }
        )
        snmp.addBulk(
          snmp.mib.hrStorageAllocationUnits(),
          function(result,complete){
            dump('hrStorageAllocationUnits',result)
            if('function' !== typeof complete) complete = nullFunc
            if(!result || !result.length) return complete()
            var ramOID = snmp.mib.hrStorageAllocationUnits(ramInfo.index)
            var diskOID = snmp.mib.hrStorageAllocationUnits(diskInfo.index)
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
            complete()
          }
        )
        snmp.addBulk(
          snmp.mib.hrStorageSize(),
          function(result,complete){
            dump('hrStorageSize',result)
            if('function' !== typeof complete) complete = nullFunc
            if(!result || !result.length) return complete()
            var ramOID = snmp.mib.hrStorageSize(ramInfo.index)
            var diskOID = snmp.mib.hrStorageSize(diskInfo.index)
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
            complete()
          }
        )
        //detect our interface index by tracing the default route
        // RFC1213-MIB::ipRouteIfIndex.0.0.0.0
        snmp.addBulk(
          snmp.mib.ip(),
          function(result,complete){
            if('function' !== typeof complete) complete = nullFunc
            if(!result || !result.length) return complete()
            var entAddr = snmp.mib.ipAdEntAddr()
            var entIndex = snmp.mib.ipAdEntIfIndex()
            var entMask = snmp.mib.ipAdEntNetMask()
            var defaultRouteOID = snmp.mib.ipRouteIfIndex('0.0.0.0')
            var defaultGateway = snmp.mib.ipRouteNextHop('0.0.0.0')
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
            complete()
          }
        )
        //useful name from IF-MIB::ifAlias.<ifIndex> (windows)
        // or IF-MIB::ifDescr.<ifIndex> (UNIX)
        snmp.addBulk(
          isWin ? snmp.mib.ifAlias() : snmp.mib.ifDescr(),
          function(result,complete){
            dump((isWin ? 'ifAlias' : 'ifDescr'),result)
            if('function' !== typeof complete) complete = nullFunc
            if(!result || !result.length) return complete()
            var searchOID =
              (isWin ?
                snmp.mib.ifAlias(netInfo.index) :
                snmp.mib.ifDescr(netInfo.index)
              )
            for(i=0; i < result.length; i++){
              item = result[i]
              if(
                (snmp.types.OctetString === item.type) &&
                (searchOID === item.oid)
              ){ netInfo.name = item.value }
            }
            debug('found routed network name=' + netInfo.name)
            complete()
          }
        )
        //bonding workaround
        snmp.addBulk(
          snmp.mib.ifPhysAddress(),
          function(result,complete){
            dump('ifPhysAddress',result)
            if('function' !== typeof complete) complete = nullFunc
            var macIndexes = {}
            if(!result || !result.length) return complete()
            var index
            for(i=0; i < result.length; i++){
              item = result[i]
              var mac = item.valueHex.replace(
                /^(..)(..)(..)(..)(..)(..)$/,
                '$1:$2:$3:$4:$5:$6'
              ).toUpperCase()
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
            complete()
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
          function(result,complete){
            if('function' !== typeof complete) complete = nullFunc
            if(!result || !result.length) return complete()
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
            complete()
          }
        )
        snmp.addBulk(
          snmp.mib.hrStorageUsed(),
          function(result,complete){
            dump('hrStorageUsed',result)
            if('function' !== typeof complete) complete = nullFunc
            if(!result || !result.length) return complete()
            var ramOID = snmp.mib.hrStorageUsed(ramInfo.index)
            var diskOID = snmp.mib.hrStorageUsed(diskInfo.index)
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
            complete()
          }
        )
        //localhost listening TCP ports
        snmp.addBulk(
          snmp.mib.tcpConnectionState('127.0.0.1'),
          function(result,complete){
            dump('tcpConnectionState',result)
            if('function' !== typeof complete) complete = nullFunc
            netInfo.localListeners = []
            if(!result || !result.length) return complete()
            var connections = snmp.mib.tcpConnectionState('127.0.0.1')
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
            complete()
          }
        )
        //speed from IF-MIB::ifSpeed.<ifIndex>
        snmp.addBulk(
          snmp.mib.ifSpeed(),
          function(result,complete){
            dump('ifSpeed',result)
            if('function' !== typeof complete) complete = nullFunc
            if(!result || !result.length) return complete()
            for(i=0; i < result.length; i++){
              item = result[i]
              for(j=0; j < netInfo.speedIndexes.length; j++){
                if(snmp.mib.ifSpeed(netInfo.speedIndexes[j]) === item.oid){
                  if(0 !== item.value)
                    basket.netSpeed = netInfo.speed = item.value
                }
              }
            }
            debug('collected netSpeed: ' + basket.netSpeed)
            complete()
          }
        )
        debug('snmpPoll() calling add()')
        //also grab hi-cap Counter64 counts
        if(netInfo.use64in){
          snmp.add(
            snmp.mib.ifHCInOctets(netInfo.index),
            function(result,complete){
              dump('ifHCInOctets',result)
              if(netInfo.use64in){
                netInfo.use64in = false
                if('function' !== typeof complete) complete = nullFunc
                if('number' !== typeof result.value) return complete()
                netInfo.use64in = true
                if(netInfo.in[netInfo.in.length - 1] !== result.value)
                  netInfo.in.push(result.value)
                basket.netIn = result.value
                debug('collected 64-bit netIn: ' + basket.netIn)
              }
              complete()
            }
          )
        }
        if(netInfo.use64out){
          snmp.add(snmp.mib.ifHCOutOctets(netInfo.index),
            function(result,complete){
              dump('ifHCOutOctets',result)
              if(netInfo.use64out){
                netInfo.use64out = false
                if('function' !== typeof complete) complete = nullFunc
                if('number' !== typeof result.value) return complete()
                netInfo.use64out = true
                if(netInfo.out[netInfo.out.length - 1] !== result.value)
                  netInfo.out.push(result.value)
                basket.netOut = result.value
                debug('collected 64-bit netOut: ' + basket.netOut)
              }
              complete()
            }
          )
        }
        //Net:in counter from IF-MIB::ifInOctets.<ifIndex>
        snmp.add(
          snmp.mib.ifInOctets(netInfo.index),
          function(result,complete){
            dump('ifInOctets',result)
            if(!netInfo.use64in){
              if('function' !== typeof complete) complete = nullFunc
              if('number' !== typeof result.value) return complete()
              if(netInfo.in[netInfo.in.length - 1] !== result.value)
                netInfo.in.push(result.value)
              basket.netIn = result.value
              debug('collected 32-bit netIn: ' + basket.netIn)
            }
            complete()
          }
        )
        //Net:out counter from IF-MIB::ifOutOctets.<ifIndex>
        snmp.add(
          snmp.mib.ifOutOctets(netInfo.index),
          function(result,complete){
            dump('ifOutOctets',result)
            if(!netInfo.use64out){
              if('function' !== typeof complete) complete = nullFunc
              if('number' !== typeof result.value) return complete()
              if(netInfo.out[netInfo.out.length - 1] !== result.value)
                netInfo.out.push(result.value)
              basket.netOut = result.value
              debug('collected 32-bit netOut: ' + basket.netOut)
            }
            complete()
          }
        )
        //Sys:uptime counter from SNMPv2-MIB::sysUpTime.0
        snmp.add(
          snmp.mib.sysUpTimeInstance(),
          function(result,complete){
            dump('sysUpTimeInstance',result)
            if('function' !== typeof complete) complete = nullFunc
            if('number' !== typeof result.value) return complete()
            if(netInfo.out.length !== netInfo.uptime.length)
              netInfo.uptime.push(result.value/100)
            complete()
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

if(require.main === module){
  process.on('message',function(msg){
    if('stop' === msg){
      collector.stop(function(err){
        if(err) process.send({status: 'error', message: err})
        process.exit(err ? 1 : 0)
      })
    }
  })
  var start = function(){
    snmpPrep(function(err){
      if(err){
        return process.send({status: 'error', message: err})
      }
      collector.once('loopEnd',function(){
        process.send({status: 'ok'})
      })
      collector.start(config.mesh.stat.interval,0)
    })
  }
  start()
}
