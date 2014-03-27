'use strict';
/*jshint bitwise: false*/
var config = require('../config')
  , logger = require('../helpers/logger')
  , redis = require('../helpers/redis')
  , Communicator = require('../helpers/communicator')
  , os = require('os')
  , ip = require('ip')
  , shortlink = require('shortlink')
  , path = require('path')
  , ds = require('diskspace')

//utility functions
var swap32 = function swap32(val){
  return ((val & 0xFF) << 24) |
    ((val & 0xFF00) << 8) |
    ((val >> 8) & 0xFF00) |
    ((val >> 24) & 0xFF)
}

//stateful peer registry
var peerRegistry = {
  /**
   * peerRegistry.set(hostname,key,value)
   * @param {string} hostname Hostname the key/value apply to
   * @param {string} key Key name to set
   * @param {multiple} value Value for hostname/key pair
   */
  set: function(hostname,key,value){
    if('stringstringstring' === (typeof hostname) + (typeof key) + (typeof value)){
      redis.hset('peerRegistry:' + hostname,key,value)
    }
  },
  /**
   * peerRegistry.get(hostname,key)
   * @param {string} hostname Hostname the key applies to
   * @param {string} key Key name to get
   * @return {multiple} Value as currently stored, or null
   */
  get: function(hostname,key){
    if('stringstring' === (typeof hostname) + (typeof key)){
      return redis.hget('peerRegistry:' + hostname,key)
    }
    return null
  },
  /**
   * peerRegistry.dump()
   * @return {object} Dump of current peerRegistry
   */
  dump: function(){
    var rv = {}
    redis.keys(['peerRegistry:*'], function(err,result){
      if(err){ logger.warn('peerRegistry.dump/keys:',err) }
      for(var e in result){
        var entry = result[e]
        redis.hkeys(entry,function(err,result){
          if(err){ logger.warn('peerRegistry.dump/hkeys:',err) }
          for(var k in result){
            var key = result[k]
            rv[entry][key] = redis.hget(entry,key)
          }
        })
      }
    })
    return rv
  }
}
//obtain our own IP
var filter = function(d){
  if(('IPv4' !== d.family) || (d.internal)){ return false }
  peerRegistry.set(config.get('hostname'),'ip',d.address)
  return true
}
var int = os.networkInterfaces()
for(var i in int) { if(int.hasOwnProperty(i)) int[i].some(filter) }
if(null === selfReg.ip){
  logger.warn('Could not locate primary IP address')
  peerRegistry.set(config.get('hostname'),'ip','127.0.0.2')
}

//set the random-ish signature for handle generation
// note: this algorithm is completely made up
peerRegistry.set(config.get('hostname'),'sig',(new Date().getTime()) & 0xffffffff)
peerRegistry.set(config.get('hostname'),'handle',shortlink.encode(
  Math.abs(
    swap32(ip.toLong(peerRegistry.get(config.get('hostname'),'ip')))
    ^
    peerRegistry.get(config.get('hostname'),'sig')
  )
  & 0xffffffff
))

//node registry helper functions
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
var lastMeasure = cpuAverage()
var getLoad = function(){
  var thisMeasure = cpuAverage()
  var percentageCPU = 100 - ~~
    (
      100 *
      (thisMeasure.idle - lastMeasure.idle) /
      (thisMeasure.total - lastMeasure.total)
    )
  lastMeasure = thisMeasure
  return percentageCPU
}

//setup multicast networking
var multiCast = new Communicator({
  proto: 'mcast',
  port: config.get('mesh.port'),
  mcast: {
    address: config.get('mesh.address'),
    ttl: config.get('mesh.ttl')
  }
})
multiCast.useReceive(function(pkt){
  //update peers state in memory
  peerRegistry.set(pkt.hostname,'latency',(
    pkt.sent -
      peerRegistry.get(pkt.hostname,'sent') -
      config.get('mesh.interval')
    )
  )
  peerRegistry.set(pkt.hostname,'sent',pkt.sent)
  peerRegistry.set(pkt.hostname,'handle',pkt.handle)
  peerRegistry.set(pkt.hostname,'ip',pkt.rinfo.address)
  peerRegistry.set(pkt.hostname,'load',pkt.load)
  peerRegistry.set(pkt.hostname,'free',pkt.free)
  if(
    config.get('mesh.debug') ||
    (pkt.handle !== peerRegistry.get(pkt.hostname,'handle'))
  ){
    logger.info(
      pkt.handle +
        ' posted an announce' +
        ' at ' +
        new Date(peerRegistry.get(pkt.hostname,'sent')).toLocaleTimeString() +
        ' (latency ' + peerRegistry.get(pkt.hostname,'latency') + ')' +
        (
          (config.get('mesh.debug') &&
          (pkt.handle === peerRegistry.get(config.get('hostname'),'handle'))
          ) ? ' [SELFIE]' : ''
        )
    )
  }
  if(config.get('mesh.debug') > 1){
    logger.info(os.EOL + require('util').inspect(peerRegistry.dump()))
  }
})
var announceTimeout

var sendAnnounce = function(){
  var message = {}
  message.hostname = config.get('hostname')
  message.handle = peerRegistry.get(config.get('hostname'),'handle')
  peerRegistry.set(config.get('hostname'),'load',getLoad())
  message.load = peerRegistry.get(config.get('hostname'),'load')
  var spacepath = path.resolve(config.get('serve.dataRoot'))
  //Windows needs to call with only the drive letter
  if('win32' === os.platform()) spacepath = spacepath.substr(0,1)
  ds.check(spacepath,function(total,free){
    peerRegistry.set(pkt.hostname,'free',parseInt(free,10) || 0)
    message.free = peerRegistry.get(pkt.hostname,'free')
    multiCast.send(message,function(){
      announceTimeout = setTimeout(sendAnnounce,config.get('mesh.interval'))
    })
  })
}

exports.multiCast = multiCast
exports.start = function(){
  sendAnnounce()
  console.log('Mesh started and announcement active')
}
exports.stop = function(){
  if(announceTimeout)
    clearTimeout(announceTimeout)
}

