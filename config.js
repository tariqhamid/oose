'use strict';
var fs = require('graceful-fs')
var ObjectManage = require('object-manage')
var os = require('os')
require('pkginfo')(module,'version')

var config = new ObjectManage()
config.$load({
  //options
  version: module.exports.version,
  hostname: os.hostname(),
  domain: '',
  root: __dirname + '/data',
  clone: {
    port: 3009,
    portPublic: null,
    host: null,
    copies: {
      min: 2,
      max: 2
    },
    concurrency: os.cpus().length || 4
  },
  workers: {
    enabled: true,
    count: os.cpus().length || 4
  },
  shortid: {
    seed: '3123572'
  },
  //services
  announce: {
    enabled: true,
    port: 3000,
    multicast: {
      address: '226.0.0.1'
    },
    interval: 5000,
    bootTimeout: 250
  },
  ping: {
    enabled: true,
    port: 3010,
    host: null,
    multicast: {
      address: '226.0.0.1'
    },
    interval: 1000
  },
  locate: {
    enabled: true,
    port: 3011,
    host: null,
    multicast: {
      address: '226.0.0.1'
    },
    timeout: 2000 //time to wait for locates to timeout (usually due to errors)
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
      portPublic: null,
      host: null
    },
    export: {
      port: 3001,
      portPublic: null,
      host: null
    }
  },
  prism: {
    enabled: false,
    port: 3003,
    portPublic: null,
    host: null,
    cache: {
      expire: 300
    }
  },
  shredder: {
    enabled: false,
    port: 3008,
    host: null,
    concurrency: os.cpus().length || 1,
    snapshot: __dirname + '/shredder/snapshot.json'
  },
  hideout: {
    enabled: false,
    port: 3006,
    portPublic: null,
    host: null,
    url: 'http://localhost:3006',
    user: 'oose',
    password: null
  },
  executioner: {
    enabled: false,
    port: 3007,
    portPublic: null,
    host: null,
    url: 'http://localhost:3007',
    user: 'oose',
    password: null,
    cookie: {
      secret: 'oose',
      maxAge: 2592000000 //30 days
    },
    ssh: {
      privateKey: null,
      publicKey: null
    },
    ssl: {
      key: null,
      crt: null
    },
    defaultConfig: __dirname + '/executioner/src/config.js'
  },
  gump: {
    enabled: false,
    port: 3004,
    portPublic: null,
    host: null,
    baseUrl: 'http://localhost:3004',
    embedBaseUrl: 'http://localhost:3004',
    tmpDir: __dirname + '/gump/public/tmp',
    embed: {
      prismUrl: 'http://localhost:3003/',
      defaultPreviewImageUrl: '/images/defaultPreview.png'
    },
    cookie: {
      secret: 'oose',
      maxAge: 2592000
    },
    prism: {
      host: '127.0.0.1',
      port: 3003,
      hostUrl: 'localhost:3003',
      callbackToken: 'oose'
    }
  },
  lg: {
    enabled: false,
    port: 3005,
    portPublic: null,
    host: null,
    user: 'oose',
    password: 'oose',
    cookie: {
      secret: 'oose',
      maxAge: 2592000
    }
  },
  redis: {
    host: '127.0.0.1',
    port: 6379,
    options: {}
  },
  mongoose: {
    enabled: false,
    dsn: 'mongodb://localhost/oose',
    options: {native_parser: true} //jshint ignore:line
  },
  inventory: {
    concurrency: null
  }
})

if(fs.existsSync('./config.local.js')){
  config.$load(require(__dirname + '/config.local.js'))
}


/**
 * Export config
 * @type {ObjectManage}
 */
module.exports = config
