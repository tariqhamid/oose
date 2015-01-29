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
  //databases
  redis: {
    host: '127.0.0.1',
    port: 6379,
    db: 0,
    prefix: 'oose',
    options: {}
  },
  mysql: {
    name: 'oose',
    host: '127.0.0.1',
    port: 3306,
    user: '',
    password: '',
    logging: false
  },
  ssl: {
    pem: oose.mock.sslOptions.pemFile
  },
  api: {
    maxSockets: 64
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
  //master
  master: {
    enabled: false,
    name: 'localmaster',
    port: 5970,
    host: null,
    timeout: 20000,
    workers: {
      count: 1,
      maxConnections: 10000
    },
    username: 'oose',
    password: 'oose',
    user: {
      sessionTokenName: 'X-OOSE-Token',
      sessionLife: 3600 //1hr
    }
  },
  //prism
  prism: {
    enabled: false,
    name: 'localprism',
    port: 5971,
    host: null,
    timeout: 20000,
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
    ],
    contentExistsCache: 300, //5 minutes
    purchaseLife: 21600, //6hrs
    purchaseCache: 7200, //2 hours
    guardFrequency: 60000 //1 minute
  },
  //storage system
  store: {
    enabled: false,
    name: 'localstore',
    port: 5972,
    host: null,
    timeout: 20000,
    username: 'oose',
    password: 'oose',
    workers: {
      count: 1,
      maxConnections: 10000
    }
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
