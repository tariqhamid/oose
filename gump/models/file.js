'use strict';
var mongoose = require('mongoose')
  , schema

mongoose.plugin(require('mongoose-list'))

schema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  tmp: String,
  path: {
    type: String,
    unique: true,
    required: true
  },
  mimeType: {
    type: String,
    index: true,
    default: 'application/octet-stream'
  },
  status: {
    type: String,
    index: true,
    default: 'processing'
  },
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
  }
})

// handling of created/modified
schema.pre('save',function(next){
  var now = new Date()
    ,_ref = this.get('metrics.dateCreated')
  if((void 0) === _ref || null === _ref)
    this.metrics.dateCreated = now
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
exports.model = mongoose.model('File',schema)
