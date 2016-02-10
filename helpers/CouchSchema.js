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
 * @param {string} prism (optional)
 * @param {string} name
 * @return {string}
 */
CouchShema.prototype.store = function(prism,name){
  return this.applyPrefix('store:' + (prism || '') + (name ? ':' + name : ''))
}


/**
 * DownVote Key
 * @param {string} castee
 * @param {string} caster
 * @return {string}
 */
CouchShema.prototype.downVote = function(castee, caster){
  var ending = caster ? ':' + caster : ''
  return this.applyPrefix('downvote:' + (castee || '') + ending)
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
 * @param {string} hash
 * @param {string} prism
 * @param {string} store
 * @return {string}
 */
CouchShema.prototype.inventory = function(hash,prism,store){
  return this.applyPrefix(
    'inventory:' + (hash || '') +
    (prism ? ':' + prism : '') +
    (store ? ':' + store : '')
  )
}


/**
 * Export Object
 * @type {CouchShema}
 */
module.exports = CouchShema
