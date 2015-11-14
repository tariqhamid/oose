'use strict';



/**
 * Couch  Key Schema
 * @param {string} prefix
 * @constructor
 */
var CouchShema = function(prefix){
  if(!prefix) prefix = 'oose'
  this.prefix = prefix
}


/**
 * Apply Key Prefix
 * @param {string} key
 * @return {string}
 */
CouchShema.prototype.applyPrefix = function(key){
  return this.prefix + ':' + (key || '')
}


/**
 * Prism Key
 * @param {string} name
 * @return {string}
 */
CouchShema.prototype.prism = function(name){
  return this.applyPrefix('prism:' + (name || ''))
}


/**
 * Store Key
 * @param {string} name
 * @return {string}
 */
CouchShema.prototype.store = function(name){
  return this.applyPrefix('store:' + (name || ''))
}


/**
 * DownVote Key
 * @param {string} name
 * @return {string}
 */
CouchShema.prototype.downVote = function(name){
  return this.applyPrefix('downvote:' + (name || ''))
}


/**
 * Look up a purchase
 * @param {string} token
 * @return {string}
 */
CouchShema.prototype.purchase = function(token){
  return this.applyPrefix('purchase:' + (token || ''))
}


/**
 * Inventory
 * @param {string} sha1
 * @param {string} store
 * @return {string}
 */
CouchShema.prototype.inventory = function(sha1,store){
  return this.applyPrefix(
    'inventory:' + (sha1 || '') + (store ? ':' + store : '')
  )
}


/**
 * Export Object
 * @type {CouchShema}
 */
module.exports = CouchShema
