'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')
var glob = require('glob')
var path = require('path')

var UserError = require('../helpers/UserError')

var config = require('../config')

var basePath = path.resolve(config.root + '/content')
var SHA1Exp = /[a-f0-9]{40}/i

//make some promises
glob = P.promisify(glob)


/**
 * Convert a sha1 to an absolute path
 * @param {string} sha1
 * @param {string} ext  File extension
 * @return {string}
 */
exports.toPath = function(sha1,ext){
  var file = basePath + '/'
  var parts = sha1.split('')
  for(var i = 1; i <= parts.length; i++){
    file = file + parts[i - 1]
    if(i % 2 === 0 && i !== 40){
      file = file + '/'
    }
  }
  if(ext)
    file = path.resolve(file + '.' + ext)
  else
    file = path.resolve(file)
  return file
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
  return !!sha1.match(SHA1Exp)
}


/**
 * Find a file based on sha1
 * @param {string} sha1
 * @return {P}
 */
exports.find = function(sha1){
  if(!exports.validate(sha1)) return false
  return glob(exports.toPath(sha1) + '.*')
    .then(function(files){
      if(!files || !files.length) return false
      if(files.length > 1){
        for(var i = 0; i < files.length; i++){
          files[i] = path.resolve(files[i])
        }
        return files
      }
      if(1 === files.length) return path.resolve(files[0])
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
