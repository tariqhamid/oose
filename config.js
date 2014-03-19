'use strict';
var ObjectManage = require('object-manage')
  , fs = require('fs')
  , os = require('os')

var config = new ObjectManage()
config.load({
  version: '0.0.1',
  hostname: os.hostname(),
  mesh: {
    address: '226.0.0.1',
    ttl: 1,
    interval: 6000
  },
  serve: {
    port: 3000,
    dataRoot: './data/serve'
  },

  import: {
    port: 3001,
    dataRoot: './data/import'
  }
})

if(fs.existsSync('./config.local.js')){
  config.load(require('./config.local.js'))
}

module.exports = config