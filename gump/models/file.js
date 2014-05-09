'use strict';
var mongoose = require('mongoose')
  , async = require('async')
  , schema

mongoose.plugin(require('mongoose-list'))

schema = new mongoose.Schema({
  folder: {
    type: Boolean,
    require: true,
    default: false
  },
  name: {
    type: String,
    required: true
  },
  sha1: String,
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


/**
 * Create proper absolute path from a root and a new name
 * @param {string} root
 * @param {string} name
 * @return {string}
 */
schema.methods.absolutePath = function(root,name){
  if(root.indexOf('/') !== 0)
    root = '/' + root
  if(root !== '/')
    return root + '/' + name
  else
    return '/' + name
}


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


/**
 * Find items in a path (directly owned)
 * @param {string} path
 * @return {object} Mongoose query
 */
exports.model.findInPath = function(path){
  var exp = new RegExp('^' + (!path || path === '/' ? '' : path) + '/[^\/]+$','i')
  var query = exports.model.find({path: exp})
  query.sort('-folder name')
  return query
}


/**
 * Find descendends of a path
 * @param {string} path
 * @return {object} Mongoose query
 */
exports.model.findDescendents = function(path){
  var exp = new RegExp('^' + (!path || path === '/' ? '' : path) + '.*$','i')
  return exports.model.find({path: exp})
}

//make sure and remove descendants and delete files
schema.pre('remove',function(next){
  //remove direct descendants and let the waterfall happen
  exports.model
    .findDescendents(this.path)
    .exec(function(err,results){
      if(err) return next(err.message)
      if(!results) return next()
      async.eachLimit(
        results,
        require('os').cpus().length,
        function(item,next){
          exports.model.findByIdAndRemove(item.id,next)
        },
        next
      )
    })
})
