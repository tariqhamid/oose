'use strict';
var async = require('async')
var fs = require('graceful-fs')
var EventEmitter = require('events').EventEmitter
var mkdirp = require('mkdirp')
var ObjectManage = require('object-manage')
var path = require('path')
var temp = require('temp')

var peer = require('../../helpers/peer')

var cleanup = []
var config = require('../../config')
var resourceExp = /\{([^}]+)\}/ig
var sha1Exp = /^[0-9a-f]{40}$/i
var tmpDir = path.resolve(config.root + '/shredder/tmp')

//remove any leftover resources on exit (important to stay sync here)
process.on('exit',function(){
  var resource
  for(var i = 0; i < cleanup.length; i++){
    resource = cleanup[i]
    if(fs.existsSync(resource.$get('path')))
      fs.unlinkSync(resource.$get('path'))
  }
})


/**
 * Save a resource to OOSE
 * @param {string} path
 * @return {P}
 */
var saveResource = function(path){
  return peer.next()
    .then(function(peerNext){
      if(!peerNext) throw new Error('Could not select peer')
      return peer.sendFromReadable(peerNext,fs.createReadStream(path))
    })
    .then(function(sha1){
      if(!sha1Exp.test(sha1))
        throw new Error('Invalid sha1 returned on saveResource')
      return sha1
    })
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
  that.options.$load(that.defaultOptions)
  that.options.$load(options)
  //define our resource handler
  that.resources = {}
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
        temp.open(
          {
            aprefix: name || 'shredderResource',
            dir: tmpDir
          },
          function(err,info){
            if(err) return next(err)
            tmp = info
            next()
          }
        )
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
  //add to cleanup array
  cleanup.push(details)
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
 * @return {boolean}
 */
Resource.prototype.load = function(name,info){
  if(this.resources[name] && this.resources[name] instanceof ObjectManage){
    this.resources[name].$load(info)
    return true
  }
  return false
}


/**
 * Remove a resource (and its underlying file)
 * @param {string} name
 */
Resource.prototype.remove = function(name){
  var resource = this.resources[name]
  this.emit('remove',name,resource)
  if(fs.existsSync(resource.$get('path')))
    fs.unlinkSync(resource.$get('path'))
  //remove from cleanup
  delete cleanup[cleanup.indexOf(resource)]
  //remove locally
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
        string = string.replace(
          new RegExp('{' + i + '}','i'),
          that.resources[i].$get('path')
        )
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
  var that = this
  for(var i in this.resources){
    if(!this.resources.hasOwnProperty(i)) continue
    that.remove(i)
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
      if(!resource) return next()
      saveResource(resource.path)
        .then(function(result){
          if(!sha1Exp.test(result)) throw new Error('Invalid sha1 returned')
          //save the resource map
          map[name] = result
          next()
        })
        .catch(next)
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
