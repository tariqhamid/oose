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
 * Key used to flush db on prism start
 * @return {string}
 */
RedisSchema.prototype.flushKeys = function(){
  return this.applyPrefix('*')
}


/**
 * Prism list Key
 * @return {string}
 */
RedisSchema.prototype.prismList = function(){
  return this.applyPrefix('prismList')
}


/**
 * Store list Key
 * @return {string}
 */
RedisSchema.prototype.storeList = function(){
  return this.applyPrefix('storeList')
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
 * Check if the master is up
 * @return {string}
 */
RedisSchema.prototype.masterUp = function(){
  return this.applyPrefix('masterUp')
}


/**
 * Look up a user session by token
 * @param {string} token
 * @return {string}
 */
RedisSchema.prototype.userSession = function(token){
  return this.applyPrefix('userSession:' + token)
}


/**
 * Look up a purchase
 * @param {string} token
 * @return {string}
 */
RedisSchema.prototype.purchase = function(token){
  return this.applyPrefix('purchase:' + token)
}


/**
 * Purchase Cache by User Session
 * @param {string} sha1
 * @param {string} sessionToken
 * @return {string}
 */
RedisSchema.prototype.purchaseCache = function(sha1,sessionToken){
  return this.applyPrefix('purchase:cache:' + sha1 + ':' + sessionToken)
}


/**
 * Export Object
 * @type {RedisSchema}
 */
module.exports = RedisSchema
