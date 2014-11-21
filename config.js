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
  name: 'localinstance',
  domain: 'localhost',
  site: 'localsite',
  zone: 'localzone',
  host: os.hostname(),
  //storage
  root: __dirname + '/root',
  //id generation
  shortid: {
    seed: '3123572'
  },
  //databases
  redis: {
    host: '127.0.0.1',
    port: 6379,
    db: 0,
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
  //master
  master: {
    enabled: false,
    port: 3001,
    host: null,
    workers: {
      count: 1,
      maxConnections: 10000
    },
    prismList: []
  },
  //prism
  prism: {
    enabled: false,
    port: 3002,
    host: null,
    workers: {
      count: 1,
      maxConnections: 10000
    }
  },
  //storage system
  store: {
    enabled: false,
    port: 3003,
    host: null,
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
