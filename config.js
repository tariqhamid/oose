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

var config = new ObjectManage()
config.load({
  //options
  version: '0.0.1',
  hostname: os.hostname(),
  ip: {
    public: guessedIP,
    replication: guessedIP,
    management: guessedIP
  },
  root: './data',
  copies: {
    min: 2,
    max: 2
  },
  //services
  mesh: {
    debug: 0,
    address: '226.0.0.1',
    port: 3000,
    ttl: 1,
    discoverInterval: 1000,
    statInterval: 1000,
    nextPeerInterval: 5000,
    announceInterval: 5000
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
    host: null
  },
  kue: {
    port: 3010,
    host: null,
    title: 'OOSE Tasks',
    options: {}
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
