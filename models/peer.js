'use strict';
var mongoose = require('mongoose')
var ip = require('ip')
var fs = require('fs')
var config = require('../config')
var schema

//load plugins
mongoose.plugin(require('mongoose-list'),{
  'sort': 'hostname'
})

schema = new mongoose.Schema({
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
    default: fs.readFileSync(config.get('executioner.defaultConfig'))
  },
  version: {
    type: String,
    default: 'unkown'
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
    index:true,
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
})

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
 * Mongoose schema
 * @type {exports.Schema}
 */
exports.schema = schema


/**
 * Mongoose model
 */
exports.model = mongoose.model('Peer',schema)
