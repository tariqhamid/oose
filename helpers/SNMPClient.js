'use strict';
var config = require('../config')
  , os = require('os')
  , snmp = require('net-snmp')
  , async = require('async')



/**
 * Detect our interface index by tracing the default route (0.0.0.0)
 * @param {string} community Community string; default: 'public'
 * @param {object} Scope to use as "self"
 */
var detectNetwork = function(setter){
  var snmpInitNetworkItem = function(item,callback){
    this.session.get({oid: oidGen(item)},function(err,result){
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
 * @param {string} host Host; default: '127.0.0.1'
 * @param {string} community Community string; default: 'public'
 */
var SNMPClient = function(host,community){
  if('string' !== typeof host) host = '127.0.0.1:161'
  if('string' !== typeof community) community = 'public'
  this.session = new snmp.createSession(host,community)
  var self = this
  //detect basic networking
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
  self.network = {
    public: ifDefaults(),
    replication: ifDefaults(),
    management: ifDefaults()
  }
  self.oidMap = {
    ipRouteIfIndex: '1.3.6.1.2.1.4.21.1.2',
    ifAlias: '1.3.6.1.2.1.31.1.1.1.18',
    ifSpeed: '1.3.6.1.2.1.2.2.1.5',
    ifInOctets: '1.3.6.1.2.1.2.2.1.10',
    ifOutOctets: '1.3.6.1.2.1.2.2.1.16'
  }
  self.oidGen = function(oid,append){
    if(!append || !append.length) append = null
    switch(oid){
    case 'ipRouteIfIndex':
      // this group is for IP string input, or default 0.0.0.0
      if('string' !== typeof append) append = '0.0.0.0'
      break
    case 'ifAlias':
    case 'ifSpeed':
    case 'ifInOctets':
    case 'ifOutOctets':
      // this group takes an integer ifIndex
      if('number' !== typeof append) append = self.network.public.ifIndex
      break
    }
    return self.oidMap[oid] + '.' + append.toString()
  }

  detectNetwork(function(item,value){
    self.network.public[item] =
      self.network.replication[item] =
        self.network.management[item] = value
    return value
  }


  )
}


/**
 * Get disk percentage used for whichever disk contains the given path
 * @param {string} path Path to get disk metrics for, default: config->root
 */
SNMPClient.prototype.getDiskPercentUsed = function(path){
  if(!path) path = config.get('root')
}


/**
 * Update the network for given which (or whiches)
 * @param {string} which Network to update, default: *
 * @param {function} done Callback
 */
SNMPClient.prototype.updateNetwork = function(which,done){
  if(null === which) which = network.keys(SNMPClient.network)
  if('string' !== typeof which) which =
    self.session.get({oid: [1,3,6,1,2,1,2,2,1,5,SNMPClient.network.public.ifIndex]},function(err,result){
    if(!err){
      if(net.speed !== result[0].value)
        logger.warn('WARNING: Interface speed changed? (' + net.speed + ' => ' + result[0].value)
      net.speed = result[0].value
      done()
    }
    else done(err)
  })
}


/**
 * Export module
 * @type {SNMPClient}
 */
module.exports = SNMPClient
