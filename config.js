'use strict';
var fs = require('graceful-fs')
var ObjectManage = require('object-manage')
var oose = require('oose-sdk')
var os = require('os')
var pkg = require('./package.json')


var config = new ObjectManage()
config.$load({
  //options
  version: pkg.version,
  //locale
  domain: 'localhost',
  site: 'localsite',
  zone: 'localzone',
  host: os.hostname(),
  //storage
  root: __dirname + '/data',
  //api setup
  ssl: {
    pem: oose.mock.sslOptions.pemFile
  },
  api: {
    maxSockets: 64
  },
  //heartbeat
  heartbeat: {
    frequency: 10000 //10 seconds
  },
  //databases
  redis: {
    host: '127.0.0.1',
    port: 6379,
    db: 0,
    prefix: 'oose',
    options: {}
  },
  couchdb: {
    host: '127.0.0.1',
    port: '5984',
    prefix: 'oose',
    database: 'oose',
    options: {
      secure: false,
      retries: 3,
      retryTimeout: 10000,
      auth: {
        username: 'oose',
        password: ''
      }
    }
  },
  //admin
  admin: {
    enabled: false,
    port: 5973,
    host: null,
    workers: {
      count: 1,
      maxConnections: 10000
    },
    cookie: {
      secret: 'oose',
      maxAge: 2592000000 //30 days
    }
  },
  //prism
  prism: {
    enabled: false,
    name: 'localprism',
    port: 5971,
    host: null,
    workers: {
      count: 1,
      maxConnections: 10000
    },
    denyStaticTypes: [
      'aac',
      'ape',
      'asf',
      'avi',
      'dv',
      'flac',
      'flv',
      'm2v',
      'm3a',
      'm4v',
      'mkv',
      'mp2',
      'mp3',
      'mp4',
      'mov',
      'moov',
      'mpeg',
      'mpg',
      'ogg',
      'ogm',
      'ts',
      'webm',
      'wmv'
    ],
    purchaseLife: 7200, //2 hrs
    purchaseAfterlife: 7200 //2hrs
  },
  //storage system
  store: {
    enabled: false,
    name: 'localstore',
    port: 5972,
    host: null,
    workers: {
      count: 1,
      maxConnections: 10000
    },
    //how often we scan inventory
    inventoryFrequency: 3600000 //1hr
  }
})

//load test overrides
if('test' === process.env.NODE_ENV){
  config.$load(require(__dirname + '/config.test.js'))
}

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
