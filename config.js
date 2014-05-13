'use strict';
var ObjectManage = require('object-manage')
  , fs = require('fs')
  , os = require('os')
  , async = require('async')
  , snmp = require('snmp-native')

var netInfoDefaults = function(){
  return {
    ifIndex: 0,
    name: 'ERROR',
    ip: false,
    lastUpdate: 0,
    speed: 0,
    in: 0,
    out: 0
  }
}

var network = {
  public: netInfoDefaults(),
  replication: netInfoDefaults(),
  management: netInfoDefaults()
}
var ifIndexRouted = 0
var ifInfoRouted = {
  name: 'ERROR',
  ip: false,
  speed: 0,
  in: 0,
  out: 0
}
async.series(
  [
    function(nextInit){
      var snmpSession = new snmp.Session()
      async.series(
        [
          //detect our interface index by tracing the default route
          // RFC1213-MIB::ipRouteIfIndex.0.0.0.0
          function(next){
            snmpSession.get({oid: [1,3,6,1,2,1,4,21,1,2,0,0,0,0]},function(err,result){
              if(!err){
                ifIndexRouted = result[0].value
                next()
              } else return next(err)
            })
          },
          //get useful name from IF-MIB::ifAlias.<ifIndex>
          function(next){
            snmpSession.get({oid: [1,3,6,1,2,1,31,1,1,1,18,ifIndexRouted]},function(err,result){
              if(!err){
                ifInfoRouted.name = result[0].value
                next()
              } else next(err)
            })
          },
          //get speed from IF-MIB::ifSpeed.<ifIndex>
          function(next){
            snmpSession.get({oid: [1,3,6,1,2,1,2,2,1,5,ifIndexRouted]},function(err,result){
              if(!err){
                ifInfoRouted.speed = result[0].value
                next()
              } else next(err)
            })
          },
          //get in counter from IF-MIB::ifInOctets.<ifIndex>
          function(next){
            snmpSession.get({oid: [1,3,6,1,2,1,2,2,1,10,ifIndexRouted]},function(err,result){
              if(!err){
                ifInfoRouted.in = result[0].value
                next()
              } else next(err)
            })
          },
          //get out counter from IF-MIB::ifOutOctets.<ifIndex>
          function(next){
            snmpSession.get({oid: [1,3,6,1,2,1,2,2,1,16,ifIndexRouted]},function(err,result){
              if(!err){
                ifInfoRouted.out = result[0].value
                next()
              } else next(err)
            })
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
      console.log(interfaces[ifInfoRouted.name])
      var filter = function(address){
        if('IPv4' === address.family && !address.internal && !ifInfoRouted.ip)
          ifInfoRouted.ip = address.address
      }
      for(var i in interfaces){
        if(!interfaces.hasOwnProperty(i)) continue
        interfaces[i].forEach(filter)
      }
      nextInit()
    }
  ],
  function(err){
    if(err) console.log(err)
    console.log('ifIndexRouted detected: ' + ifIndexRouted)
    console.log('ifInfoRouted:',ifInfoRouted)
  }
)

var config = new ObjectManage()
config.load({
  //options
  version: '0.2.0',
  hostname: os.hostname(),
  domain: '',
  network: ifInfoRouted,
  ip: {
    public: ifInfoRouted.ip,
    replication: ifInfoRouted.ip,
    management: ifInfoRouted.ip
  },
  snmp: {
    ifIndex: {
      public: ifIndexRouted,
      replication: ifIndexRouted,
      management: ifIndexRouted
    }
  },
  root: __dirname + '/data',
  clones: {
    min: 2,
    max: 2
  },
  //services
  mesh: {
    enabled: true,
    port: 3000,
    multicast: {
      address: '226.0.0.1',
      ttl: 1
    },
    ping: { enabled: true, interval: 1000 },
    stat: { enabled: true, interval: 1000 },
    peerNext: { enabled: true, interval: 5000 },
    announce: { enabled: true, interval: 5000 }
  },
  supervisor: {
    enabled: false,
    retryInterval: 1000,
    patrolInterval: 15000
  },
  store: {
    enabled: false,
    import: {
      port: 3002,
      host: null
    },
    export: {
      port: 3001,
      host: null
    }
  },
  prism: {
    enabled: false,
    port: 3003,
    host: null,
    cache: {
      expire: 300
    }
  },
  shredder: {
    enabled: false,
    concurrency: 1,
    transcode: {
      videos: {
        enabled: false
      }
    }
  },
  gump: {
    enabled: false,
    port: 3004,
    host: null,
    tmpDir: __dirname + '/gump/tmp',
    embed: {
      seed: '3123572'
    },
    cookie: {
      secret: 'oose',
      maxAge: 2592000
    },
    prism: {
      host: '127.0.0.1',
      port: 3003,
      callbackToken: 'oose'
    }
  },
  lg: {
    enabled: false,
    port: 3005,
    host: null,
    user: 'oose',
    password: 'oose',
    cookie: {
      secret: 'oose',
      maxAge: 2592000
    }
  },
  mongoose: {
    enabled: false,
    dsn: 'mongodb://localhost/oose',
    options: {native_parser: true}
  }
})

if(fs.existsSync('./config.local.js')){
  config.load(require(__dirname + '/config.local.js'))
}


/**
 * Export config
 * @type {ObjectManage}
 */
module.exports = config
