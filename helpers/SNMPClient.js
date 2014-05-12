'use strict';
var config = require('../config')
  , os = require('os')
  , snmp = require('net-snmp')
  , async = require('async')

var ifDefaults = function(){
  return {
    ifIndex: 0,
    ifAlias: 'ERROR',
    ifSpeed: 0,
    ifInOctets: 0,
    ifOutOctets: 0,
    ip: false,
    lastUpdate: 0
  }
}
var network = {
  public: ifDefaults(),
  replication: ifDefaults(),
  management: ifDefaults()
}
var oid = {
  'RFC1213-MIB::ipRouteIfIndex': ['1.3.6.1.2.1.4.21.1.2'],
  'IF-MIB::ifAlias': ['1.3.6.1.2.1.31.1.1.1.18'],
  'IF-MIB::ifSpeed': ['1.3.6.1.2.1.2.2.1.5'],
  'IF-MIB::ifInOctets': ['1.3.6.1.2.1.2.2.1.10'],
  'IF-MIB::ifOutOctets': ['1.3.6.1.2.1.2.2.1.16']
}
var oidGen = {
  ipRouteIfIndex: function(ip){
    if(!ip) ip = '127.0.0.1';
    return Array.merge(oid['RFC1213-MIB::ipRouteIfIndex'],ip.split('.'))
  },
  ifAlias: function(ifIndex){
    if(!ifIndex) ifIndex = network.public.ifIndex
    return Array.merge(oid['IF-MIB::ifAlias'],[ifIndex])
  },
  ifSpeed: function(ifIndex){
    if(!ifIndex) ifIndex = network.public.ifIndex
    return Array.merge(oid['IF-MIB::ifSpeed'],[ifIndex])
  },
  ifInOctets: function(ifIndex){
    if(!ifIndex) ifIndex = network.public.ifIndex
    return Array.merge(oid['IF-MIB::ifInOctets'],[ifIndex])
  },
  ifOutOctets: function(ifIndex){
    if(!ifIndex) ifIndex = network.public.ifIndex
    return Array.merge(oid['IF-MIB::ifOutOctets'],[ifIndex])
  }
}


/**
 * Detect our interface index by tracing the default route (0.0.0.0)
 * @param {string} community Community string; default: 'public'
 */
var detectNetwork = function(community,self){
  var multiSet = function(item,value){
    network.public[item] =
      network.replication[item] =
        network.management[item] = value
    return value
  }
  var snmpInitNetworkItem = function(item,callback){
    this.session.get({oid: oidGen[item](false)},function(err,result){
      if(!err){
        multiSet(item,result[0].value)
        callback()
      }
      else callback(err)
    })
  }
  async.series(
    [
      function(nextInit){
        async.series(
          [
            //detect our interface index by tracing the default route
            function(next){
              // RFC1213-MIB::ipRouteIfIndex.0.0.0.0
              snmpInitNetworkItem('ipRouteIfIndex',next)
            },
            //get useful interface name
            function(next){
              // IF-MIB::ifAlias.<ifIndex>
              snmpInitNetworkItem('ifAlias',next)
            },
            //get speed of interface
            function(next){
              // IF-MIB::ifSpeed.<ifIndex>
              snmpInitNetworkItem('ifSpeed',next)
            },
            //get inbound octet count for interface
            function(next){
              // IF-MIB::ifInOctets.<ifIndex>
              snmpInitNetworkItem('ifInOctets',next)
            },
            //get outbound octet count for interface
            function(next){
              // IF-MIB::ifOutOctets.<ifIndex>
              snmpInitNetworkItem('ifOutOctets',next)
            }
          ],
          function(err){
            if(err) return nextInit(err)
            nextInit()
          }
        )
      },
      function(nextInit){
        var interfaces = os.networkInterfaces()
        console.log(interfaces[network.public.name])
        var filter = function(address){
          if('IPv4' === address.family && !address.internal && !network.public.ip)
            multiSet('ip',address.address)
        }
        for(var i in interfaces){
          if(!interfaces.hasOwnProperty(i)) continue
          interfaces[i].forEach(filter)
        }
        nextInit()
      }
    ],
    function(err){
      if(err){
        console.log(err)
      }
    }
  )
}



/**
 * SnmpClient constructor
 * @constructor
 * @param {string} community Community string; default: 'public'
 * @param {number} port Port; default: 161
 * @param {string} host Host; default: 'localhost'
 * @param {array} timeouts Timeouts (see snmp-native docs); default: [5000,5000,5000,5000]
 * @param {string} family Address family; default: 'udp4'
 */
var SNMPClient = function(community,port,host,timeouts,family){
  var opts = snmp.defaultOptions
  if('string' === typeof community) opts.community = community
  if(port && 'number' === typeof port) opts.port = port
  if('string' === typeof host) opts.host = host
  if(timeouts && 4 === timeouts.length) opts.timeouts = timeouts
  if('string' === typeof family) opts.family = family
  this.session = new snmp.Session(opts)
  detectNetwork(opts.community,this)
}


/**
 * Get disk percentage used for whichever disk contains the given path
 * @param {string} path Path to get disk metrics for, default: config->root
 */
SNMPClient.prototype.getDiskPercentUsed = function(path){
  if(!path) path = config.get('root')
}

/**
 * Get disk percentage used for whichever disk contains the given path
 * @param {string} path Path to get disk metrics for, default: config->root
 */
SNMPClient.prototype.updateNetwork = function(which,next){
  self.session.get({oid: [1,3,6,1,2,1,2,2,1,5,snmpClient.network.public.ifIndex]},function(err,result){
    if(!err){
      if(net.speed !== result[0].value)
        logger.warn('WARNING: Interface speed changed? (' + net.speed + ' => ' + result[0].value)
      net.speed = result[0].value
      next()
    }
    else next(err)
  })
}



/**
 * Export module
 * @type {SNMPClient}
 */
module.exports = SNMPClient
