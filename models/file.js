'use strict';
var async = require('async')
var mongoose = require('mongoose')

var shortid = require('../helpers/shortid')

mongoose.plugin(require('mongoose-list'))

var encode = function(path){
  if(!path instanceof Array) path = [path]
  path = path.filter(function(el){
    return el ? true : false
  })
  return ',' + path.join(',') + ','
}

var decode = function(path){
  if(path instanceof Array) return path.slice(0)
  if(!path) path = ''
  return path.split(',').filter(function(el){
    return el ? true : false
  })
}

var schema = new mongoose.Schema({
  handle: {
    type: String,
    unique: true,
    required: true
  },
  folder: {
    type: Boolean,
    require: true,
    default: false
  },
  name: {
    type: String,
    required: true
  },
  size: Number,
  sha1: String,
  tmp: String,
  path: {
    type: String,
    unique: true,
    required: true,
    get: decode,
    set: encode
  },
  mimeType: {
    type: String,
    index: true,
    default: 'application/octet-stream'
  },
  embedHandle: String,
  shredder: {
    handle: String,
    status: String,
    message: String,
    steps: {
      complete: Number,
      total: Number
    },
    frames: {
      complete: Number,
      total: Number
    },
    resources: Object
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

//make sure and remove descendants and delete files
schema.pre('remove',function(next){
  var Model = require('./file').model
  var path = this.path
  //make sure there is a handle if not make one
  if(!this.handle) this.handle = shortid.generate()
  //remove direct descendants and let the waterfall happen
  if(!path instanceof Array) path = path.split('/')
  var exp = new RegExp('^,' + path.join(','))
  var query = Model.find({path: exp})
  query.sort('-folder name')
  query.exec(function(err,results){
    if(err) return next(err.message)
    if(!results) return next()
    async.eachLimit(
      results,
      require('os').cpus().length,
      function(item,next){
        Model.findByIdAndRemove(item.id,next)
      },
      next
    )
  })
})


// handling of created/modified
schema.pre('save',function(next){
  var now = new Date()
  var _ref = this.get('metrics.dateCreated')
  if((void 0) === _ref || null === _ref)
    this.metrics.dateCreated = now
  this.metrics.dateModified = now
  next()
})


/**
 * Relative path (prefix removed)
 * @param {boolean} god
 * @this {File}
 * @return {Array}
 */
schema.methods.relative = function(god){
  var path = this.path.slice(0)
  if(!god) path.shift()
  return path
}


/**
 * Relative parent path
 * @param {boolean} god
 * @this {File}
 * @return {array}
 */
schema.methods.relativeParent = function(god){
  var path = this.parent()
  if(!god) path.shift()
  return path
}


/**
 * Parent path
 * @this {File}
 * @return {array}
 */
schema.methods.parent = function(){
  var path = this.path.slice(0)
  path.pop()
  return path
}


/**
 * Encode path
 * @type {encode}
 */
schema.methods.encode = encode


/**
 * Decode path
 * @type {decode}
 */
schema.methods.decode = decode


/**
 * Check if a path exists
 * @param {string|array} path
 * @param {function} next
 * @this {File}
 */
schema.statics.exists = function(path,next){
  path = decode(path)
  this.findOne({path: encode(path)},function(err,result){
    if(err) return next(err.message)
    next(null,result ? true : false)
  })
}


/**
 * Find items in a path (directly owned)
 * @param {string} path
 * @return {object} Mongoose query
 * @this {File}
 */
schema.statics.findChildren = function(path){
  path = decode(path)
  var exp
  if(path.length)
    exp = new RegExp('^,' + path.join(',') + ',[^,]+,$')
  else
    exp = new RegExp('^,[^,]+,$')
  var query = this.find({path: exp})
  query.sort('-folder name')
  return query
}


/**
 * Find descendants of a path
 * @param {string} path
 * @return {object} Mongoose query
 * @this {File}
 */
schema.statics.findDescendents = function(path){
  if(!path instanceof Array) path = path.split('/')
  var exp = new RegExp('^,' + path.join(','))
  var query = this.find({path: exp})
  query.sort('-folder name')
  return query
}


/**
 * Encode path
 * @param {array} path
 * @return {string}
 */
schema.statics.encode = encode


/**
 * Decode path
 * @param {string} path
 * @return {Array}
 */
schema.statics.decode = decode


/**
 * Create folders recursively
 * @param {string} path
 * @param {function}next
 * @this {File}
 */
schema.statics.mkdirp = function(path,next){
  var Model = this
  path = decode(path)
  path.pop()
  var currentPosition = []
  async.eachSeries(
    path,
    function(item,next){
      currentPosition.push(item)
      Model.exists(currentPosition,function(err,exists){
        if(err) return next(err)
        if(exists) return next()
        var doc = new Model()
        doc.folder = true
        doc.name = item
        doc.path = currentPosition
        doc.mimeType = 'folder'
        doc.status = 'ok'
        doc.save(function(err){
          if(err) return next(err.message)
          next()
        })
      })
    },
    next
  )
}


/**
 * Mongoose schema
 * @type {exports.Schema}
 */
exports.schema = schema


/**
 * Mongoose model
 */
exports.model = mongoose.model('File',schema)
