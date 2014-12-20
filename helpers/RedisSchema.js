'use strict';



/**
 * Redis Key Schema
 * @param {string} prefix
 * @constructor
 */
var RedisSchema = function(prefix){
  if(!prefix) prefix = 'oose'
  this.prefix = prefix
}


/**
 * Apply Key Prefix
 * @param {string} key
 * @return {string}
 */
RedisSchema.prototype.applyPrefix = function(key){
  return this.prefix + ':' + key
}


/**
 * Prism list Key
 * @return {string}
 */
RedisSchema.prototype.prismList = function(){
  return this.applyPrefix('prismList')
}


/**
 * Prism hits (for load balancing)
 * @param {string} token
 * @param {string} prism
 * @return {string}
 */
RedisSchema.prototype.prismHits = function(token,prism){
  return this.applyPrefix('prismHits:' + token + ':' + prism)
}


/**
 * Store hits (for load balancing)
 * @param {string} token
 * @param {string} store
 * @return {string}
 */
RedisSchema.prototype.storeHits = function(token,store){
  return this.applyPrefix('storeHits:' + token + ':' + store)
}


/**
 * Store entry
 * @param {string} store
 * @return {string}
 */
RedisSchema.prototype.storeEntry = function(store){
  return this.applyPrefix('storeEntry:' + store)
}


/**
 * Content existence cache
 * @param {string} sha1
 * @return {string}
 */
RedisSchema.prototype.contentExists = function(sha1){
  return this.applyPrefix('contentExists:' + sha1)
}


/**
 * Export Object
 * @type {RedisSchema}
 */
module.exports = RedisSchema
