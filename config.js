'use strict';
var fs = require('graceful-fs')
var ObjectManage = require('object-manage')
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
    key: __dirname + '/test/assets/ssl/oose_test.key',
    cert: __dirname + '/test/assets/ssl/oose_test.crt'
  },
  //master
  master: {
    enabled: false,
    name: 'localmaster',
    port: 3001,
    host: null,
    workers: {
      count: 1,
      maxConnections: 10000
    },
    username: 'oose',
    password: 'oose',
    user: {
      sessionLife: 3600 //1hr
    }
  },
  //prism
  prism: {
    enabled: false,
    name: 'localprism',
    port: 3002,
    host: null,
    username: 'oose',
    password: 'oose',
    workers: {
      count: 1,
      maxConnections: 10000
    },
    contentExistsCache: 300, //5 minutes
    guardFrequency: 60000 //1 minute
  },
  //storage system
  store: {
    enabled: false,
    name: 'localstore',
    port: 3003,
    host: null,
    username: 'oose',
    password: 'oose',
    workers: {
      count: 1,
      maxConnections: 10000
    }
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
