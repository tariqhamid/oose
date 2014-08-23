'use strict';
var redis = require('./redis')
var net = require('net')
var Sniffer = require('./Sniffer')
var crypto = require('crypto')


/**
 * Select next peer
 * @param {string|array} skip List of hostnames to skip
 * @param {function} next
 */
exports.next = function(skip,next){
  //be backwards compatible without a skip option
  if('function' === typeof skip){
    next = skip
    skip = []
  }
  if(!(skip instanceof Array)) skip = [skip]
  var peer, winner
  redis.hgetall('peer:next',function(err,results){
    if(err) return next(err)
    if(!results) return next('could not find next peer')
    for(var i in results){
      if(!results.hasOwnProperty(i)) continue
      peer = JSON.parse(results[i])
      //skip any hostnames we dont want
      if(skip.indexOf(peer.hostname) >= 0) continue
      if(!winner || peer.availableCapacity > winner.availableCapacity)
        winner = peer
    }
    next(null,winner)
  })
}


/**
 * Select next peer by hits
 * @param {string|array} skip List of hostnames to skip
 * @param {function} next
 */
exports.nextByHits = function(skip,next){
  //be backwards compatible without a skip option
  if('function' === typeof skip){
    next = skip
    skip = []
  }
  if(!(skip instanceof Array)) skip = [skip]
  var peer, winner
  redis.hgetall('peer:next',function(err,results){
    if(err) return next(err)
    if(!results) return next('could not find next peer')
    for(var i in results){
      if(!results.hasOwnProperty(i)) continue
      peer = JSON.parse(results[i])
      //skip any hostnames we dont want
      if(skip.indexOf(peer.hostname) >= 0) continue
      if(!winner || +peer.hits < +winner.hits) winner = peer
    }
    next(null,winner)
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
  client.on('end',function(){
    next(null,shasum.digest('hex'))
  })
  client.on('connect',function(){
    stream.pipe(sniff).pipe(client)
    stream.on('error',function(err){
      next(err)
    })
  })
}
