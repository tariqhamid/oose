'use strict';
var snmp = require('net-snmp')


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
 */
exports.mib = {
  defaultRoute: [1,3,6,1,2,1,4,21,1,2,0,0,0,0].join('.'),
  cpuLoadTable: [1,3,6,1,2,1,25,3,3,1,2].join('.'),
  hrStorageTable: [1,3,6,1,2,1,25,2,3,1,3].join('.'),
  memoryAllocationUnit: function(index){
    var arr = [1,3,6,1,2,1,25,2,3,1,4]
    arr.push(index)
    return arr.join('.')
  },
  memorySize: function(index){
    var arr = [1,3,6,1,2,1,25,2,3,1,5]
    arr.push(index)
    return arr.join('.')
  },
  memoryUsed: function(index){
    var arr = [1,3,6,1,2,1,25,2,3,1,6]
    arr.push(index)
    return arr.join('.')
  },
  ifName: function(index){
    var arr = [1,3,6,1,2,1,2,2,1,2]
    arr.push(index)
    return arr.join('.')
  },
  ifSpeed: function(index){
    var arr = [1,3,6,1,2,1,2,2,1,5]
    arr.push(index)
    return arr.join('.')
  },
  ifInOctets: function(index){
    var arr = [1,3,6,1,2,1,2,2,1,10]
    arr.push(index)
    return arr.join('.')
  },
  ifOutOctets: function(index){
    var arr = [1,3,6,1,2,1,2,2,1,16]
    arr.push(index)
    return arr.join('.')
  }
}
