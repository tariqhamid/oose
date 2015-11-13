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
    maxSockets: 64,
    sessionTokenName: 'X-OOSE-Token'
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
      cache: false,
      retries: 3,
      retryTimeout: 10000,
      auth: {
        username: 'oose',
        password: ''
      }
    }
  },
  purchase: {
    life: 7200000, //2 hrs
    afterlife: 7200000 //2hrs
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
    username: 'oose',
    password: 'oose',
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
    ]
  },
  //storage system
  store: {
    enabled: false,
    name: 'localprism:localstore',
    port: 5972,
    host: null,
    username: 'oose',
    password: 'oose',
    workers: {
      count: 1,
      maxConnections: 10000
    },
    //how often we scan inventory
    inventoryFrequency: 3600000, //1hr
    purchaseFrequency: 300000 //5 minutes
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
