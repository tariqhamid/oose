'use strict';
var mongoose = require('mongoose')
var ip = require('ip')
var fs = require('graceful-fs')
var config = require('../config')

//moment and the duration plugin
require('moment-duration-format')
var moment = require('moment')


//load plugins
mongoose.plugin(require('mongoose-list'),{
  'sort': 'hostname'
})


/**
 * Schema type definition
 * @type _schema {{hostname: string, ip: number, config: string, version: string, sshUsername: string, sshPort: number, status: string, log: {date: Date, message: string, level: string}[], metrics: {dateCreated: Date, dateModified: Date}, os: {name: string, version: string, arch: string, kernel: string, uptime: string, load: Array}}}
 */
var _schema = {
  hostname: {
    type: String,
    required: true,
    index: true
  },
  ip: {
    type: Number,
    required: true,
    index: true,
    set: function(val){
      return ip.toLong(val)
    },
    get: function(val){
      return ip.fromLong(val)
    }
  },
  config: {
    type: String,
    default: fs.readFileSync(config.executioner.defaultConfig)
  },
  version: {
    type: String,
    default: 'unknown'
  },
  sshUsername: {
    type: String,
    default: 'root'
  },
  sshPort: {
    type: Number,
    default: 22
  },
  status: {
    type: String,
    required: true,
    index: true,
    enum: [
      'unknown',
      'staging',
      'stopped',
      'ok',
      'error'
    ],
    default: 'unknown'
  },
  log: [
    {
      date: {
        type: Date,
        required: true,
        default: Date.now
      },
      message: String,
      level: {
        type: String,
        default: 'info'
      }
    }
  ],
  metrics: {
    dateCreated: {
      label: 'Creation Date',
      type: Date,
      default: Date.now,
      required: true,
      index: true
    },
    dateModified: {
      label: 'Last Modified',
      type: Date,
      default: Date.now,
      required: true,
      index: true
    }
  },
  //meta info
  os: {
    name: String,
    version: String,
    arch: String,
    kernel: String,
    uptime: String,
    load: Array
  }
}
var schema = new mongoose.Schema(_schema)


/**
 * Do some shit here that makes the uptime fancy
 * @return {*}
 * @this {PeerModel}
 */
schema.methods.uptime = function(){
  return moment.duration(this.os.uptime * 1000).format(
    'd [days], h [hrs], m [min]'
  )
}

// handling of created/modified
schema.pre('save',function(next){
  var now = new Date()
  if(this.isNew){
    this.log.push({message: 'Peer created'})
    this.metrics.dateCreated = now
  }
  this.metrics.dateModified = now
  next()
})


/**
 * Internal schema definition
 * @type {_schema}
 */
exports._schema = _schema


/**
 * Mongoose schema
 * @type {mongoose.Schema}
 */
exports.schema = schema


/**
 * Mongoose model
 * @type {mongoose.Model}
 */
exports.model = mongoose.model('Peer',schema)
