'use strict';
var ObjectManage = require('object-manage')
var EventEmitter = require('events').EventEmitter
var async = require('async')
var temp = require('temp')
var mkdirp = require('mkdirp')
var fs = require('fs')
var path = require('path')
var config = require('../../config')
var tmpDir = path.resolve(config.get('shredder.root') + '/tmp')


/**
 * Save a resource to OOSE
 * @param {string} name
 * @param {object} info
 * @param {function} next
 */
var saveResource = function(name,info,next){
  //TODO: save this to OOSE somehow
  next()
}



/**
 * Resource manager
 * @param {object} options
 * @constructor
 */
var Resource = function(options){
  var that = this
  EventEmitter.call(that)
  //load options
  that.options = new ObjectManage()
  that.options.load(that.defaultOptions)
  that.options.load(options)
  //define our resource handler
  that.resources = {}
  process.on('exit',that.cleanup.call(that))
}
Resource.prototype = Object.create(EventEmitter.prototype)


/**
 * Define default options
 * @type {{}}
 */
Resource.prototype.defaultOptions = {}


/**
 * Create a temp file and assign it to a resource and return the info about it
 * @param {string} name
 * @param {function} done
 * @return {null}
 */
Resource.prototype.create = function(name,done){
  var that = this
  var tmp
  //if we already have a resource by that name return it
  if('undefined' !== typeof that.resources[name]){
    return done(null,that.resources[name])
  }
  async.series(
    [
      //check if the root folder exists, if not create it
      function(next){
        fs.exists(tmpDir,function(exists){
          if(exists) return next()
          mkdirp(tmpDir,function(err){
            if(err) return next(err)
            next()
          })
        })
      },
      //create the temp path in the folder
      function(next){
        temp.open(name || 'shredderResource',function(err,info){
          if(err) return next(err)
          tmp = info
          next()
        })
      }
    ],
    function(err){
      if(err) return done(err)
      //emit create event
      that.emit('create',name,tmp)
      //add resource
      that.add(name,tmp)
      //return tempfile
      done(null,tmp)
    }
  )
}


/**
 * Add a resource
 * @param {string} name
 * @param {object} info
 */
Resource.prototype.add = function(name,info){
  this.emit('add',name,info)
  this.resources[name] = info
}


/**
 * Check if a resource exists
 * @param {string} name
 * @return {boolean} exists
 */
Resource.prototype.exists = function(name){
  return ('object' === typeof this.resources[name])
}


/**
 * Get a resource
 * @param {string} name
 * @return {object} resource
 */
Resource.prototype.get = function(name){
  return this.resources[name]
}


/**
 * Remove a resource (and its underlying file)
 * @param {string} name
 */
Resource.prototype.remove = function(name){
  var resource = this.resources[name]
  this.emit('remove',name,resource)
  if(fs.existsSync(resource.path))
    fs.unlinkSync(resource.path)
  delete this.resources[name]
}


/**
 * Render a string and replace named resources with paths
 * @param {string} string
 * @param {function} done
 */
Resource.prototype.render = function(string,done){
  var that = this
  var originalString = string
  //match any named resources in the string
  var match = string.match(/{([0-9a-z]+)}/ig)
  match.shift()
  async.each(
    match,
    function(m,next){
      //if the resource already exists continue
      if(that.exists(m)) return next()
      //create any reosurces that dont exist yet
      that.create(m,function(err){
        if(err) return next(err)
        next()
      })
    },
    function(err){
      if(err) return done(err)
      //replace any resource references with their paths
      var regexp
      for(var i in that.resources){
        if(!that.resources.hasOwnProperty(i)) continue
        regexp = new RegExp('{' + i + '}','i')
        string = string.replace(regexp,that.resources[i].path)
      }
      this.emit('render',originalString,string)
      done(null,string)
    }
  )
}


/**
 * Cleanup resources and remove them from the file system
 */
Resource.prototype.cleanup = function(){
  for(var i in this.resources){
    if(!this.resources.hasOwnProperty(i)) continue
    var info = this.resources[i]
    if(!fs.existsSync(info.path)) continue
    fs.unlinkSync(info.path)
  }
}


/**
 * Save resources to OOSE
 * @param {Array} resources
 * @param {function} next
 */
Resource.prototype.save = function(resources,next){
  var that = this
  async.each(
    resources,
    function(name,next){
      var resource = that.resources[name]
      if('undefined' === typeof resource) return next()
      saveResource(name,resource,next)
    },
    next
  )
}


/**
 * Export the Resource manager
 * @type {Resource}
 */
module.exports = Resource
