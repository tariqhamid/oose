'use strict';
var fs = require('graceful-fs')
var ObjectManage = require('object-manage')
var os = require('os')
require('pkginfo')(module,'version')

var config = new ObjectManage()
config.$load({
  //options
  version: module.exports.version,
  locale: {
    domain: 'localhost',
    site: 'local1',
    zone: 'local',
    host: os.hostname(),
    id: 'oose'
  },
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
  shortid: {
    seed: '3123572'
  },
  //services
  announce: {
    enabled: false,
    port: 3000,
    multicast: {
      address: '226.0.0.1'
    },
    interval: 5000,
    bootTimeout: 250
  },
  ping: {
    enabled: false,
    port: 3010,
    host: null,
    interval: 1000,
    max: 10000
  },
  locate: {
    enabled: false,
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
      host: null,
      workers: {
        count: 1,
        maxConnections: 10000
      }
    },
    export: {
      port: 3001,
      portPublic: null,
      host: null,
      workers: {
        count: 1,
        maxConnections: 100000,
        recycleTimeout: 600000
      }
    }
  },
  prism: {
    enabled: false,
    port: 3003,
    portPublic: null,
    host: null,
    cache: {
      expire: 300
    },
    workers: {
      count: 1,
      maxConnections: 10000
    }
  },
  shredder: {
    enabled: false,
    port: 3008,
    host: null,
    concurrency: os.cpus().length || 1,
    snapshot: __dirname + '/shredder/snapshot.json',
    workerTimeout: 14400000 // 4 hours
  },
  hideout: {
    enabled: false,
    port: 3006,
    portPublic: null,
    host: null,
    url: 'http://localhost:3006',
    user: 'oose',
    password: null,
    workers: {
      count: 1,
      maxConnections: 10000
    }
  },
  executioner: {
    enabled: false,
    port: 3007,
    portPublic: null,
    host: null,
    workers: {
      count: 1,
      maxConnections: 10000
    },
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
    workers: {
      count: 1,
      maxConnections: 10000
    },
    baseUrl: 'http://localhost:3004',
    embedBaseUrl: 'http://localhost:3004',
    tmpDir: __dirname + '/gump/public/tmp',
    maxUploadSize: 4294967296, //4G
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
    workers: {
      count: 1,
      maxConnections: 10000
    },
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
    db: 0,
    options: {}
  },
  mongoose: {
    dsn: 'mongodb://localhost/oose',
    options: {native_parser: true} //jshint ignore:line
  },
  inventory: {
    concurrency: null
  }
})

//load global local overrides
if(fs.existsSync('./config.local.js')){
  config.$load(require(__dirname + '/config.local.js'))
}

//load instance overrides
if(process.env.OOSE_CONFIG){
  config.$load(require(process.env.OOSE_CONFIG))
}


/**
 * Export config
 * @type {ObjectManage}
 */
module.exports = config
