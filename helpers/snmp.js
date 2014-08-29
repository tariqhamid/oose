'use strict';
var async = require('async')
var debug = require('debug')('oose:helper:snmp')
var snmp = require('snmp-native')
var asn1ber = require('../node_modules/snmp-native/lib/asn1ber')

var i = 0

var mib2 = '1.3.6.1.2.1'
var hrStorage = mib2 + '.25.2'
var hrDevice = mib2 + '.25.3'
var ifEntry = mib2 + '.2.2.1'

var mibArray = function(){
  var arg
  var components = []
  for(var i=0; i<arguments.length; i++){
    arg = arguments[i]
    if('number' === typeof arg) arg = '' + arg
    if('string' !== typeof arg || !arg.length) arg = ''
    arg = arg.replace(/^\./g,'').replace(/\.$/g,'')
    if(arg) components.push(arg)
  }
  return components.join('.').split('.').map(function(v){return +v})
}



/**
 * SNMP Helper object
 * @param {object} options Optional options object
 * @constructor
 */
var SnmpHelper = function(options){
  var that = this
  if(!options) options = {}
  //options.version = snmp.Version2c
  that.sess = new snmp.Session(options)
  that.getQ = []
  that.getBulkQ = []
}


/**
 * Shortcut for MIB definitions for OIDs
 * @return {string} OID string
 */
SnmpHelper.prototype.mib = {
  sysUpTimeInstance:function(){
    return mibArray(mib2,'1.3.0')
  },
  ip: function(extra){
    return mibArray(mib2,'4',extra)
  },
  ipAdEntAddr: function(ip){
    return mibArray(mib2,'4.20.1.1',ip)
  },
  ipAdEntIfIndex: function(ip){
    return mibArray(mib2,'4.20.1.2',ip)
  },
  ipAdEntNetMask: function(ip){
    return mibArray(mib2,'4.20.1.3',ip)
  },
  ipRouteIfIndex: function(ip){
    return mibArray(mib2,'4.21.1.2',ip)
  },
  ipRouteNextHop: function(ip){
    return mibArray(mib2,'4.21.1.7',ip)
  },
  tcpConnectionState: function(ip,port){
    return mibArray(mib2,'6.19.1.7.1.4',ip,port)
  },
  hrDeviceType: function(){
    return mibArray(hrDevice,'2.1.2')
  },
  hrDeviceTypes: function(type){
    return mibArray(hrDevice,'1',type)
  },
  hrProcessorLoad: function(){
    return mibArray(hrDevice,'3.1.2')
  },
  hrStorageType: function(){
    return mibArray(hrStorage,'3.1.2')
  },
  hrStorageTypes: function(type){
    return mibArray(hrStorage,'1',type)
  },
  hrStorageDescr: function(){
    return mibArray(hrStorage,'3.1.3')
  },
  hrStorageAllocationUnits: function(index){
    return mibArray(hrStorage,'3.1.4',index)
  },
  hrStorageSize: function(index){
    return mibArray(hrStorage,'3.1.5',index)
  },
  hrStorageUsed: function(index){
    return mibArray(hrStorage,'3.1.6',index)
  },
  ifAlias: function(index){
    return mibArray(mib2,'31.1.1.1.18',index)
  },
  ifDescr: function(index){
    return mibArray(ifEntry,'2',index)
  },
  ifSpeed: function(index){
    return mibArray(ifEntry,'5',index)
  },
  ifPhysAddress: function(index){
    return mibArray(ifEntry,'6',index)
  },
  ifInOctets: function(index){
    return mibArray(ifEntry,'10',index)
  },
  ifOutOctets: function(index){
    return mibArray(ifEntry,'16',index)
  }
}


/**
 * Pass through the ASN.1 BER Types lookup table
 * @type {object}
 */
SnmpHelper.prototype.types = asn1ber.types


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
      tmp = mibArray(tmp,arguments[i])
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
      tmp = mibArray(tmp,arguments[i])
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
        var oids = []
        var handlers = []
        for(i=0; i<getBulkQ.length; i++){
          oids.push(getBulkQ[i].oid)
          handlers.push(getBulkQ[i].handler)
        }
        that.getBulkQ = []
        async.eachSeries(
          oids,
          function(oid,treeDone){
            that.sess.getSubtree({oid:oid},function(err,res){
              if(err) return next(err)
              if(!res.length)
                return next('No getBulk() result (and no error?)')
              for(i=0; i<res.length; i++){
                var r = res[i]
                r.oid = r.oid.join('.')
                switch(r.type){
                case asn1ber.types.ObjectIdentifier:
                case asn1ber.types.IpAddress:
                  r.value = r.value.join('.')
                  break
                }
              }
              handlers[oids.indexOf(oid)](res)
              treeDone()
            })
          },
          function(err){
            next(err)
          }
        )
      },
      function(next){
        //do the get
        if(!getQ.length) return next()
        var oids = []
        var handlers = {}
        for(i = 0; i < getQ.length; i++){
          oids.push(getQ[i].oid)
          handlers[getQ[i].oid.join('.')] = getQ[i].handler
        }
        that.getQ = []
        that.sess.getAll({oids: oids},function(err,res){
          if(err) return next(err)
          if(!res.length)
            return next('No get() result (and no error?)')
          for(i = 0; i < res.length; i++){
            var r = res[i]
            r.oid = r.oid.join('.')
            if(asn1ber.types.ObjectIdentifier === r.type)
              r.value = r.value.join('.')
            if(asn1ber.types.OctetString === r.type)
              r.value = r.value.toString()
            handlers[oids[i].join('.')](r)
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
