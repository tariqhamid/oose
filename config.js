'use strict';
var ObjectManage = require('object-manage')
  , fs = require('fs')
  , os = require('os')

var config = new ObjectManage()
config.load({
  version: '0.0.1',
  hostname: os.hostname(),
  root: './data',
  balance: {
    enabled: null
  },
  kue: {
    port: 3002,
    host: null,
    title: 'OOSE Tasks',
    options: {}
  },
  mesh: {
    debug: 0,
    address: '226.0.0.1',
    port: 3333,
    ttl: 1,
    interval: 6000
  },
  serve: {
    enabled: false,
    port: 3000,
    host: null
  }
})

if(fs.existsSync('./config.local.js')){
  config.load(require(__dirname + '/config.local.js'))
}

module.exports = config