'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')
var mkdirp = require('mkdirp-then')
var Password = require('node-password').Password
var path = require('path')

var config = require('../config')
var basePath = path.resolve(config.root + '/purchased')

//make some promises
P.promisifyAll(fs)


/**
 * Split value
 * @param {string} value
 * @param {number} index
 * @return {string}
 */
var splitValue = function(value,index){
  return [value.substring(0, index),value.substring(index)]
}


/**
 * Generate token
 * @return {string}
 */
exports.generateToken = function(){
  return new Password({length: 64, special: false}).toString()
}


/**
 * Split our token to create multiple folders to ease file system access
 * time on heavily loaded machines
 * @param {string} token
 * @return {string}
 */
exports.tokenToRelativePath = function(token){
  var parts = splitValue(token,4)
  return parts.join('/')
}


/**
 * Turn a token into a path
 * @param {string} token
 * @param {string} ext
 * @return {string}
 */
exports.toPath = function(token,ext){
  var tokenPath = exports.tokenToRelativePath(token)
  if(ext)
    return path.resolve(basePath + '/' + tokenPath + '.' + ext)
  else
    return path.resolve(basePath + '/' + tokenPath)
}


/**
 * Turn a path into a token
 * @param {string} filePath
 * @return {string}
 */
exports.fromPath = function(filePath){
  filePath = filePath.replace(basePath,'')
  filePath = filePath.replace(/\.\w+$/gi,'')
  filePath = filePath.replace(/\W+/gi,'')
  return filePath
}


/**
 * Check if a token path already exists
 * @param {string} token
 * @param {string} ext
 * @return {P}
 */
exports.exists = function(token,ext){
  return new P(function(resolve){
    fs.exists(exports.toPath(token,ext),function(exists){
      resolve(exists)
    })
  })
}


/**
 * Create a purchase path
 * @param {string} token
 * @param {string} target
 * @param {string} ext
 * @return {P}
 */
exports.create = function(token,target,ext){
  var tokenPath = exports.toPath(token,ext)
  return mkdirp(path.dirname(tokenPath))
    .then(function(){
      return fs.symlinkAsync(target,tokenPath)
    })
    .then(function(){
      return {token: token, path: tokenPath, ext: ext}
    })
}


/**
 * Remove a purchased path
 * @param {string} token
 * @param {string} ext
 * @return {P}
 */
exports.remove = function(token,ext){
  var tokenPath = exports.toPath(token,ext)
  if(!fs.existsSync(tokenPath)) return false
  return fs.unlinkAsync(tokenPath)
}
