'use strict';
var crypto = require('crypto')
var Transform = require('stream').PassThrough
var util = require('util')



/**
 * Constructor
 * @constructor
 * @param {object} options
 */
var SHA1Stream = function(options){
  var that = this
  Transform.call(that,options)
  that.shasum = crypto.createHash('sha1')
  that.sha1 = null
  that.on('finish',function(){
    that.sha1 = that.shasum.digest('hex')
    that.emit('sha1',that.sha1)
  })
}
util.inherits(SHA1Stream,Transform)


/**
 * Transform data
 * @param {Buffer} chunk
 * @param {string} encoding
 * @param {function} done
 */
SHA1Stream.prototype._transform = function(chunk,encoding,done){
  try {
    this.shasum.update(chunk)
    this.push(chunk)
    done()
  } catch(e){
    done(e)
  }
}


/**
 * Export helper
 * @type {SHA1Stream}
 */
module.exports = SHA1Stream
