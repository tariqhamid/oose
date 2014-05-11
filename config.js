'use strict';
var ObjectManage = require('object-manage')
  , fs = require('fs')
  , os = require('os')

var guessIP = function(){
  var interfaces = os.networkInterfaces()
  var ip = '127.0.0.1'
  var filter = function(address){
    if('IPv4' === address.family && !address.internal && !ip)
      ip = address.address
  }
  for(var i in interfaces){
    if(!interfaces.hasOwnProperty(i)) continue
    interfaces[i].forEach(filter)
  }
  return ip
}
var guessedIP = guessIP()
var guessedInterface = '4'

var config = new ObjectManage()
config.load({
  //options
  version: '0.0.1',
  hostname: os.hostname(),
  domain: '',
  ip: {
    public: guessedIP,
    replication: guessedIP,
    management: guessedIP
  },
  snmp: {
    interface: {
      public: guessedInterface,
      replication: guessedInterface,
      management: guessedInterface
    }
  },
  root: __dirname + '/_data',
  clones: {
    min: 2,
    max: 2
  },
  //services
  mesh: {
    enabled: true,
    debug: 0,
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
