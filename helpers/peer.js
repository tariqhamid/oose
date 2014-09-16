'use strict';
var crypto = require('crypto')
var debug = require('debug')('oose:helper:peer')
var net = require('net')
var promisePipe = require('promisepipe')
var through2 = require('through2')

var redis = require('../helpers/redis')


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
  debug('getting next peer info')
  redis.hgetall('peer:next',function(err,results){
    debug('got peer:next results',results)
    if(err) return next(err)
    if(!results) return next('could not find next peer')
    for(var i in results){
      if(!results.hasOwnProperty(i)) continue
      peer = JSON.parse(results[i])
      if(!peer.hits || 'NaN' === peer.hits || 'none' === peer.hits)
        peer.hits = 0
      peer.hits = +peer.hits
      debug('got peer',peer.hostname,peer.hits)
      //skip any hostnames we dont want
      if(skip.indexOf(peer.hostname) >= 0) continue
      if(!winner || peer.hits < winner.hits) winner = peer
    }
    debug(
      'selected ' + winner.hostname + ' as winner with ' + winner.hits + ' hits'
    )
    //increment the hits of the winner
    debug('incrementing peer:db:' + winner.hostname)
    redis.hincrby('peer:db:' + winner.hostname,'hits',1,function(err){
      next(err,winner)
    })
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
  var sniff = through2(
    function(chunk,enc,next){
      try {
        shasum.update(chunk)
        next(null,chunk)
      } catch(err){
        next(err)
      }
    }
  )
  var client = net.connect(+peer.portImport,peer.ip)
  promisePipe(stream,sniff,client).then(
    function(){
      next(null,shasum.digest('hex'))
    },
    function(err){
      next('Failed in stream ' + err.source + ' ' + err.message)
    }
  )
}
