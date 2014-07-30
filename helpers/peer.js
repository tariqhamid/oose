'use strict';
var redis = require('./redis')
var net = require('net')
var Sniffer = require('./Sniffer')
var crypto = require('crypto')


/**
 * Select next peer
 * @param {function} next
 */
exports.next = function(next){
  var peerNext
  redis.hgetall('peer:next',function(err,results){
    if(err) return next(err)
    if(!results) return next('could not find next peer')
    for(var i in results){
      if(!results.hasOwnProperty(i)) continue
      peerNext = JSON.parse(results[i])
      break
    }
    next(null,peerNext)
  })
}


/**
 * Send a peer a file from a readable stream
 * @param {object} peer
 * @param {Stream} stream
 * @param {function} next
 */
exports.sendFromReadable = function(peer,stream,next){
  var shasum = crypto.createHash('sha1')
  var sniff = new Sniffer()
  sniff.on('data',function(data){
    shasum.update(data)
  })
  var client = net.connect(peer.portImport,peer.ip)
  client.on('error',function(err){
    next(err)
  })
  client.on('connect',function(){
    stream.pipe(sniff).pipe(client)
    stream.on('end',function(){
      var sha1 = shasum.digest('hex')
      next(null,sha1)
    })
    stream.on('error',function(err){
      next(err)
    })
  })
}
