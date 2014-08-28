'use strict';
var async = require('async')
var debug = require('debug')('oose:helper:snmp')
var snmp = require('net-snmp')

var i = 0
var bulkDepth = 256

var mib2 = '1.3.6.1.2.1'
var hrStorage = mib2 + '.25.2'
var hrDevice = mib2 + '.25.3'
var ifEntry = mib2 + '.2.2.1'

var mibString = function(){
  var arg
  var components = []
  for(var i=0; i<arguments.length; i++){
    arg = arguments[i]
    if('number' === typeof arg) arg = '' + arg
    if('string' !== typeof arg || !arg.length) arg = ''
    arg = arg.replace(/^\./g,'').replace(/\.$/g,'')
    if(arg) components.push(arg)
  }
  return components.join('.')
}



/**
 * SNMP Helper object
 * @param {string} host Host; default: '127.0.0.1'
 * @param {string} community Community string; default: 'public'
 * @param {object} options Optional options object
 * @constructor
 */
var SnmpHelper = function(host,community,options){
  var that = this
  if(!options) options = {}
  if(!host || 'string' !== typeof host){
    host = '127.0.0.1'
    options.port = 161
  }
  if(!community || 'string' !== typeof community) community = 'public'
  that.sess = snmp.createSession(host,community,options)
  that.getQ = []
  that.getBulkQ = []
}


/**
 * Shortcut for MIB definitions for OIDs
 * @return {string} OID string
 */
SnmpHelper.prototype.mib = {
  sysUpTimeInstance:function(){
    return mibString(mib2,'1.3.0')
  },
  ipRouteIfIndex: function(ip){
    return mibString(mib2,'4.21.1.2',ip)
  },
  hrDeviceType: function(){
    return mibString(hrDevice,'2.1.2')
  },
  hrDeviceTypes: function(type){
    return mibString(hrDevice,'1',type)
  },
  hrProcessorLoad: function(){
    return mibString(hrDevice,'3.1.2')
  },
  hrStorageType: function(){
    return mibString(hrStorage,'3.1.2')
  },
  hrStorageTypes: function(type){
    return mibString(hrStorage,'1',type)
  },
  hrStorageDescr: function(){
    return mibString(hrStorage,'3.1.3')
  },
  hrStorageAllocationUnits: function(index){
    return mibString(hrStorage,'3.1.4',index)
  },
  hrStorageSize: function(index){
    return mibString(hrStorage,'3.1.5',index)
  },
  hrStorageUsed: function(index){
    return mibString(hrStorage,'3.1.6',index)
  },
  ifAlias: function(index){
    return mibString(mib2,'31.1.1.1.18',index)
  },
  ifDescr: function(index){
    return mibString(ifEntry,'2',index)
  },
  ifSpeed: function(index){
    return mibString(ifEntry,'5',index)
  },
  ifInOctets: function(index){
    return mibString(ifEntry,'10',index)
  },
  ifOutOctets: function(index){
    return mibString(ifEntry,'16',index)
  }
}


/**
 * Pass through the ObjectType lookup table
 * @type {exports.ObjectType|*}
 */
SnmpHelper.prototype.ObjectType = snmp.ObjectType


/**
 * Add a snmp.get() to the queue
 * @param {string} oid OID string (you can list multiple components)
 * @param {function} handler Processing callback (always last arg)
 */
SnmpHelper.prototype.add = function(oid,handler){
  var that = this
  if(3 < arguments.length){
    handler = arguments[arguments.length-1]
    var tmp = ''
    for(var i=0; i<arguments.length-1; i++){
      tmp = mibString(tmp,arguments[i])
    }
    oid = tmp
    debug('add() built oid:' + oid)
  }
  that.getQ.push({oid:oid,handler:handler})
}


/**
 * Add a snmp.getBulk() to the queue
 * @param {string} oid OID string (you can list multiple components)
 * @param {function} handler Processing callback (always last arg)
 */
SnmpHelper.prototype.addBulk = function(oid,handler){
  var that = this
  if(3 < arguments.length){
    handler = arguments[arguments.length-1]
    var tmp = ''
    for(var i=0; i<arguments.length-1; i++){
      tmp = mibString(tmp,arguments[i])
    }
    oid = tmp
    debug('addBulk() built oid:' + oid)
  }
  that.getBulkQ.push({oid:oid,handler:handler})
}


/**
 * Run the getQ/getBulkQ
 * @param {function} done Callback
 */
SnmpHelper.prototype.run = function(done){
  var that = this
  var getBulkQ = that.getBulkQ
  var getQ = that.getQ
  if('function' !== typeof done)
    done = function(){ debug('run() called without callback?') }
  async.series(
    [
      function(next){
        //do the bulks first usually these are tables for inventories/detection
        if(!getBulkQ.length) return next()
        debug('getBulkQ:',getQ)
        var oids = []
        var handlers = []
        for(i=0; i<getBulkQ.length; i++){
          oids.push(getBulkQ[i].oid)
          handlers.push(getBulkQ[i].handler)
        }
        that.getBulkQ = []
        that.sess.getBulk(oids,0,bulkDepth,function(err,res){
          if(err) return next(err)
          if(!res.length)
            return next('No getBulk() result (and no error?)')
          for(i=0; i<res.length; i++){
            var r = res[i]
            var s = []
            for(var j=0; j<r.length; j++){
              //if the requested OID is not part of this result, ignore
              // this is a workaround for getBulk returning extra crap
              if(
                (oids[i] === r[j].oid) || //direct OID match
                (0 === r[j].oid.indexOf(oids[i] + '.')) //subOID match
              ){
                s.push(r[j])
                s[j].error = snmp.isVarbindError(r[j])
                if(snmp.ObjectType.OctetString === r[j].type){
                  s[j].value = r[j].value.toString()
                }
              }
            }
            handlers[i](s)
          }
          next()
        })
      },
      function(next){
        //do the get
        if(!getQ.length) return next()
        debug('getQ:',getQ)
        var oids = []
        var handlers = []
        for(i=0; i<getQ.length; i++){
          oids.push(getQ[i].oid)
          handlers.push(getQ[i].handler)
        }
        that.getQ = []
        that.sess.get(oids,function(err,res){
          if(err) return next(err)
          if(!res.length)
            return next('No get() result (and no error?)')
          for(i=0; i<res.length; i++){
            var r = res[i]
            r.error = snmp.isVarbindError(r)
            if(snmp.ObjectType.OctetString === r.type){
              r.value = r.value.toString()
            }
            handlers[i](r)
          }
          next()
        })
      }
    ],
    done
  )
}


/**
 * Export module
 * @type {SnmpHelper}
 */
exports = module.exports = SnmpHelper
