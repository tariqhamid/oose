'use strict';
var snmp = require('net-snmp')


/**
 * Pass through the ObjectType lookup table
 * @type {exports.ObjectType|*}
 */
exports.ObjectType = snmp.ObjectType


/**
 * Create session
 * @param {string} host Host; default: '127.0.0.1'
 * @param {string} community Community string; default: 'public'
 * @param {object} options Optional options object
 * @return {snmp.session}
 */
exports.createSession = function(host,community,options){
  if(!options) options = {}
  if(!host || 'string' !== typeof host){
    host = '127.0.0.1'
    options.port = 161
  }
  if(!community || 'string' !== typeof community) community = 'public'
  return snmp.createSession(host,community,options)
}


/**
 * Shortcut for MIB definitions for OIDs
 * @type {{defaultRoute: string}}
 * @return {string}
 */
exports.mib = {
  ipRouteIfIndex: function(ip){
    return ['1.3.6.1.2.1.4.21.1.2',ip].join('.')
  },
  hrDeviceType: '1.3.6.1.2.1.25.3.2.1.2',
  hrDeviceTypes: function(type){
    return ['1.3.6.1.2.1.25.3.1',type].join('.')
  },
  hrProcessorLoad: '1.3.6.1.2.1.25.3.3.1.2',
  hrStorageTable: '1.3.6.1.2.1.25.2.3.1.3',
  memoryAllocationUnit: function(index){
    return ['1.3.6.1.2.1.25.2.3.1.4',index].join('.')
  },
  memorySize: function(index){
    return ['1.3.6.1.2.1.25.2.3.1.5',index].join('.')
  },
  memoryUsed: function(index){
    return ['1.3.6.1.2.1.25.2.3.1.6',index].join('.')
  },
  ifName: function(index){
    return ['1.3.6.1.2.1.2.2.1.2',index].join('.')
  },
  ifAlias: function(index){
    return ['1.3.6.1.2.1.31.1.1.1.18',index].join('.')
  },
  ifSpeed: function(index){
    return ['1.3.6.1.2.1.2.2.1.5',index].join('.')
  },
  ifInOctets: function(index){
    return ['1.3.6.1.2.1.2.2.1.10',index].join('.')
  },
  ifOutOctets: function(index){
    return ['1.3.6.1.2.1.2.2.1.16',index].join('.')
  }
}
