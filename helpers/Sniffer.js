'use strict';

// set up a stream sniffer for output sha1 hashing
var PassThrough = require('stream').PassThrough
var Sniffer = function(){
  PassThrough.call(this)
  this.timeout = null
}
Sniffer.prototype = Object.create(PassThrough.prototype)


/**
 * Sniffer object
 * @type {Sniffer}
 */
module.exports = Sniffer
