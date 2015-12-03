'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')
var oose = require('oose-sdk')
var path = require('path')

var UserError = oose.UserError

var config = require('../config')
var hasher = require('./hasher')

var basePath = path.resolve(config.root + '/content')


/**
 * Get a relative path from a hash
 * @param {string} hash
 * @param {string} ext
 * @return {string}
 */
exports.toRelativePath = function(hash,ext){
  var file = ''
  var type = hasher.identify(hash)
  var parts = hash.split('')
  for(var i = 1; i <= parts.length; i++){
    file = file + parts[i - 1]
    if(i % 2 === 0 && i !== hasher.hashLengths[type]){
      file = file + '/'
    }
  }
  if(ext)
    file = file + '.' + ext
  return file
}


/**
 * Convert a hash to an absolute path
 * @param {string} hash
 * @param {string} ext  File extension
 * @return {string}
 */
exports.toPath = function(hash,ext){
  return path.resolve(basePath,exports.toRelativePath(hash,ext))
}


/**
 * Make a symlink to the real path with the extension for quicker lookup
 * @param {string} hash
 * @param {string} ext
 * @return {P}
 */
exports.linkPath = function(hash,ext){
  var target = exports.toPath(hash,ext)
  var link = exports.toPath(hash)
  return fs.symlinkAsync(target,link,'file')
    .catch(function(){})
}


/**
 * Convert a path back to a hash
 * @param {string} file
 * @return {string}
 */
exports.fromPath = function(file){
  //remove root
  file = file.replace(basePath,'')
  //strip extension
  file = file.replace(/\.\w+$/,'')
  //filter out to hash
  return file.replace(/[^a-f0-9]+/gi,'')
}


/**
 * Validate hash
 * @param {string} hash
 * @return {boolean}
 */
exports.validate = function(hash){
  if(!hash) return false
  var type = hasher.identify(hash)
  return !!hash.match(hasher.hashExpressions[type])
}


/**
 * Since the node fs.existsAsync wont work this has to be done here
 * @param {string} file
 * @return {P}
 */
exports.fsExists = function(file){
  return new P(function(resolve){
    fs.exists(file,function(result){
      resolve(result)
    })
  })
}


/**
 * Find a file based on hash
 * @param {string} hash
 * @return {P}
 */
exports.find = function(hash){
  var file = exports.toPath(hash)
  return fs.readlinkAsync(file)
    .then(function(result){
      return result
    },function(){
      return false
    })
}


/**
 * Extract hash and extension from filename
 * @param {string} file
 * @return {object}
 */
exports.hashFromFilename = function(file){
  var match = file.match(/^([a-f0-9]+)\.(\w+)$/i)
  if(3 !== match.length) throw new UserError('Failed to parse file name')
  var hash = match[1]
  var type = hasher.identify(hash)
  var ext = match[2]
  return {
    hash: hash,
    type: type,
    ext: ext
  }
}


/**
 * Get details from a filename with extension
 * @param {file} file
 * @return {P}
 */
exports.details = function(file){
  var details
  return P.try(function(){
    details = exports.hashFromFilename(file)
    if(!exports.validate(details.hash))
      throw new UserError('Invalid hash passed')
    details.path = exports.toPath(details.hash,details.ext)
    return fs.statAsync(details.path)
      .then(function(stat){
        return stat
      })
      .catch(function(){
        return false
      })
  })
    .then(
      function(result){
        if(!result){
          details.stat = {}
          details.exists = false
        }
        else{
          details.stat = result
          details.exists = true
        }
        return details
      }
    )
}


/**
 * Remove a file and its accompanying link
 * @param {string} hash
 * @return {P}
 */
exports.remove = function(hash){
  var link = exports.toPath(hash)
  return exports.fsExists(link)
    .then(function(result){
      if(!result) return true
      return fs.readlinkAsync(link)
    })
    .then(function(file){
      return P.all([
        fs.unlinkAsync(link),
        fs.unlinkAsync(file)
      ])
    })
    .then(function(){
      return true
    })
}
