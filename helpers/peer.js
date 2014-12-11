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
 * @return {P}
 */
exports.next = function(skip){
  if(!(skip instanceof Array)) skip = [skip]
  return redis.hgetallAsync('peer:next')
    .then(function(results){
      if(!results) throw new Error('No results for peer.next')
      var rk = Object.keys(results)
      var peer, winner
      for(var i = 0; i < rk.length; i++){
        peer = JSON.parse(results[rk[i]])
        //skip any hostnames we dont want
        if(skip.indexOf(peer.hostname) >= 0) continue
        if(!winner || peer.importHits < winner.importHits)
          winner = peer
      }
      return winner
    })
}


/**
 * Select next peer by hits
 * @param {string|array} skip List of hostnames to skip
 * @return {P}
 */
exports.nextByHits = function(skip){
  if(!(skip instanceof Array)) skip = [skip]
  var winner
  debug('getting next peer info')
  return redis.hgetallAsync('peer:next')
    .then(function(results){
      debug('got peer:next results',results)
      if(!results) throw new Error('could not find next peer')
      var rk = Object.keys(results)
      var peer
      for(var i = 0; i < rk.length; i++){
        peer = JSON.parse(results[rk[i]])
        if(!peer.hits || 'NaN' === peer.hits || 'none' === peer.hits)
          peer.hits = 0
        peer.hits = +peer.hits
        debug('got peer',peer.hostname,peer.hits)
        //skip any hostnames we dont want
        if(skip.indexOf(peer.hostname) >= 0) continue
        if(!winner || peer.hits < winner.hits) winner = peer
      }
      debug('selected ' + winner.hostname +
        ' as winner with ' + winner.hits + ' hits')
      //increment the hits of the winner
      debug('incrementing peer:db:' + winner.hostname)
      return redis.hincrbyAsync('peer:db:' + winner.hostname,'hits',1)
    })
    .then(function(){
      return winner
    })
}


/**
 * Send a peer a file from a readable stream
 * @param {object} peer
 * @param {Stream} stream
 * @return {P}
 */
exports.sendFromReadable = function(peer,stream){
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
  return promisePipe(stream,sniff,client)
    .then(function(){
      return shasum.digest('hex')
    })
}
