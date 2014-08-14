'use strict';
var ObjectManage = require('object-manage')
var EventEmitter = require('events').EventEmitter
var async = require('async')
var temp = require('temp')
var mkdirp = require('mkdirp')
var fs = require('fs')
var path = require('path')
var config = require('../../config')
var peer = require('../../helpers/peer')
var tmpDir = path.resolve(config.get('shredder.root') + '/tmp')
var resourceExp = /\{([^}]+)\}/ig


/**
 * Save a resource to OOSE
 * @param {string} name
 * @param {object} info
 * @param {function} next
 */
var saveResource = function(name,info,next){
  var peerNext, sha1
  async.series(
    [
      //select next peer
      function(next){
        peer.next(function(err,result){
          peerNext = result
          next()
        })
      },
      //setup connection to input
      function(next){
        peer.sendFromReadable(peerNext,fs.createReadStream(info.get('path')),function(err,result){
          sha1 = result
          next()
        })
      }
    ],
    function(err){
      if(err) return next(err)
      next(null,sha1)
    }
  )
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
  process.on('exit',that.cleanup.bind(that))
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
  var details = new ObjectManage(info)
  this.emit('add',name,details)
  this.resources[name] = details
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
  if(this.resources[name]) return this.resources[name].data
  return null
}


/**
 * Load settings into a resource
 * @param {string} name
 * @param {object} info
 */
Resource.prototype.load = function(name,info){
  this.resources[name].load(info)
}


/**
 * Remove a resource (and its underlying file)
 * @param {string} name
 */
Resource.prototype.remove = function(name){
  var resource = this.resources[name]
  this.emit('remove',name,resource)
  if(fs.existsSync(resource.get('path')))
    fs.unlinkSync(resource.get('path'))
  delete this.resources[name]
}


/**
 * Render a string and replace named resources with paths
 * @param {string} string
 * @param {function} done
 * @return {*}
 */
Resource.prototype.render = function(string,done){
  var that = this
  var originalString = string
  //match any named resources in the string
  var match, matches = []
  while((match = resourceExp.exec(string))){
    if(!match[1]) continue
    matches.push(match[1])
  }
  if(!(matches instanceof Array) || !matches.length) return done(null,string)
  async.each(
    matches,
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
      for(var i in that.resources){
        if(!that.resources.hasOwnProperty(i)) continue
        string = string.replace(new RegExp('{' + i + '}','i'),that.resources[i].get('path'))
      }
      that.emit('render',originalString,string)
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
    if(!fs.existsSync(info.get('path'))) continue
    fs.unlinkSync(info.get('path'))
  }
}


/**
 * Save resources to OOSE
 * @param {Array} resources
 * @param {function} next
 */
Resource.prototype.save = function(resources,next){
  var that = this
  var map = {}
  async.each(
    resources,
    function(name,next){
      var resource = that.resources[name]
      if('undefined' === typeof resource) return next()
      saveResource(name,resource,function(err,result){
        if(err) return next(err)
        if(!result) return next('No sha1 returned with result')
        //save the resource map
        map[name] = result
        next()
      })
    },
    function(err){
      if(err) return next(err)
      next(null,map)
    }
  )
}


/**
 * Export the Resource manager
 * @type {Resource}
 */
module.exports = Resource
