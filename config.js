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
  version: '0.0.1',
  hostname: os.hostname(),
  ip: {
    public: guessedIP,
    replication: guessedIP,
    management: guessedIP
  },
  root: './data',
  balance: {
    enabled: null
  },
  mesh: {
    debug: 0,
    address: '226.0.0.1',
    port: 3000,
    ttl: 1,
    interval: 6000
  },
  serve: {
    enabled: false,
    port: 3001,
    host: null
  },
  import: {
    enabled: false,
    port: 3002,
    host: null
  },
  resolve: {
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

module.exports = config