'use strict';
var fs = require('graceful-fs')
var ObjectManage = require('object-manage')
var os = require('os')
require('pkginfo')(module,'version')

var config = new ObjectManage()
config.$load({
  //options
  version: module.exports.version,
  id: 'localinstance1',
  locale: {
    domain: 'localhost',
    site: 'local1',
    zone: 'local',
    host: os.hostname()
  },
  root: __dirname + '/data',
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
  mongoose: {
    dsn: 'mongodb://localhost/oose',
    options: {native_parser: true} //jshint ignore:line
  },
  //storage system
  store: {
    enabled: false,
    port: 3001,
    portPublic: null,
    host: null,
    workers: {
      count: 1,
      maxConnections: 10000
    },
    clone: {
      copies: {
        min: 2,
        max: 2
      }
    }
  },
  //prism
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
    },
    hideout: {
      user: 'oose',
      password: null
    }
  },
  shredder: {
    enabled: false,
    port: 3008,
    host: null,
    concurrency: os.cpus().length || 1,
    snapshot: __dirname + '/shredder/snapshot.json',
    workerTimeout: 14400000 // 4 hours
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
