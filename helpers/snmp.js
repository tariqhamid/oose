'use strict';
var async = require('async')
var debug = require('debug')('oose:helper:snmp')
var snmp = require('snmp-native')
var asn1ber = require('../node_modules/snmp-native/lib/asn1ber')

var i = 0
var isBinary = /[\x00-\x08\x0E-\x1F]/

var mib2 = '.1.3.6.1.2.1'
var hrStorage = mib2 + '.25.2'
var hrDevice = mib2 + '.25.3'
var ifTable = mib2 + '.2.2'
var ifEntry = ifTable + '.1'
var tcpConnectionTable = mib2 + '.6.19'

var mibString = function(){
  var arg
  var components = []
  for(i=0; i < arguments.length; i++){
    arg = arguments[i]
    if('number' === typeof arg) arg = '' + arg
    if('string' !== typeof arg || !arg.length) arg = ''
    arg = arg.replace(/^\./g,'').replace(/\.$/g,'')
    if(arg) components.push(arg)
  }
  var rv = components.join('.')
  if(0 !== rv.indexOf('.')) rv = '.' + rv
  return rv
}


/**
 * snmp-native returns some things in less-consumable format
 * this converts those data types to string or number, etc
 * @param {Object} r
 * @return {Object} The modified object (which is also modified via reference)
 */
var snmpScrub = function(r){
  r.oid = '.' + r.oid.join('.')
  switch(r.type){
  //OIDs and IPs come back as Array style OID, convert to string
  case asn1ber.types.ObjectIdentifier:
    r.value = '.' + r.value.join('.')
    break
  case asn1ber.types.IpAddress:
    r.value = r.value.join('.')
    break
  //pre-convert OctetString to actual text
  case asn1ber.types.OctetString:
    //but if it seems binary leave it alone
    if(!isBinary.test(r.value.toString()))
      r.value = r.value.toString()
    break
  }
  return r
}



/**
 * SNMP Helper object
 * @param {Object} options Optional options object
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
 * @return {String} OID string
 */
SnmpHelper.prototype.mib = {
  hrDeviceType: function(){
    return mibString(hrDevice,'2.1.2')
  },
  hrDeviceTypes: function(type){
    return mibString(hrDevice,'1',type)
  },
  hrProcessorLoad: function(){
    return mibString(hrDevice,'3.1.2')
  },
  hrStorageAllocationUnits: function(index){
    return mibString(hrStorage,'3.1.4',index)
  },
  hrStorageDescr: function(){
    return mibString(hrStorage,'3.1.3')
  },
  hrStorageSize: function(index){
    return mibString(hrStorage,'3.1.5',index)
  },
  hrStorageType: function(){
    return mibString(hrStorage,'3.1.2')
  },
  hrStorageTypes: function(type){
    return mibString(hrStorage,'1',type)
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
  ifPhysAddress: function(index){
    return mibString(ifEntry,'6',index)
  },
  ifSpeed: function(index){
    return mibString(ifEntry,'5',index)
  },
  ifInOctets: function(index){
    return mibString(ifEntry,'10',index)
  },
  ifOutOctets: function(index){
    return mibString(ifEntry,'16',index)
  },
  ifHCInOctets: function(index){
    return mibString(mib2,'31.1.1.1.6',index)
  },
  ifHCOutOctets: function(index){
    return mibString(mib2,'31.1.1.1.10',index)
  },
  ifTable: function(){
    return mibString(ifTable)
  },
  ip: function(extra){
    return mibString(mib2,'4',extra)
  },
  ipAdEntAddr: function(ip){
    return mibString(mib2,'4.20.1.1',ip)
  },
  ipAdEntIfIndex: function(ip){
    return mibString(mib2,'4.20.1.2',ip)
  },
  ipAdEntNetMask: function(ip){
    return mibString(mib2,'4.20.1.3',ip)
  },
  ipRouteIfIndex: function(ip){
    return mibString(mib2,'4.21.1.2',ip)
  },
  ipRouteNextHop: function(ip){
    return mibString(mib2,'4.21.1.7',ip)
  },
  nsCacheTimeout: function(oid){
    return mibString('1.3.6.1.4.1.8072.1.5.3.1.2',oid)
  },
  sysUpTimeInstance:function(){
    return mibString(mib2,'1.3.0')
  },
  tcpConnectionTable: function(){
    return mibString(tcpConnectionTable)
  },
  tcpConnectionState: function(ip,port){
    return mibString(tcpConnectionTable,'1.7.1.4',ip,port)
  }
}


/**
 * Pass through the ASN.1 BER Types lookup table
 * @type {Object}
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
    for(i=0; i < arguments.length-1; i++){
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
    for(i=0; i < arguments.length-1; i++){
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
        var oids = []
        var handlers = []
        for(i=0; i < getBulkQ.length; i++){
          oids.push(getBulkQ[i].oid)
          handlers.push(getBulkQ[i].handler)
        }
        that.getBulkQ = []
        async.eachSeries(
          oids,
          function(oid,treeDone){
            that.sess.getSubtree({oid:oid},function(err,res){
              if(err || !res || !res.length){
                handlers[oids.indexOf(oid)](err,treeDone)
                return
              }
              for(i=0; i < res.length; i++) snmpScrub(res[i])
              handlers[oids.indexOf(oid)](res,treeDone)
            })
          },
          next
        )
      },
      function(next){
        //do the get
        if(!getQ.length) return next()
        var oids = []
        var handlers = {}
        for(i=0; i < getQ.length; i++){
          oids.push(getQ[i].oid)
          handlers[getQ[i].oid] = getQ[i].handler
        }
        that.getQ = []
        that.sess.getAll({oids: oids},function(err,res){
          var i = 0
          async.series(
            [
              function(next){
                if(err || !res || !res.length){
                  async.eachSeries(oids,function(oid,done){
                    handlers[oids.indexOf(oid)](err,done)
                  },function(){
                    next(err)
                  })
                } else next()
              },
              function(next){
                async.eachSeries(oids,
                  function(oid,done){
                    handlers[oid](snmpScrub(res[i++]),done)
                  },
                  next
                )
              }
            ],
            next
          )
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
