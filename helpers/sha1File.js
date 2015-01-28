'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')
var oose = require('oose-sdk')
var path = require('path')

var UserError = oose.UserError

var config = require('../config')

var basePath = path.resolve(config.root + '/content')
var SHA1Exp = /[a-f0-9]{40}/i


/**
 * Get a relative path from a sha1
 * @param {string} sha1
 * @param {string} ext
 * @return {string}
 */
exports.toRelativePath = function(sha1,ext){
  var file = ''
  var parts = sha1.split('')
  for(var i = 1; i <= parts.length; i++){
    file = file + parts[i - 1]
    if(i % 2 === 0 && i !== 40){
      file = file + '/'
    }
  }
  if(ext)
    file = file + '.' + ext
  return file
}


/**
 * Convert a sha1 to an absolute path
 * @param {string} sha1
 * @param {string} ext  File extension
 * @return {string}
 */
exports.toPath = function(sha1,ext){
  return path.resolve(basePath,exports.toRelativePath(sha1,ext))
}


/**
 * Make a symlink to the real path with the extension for quicker lookup
 * @param {string} sha1
 * @param {string} ext
 * @return {P}
 */
exports.linkPath = function(sha1,ext){
  var target = exports.toPath(sha1,ext)
  var link = exports.toPath(sha1)
  return fs.symlinkAsync(target,link,'file')
    .catch(function(){})
}


/**
 * Convert a path back to a sha1
 * @param {string} file
 * @return {string}
 */
exports.fromPath = function(file){
  //remove root
  file = file.replace(basePath,'')
  //strip extension
  file = file.replace(/\.\w+$/,'')
  //filter out to sha1
  return file.replace(/[^a-f0-9]+/gi,'')
}


/**
 * Validate sha1
 * @param {string} sha1
 * @return {boolean}
 */
exports.validate = function(sha1){
  if(!sha1) return false
  return !!sha1.match(SHA1Exp)
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
 * Find a file based on sha1
 * @param {string} sha1
 * @return {P}
 */
exports.find = function(sha1){
  var file = exports.toPath(sha1)
  return fs.readlinkAsync(file)
    .then(function(result){
      return result
    },function(){
      return false
    })
}


/**
 * Get details from a filename with extension
 * @param {file} file
 * @return {P}
 */
exports.details = function(file){
  var details
  return P.try(function(){
    var match = file.match(/^([a-f0-9]{40})\.(\w+)$/i)
    if(3 !== match.length) throw new UserError('Failed to parse file name')
    details = {
      sha1: match[1],
      ext: match[2]
    }
    if(!exports.validate(details.sha1))
      throw new UserError('Invalid sha1 passed')
    details.path = exports.toPath(details.sha1,details.ext)
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
 * @param {string} sha1
 * @return {P}
 */
exports.remove = function(sha1){
  var link = exports.toPath(sha1)
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
