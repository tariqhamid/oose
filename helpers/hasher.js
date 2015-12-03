'use strict';
var crypto = require('crypto')

var config = require('../config')


/**
 * Define hash expressions
 * @type {object}
 */
exports.hashExpressions = {
  sha512: /^[a-f0-9]{128}$/i,
  sha384: /^[a-f0-9]{96}$/i,
  sha256: /^[a-f0-9]{64}$/i,
  sha224: /^[a-f0-9]{56}$/i,
  sha1: /^[a-f0-9]{40}$/i,
  md5: /^[a-f0-9]{32}$/i
}


/**
 * Define hash lengths
 * @type {object}
 */
exports.hashLengths = {
  sha512: 128,
  sha384: 96,
  sha256: 64,
  sha224: 56,
  sha1: 40,
  md5: 32
}


/**
 * Identify hash type
 * @param {string} hash
 * @return {string}
 */
exports.identify = function(hash){
  if(!hash) return config.defaultHashType
  if(hash.match(/^[a-f0-9]{128}$/i)) return 'sha512'
  if(hash.match(/^[a-f0-9]{96}$/i)) return 'sha384'
  if(hash.match(/^[a-f0-9]{64}$/i)) return 'sha256'
  if(hash.match(/^[a-f0-9]{56}$/i)) return 'sha224'
  if(hash.match(/^[a-f0-9]{40}$/i)) return 'sha1'
  if(hash.match(/^[a-f0-9]{32}$/i)) return 'md5'
  return config.defaultHashType
}


/**
 * Create hash cipher
 * @param {string} type
 * @return {object}
 */
exports.create = function(type){
  return crypto.createHash(type || config.defaultHashType || 'sha1')
}
