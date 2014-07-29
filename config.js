'use strict';
var ObjectManage = require('object-manage')
  , fs = require('fs')
  , os = require('os')

var config = new ObjectManage()
config.load({
  //options
  version: '0.3.0',
  hostname: os.hostname(),
  domain: '',
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
    enabled: false
  },
  gump: {
    enabled: false,
    port: 3004,
    host: null,
    tmpDir: __dirname + '/gump/public/tmp',
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
    options: {native_parser: true} //jshint ignore:line
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
