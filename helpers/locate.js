'use strict';
var async = require('async')
var debug = require('debug')('oose:helper:locate')

var shortId = require('../helpers/shortid')
var redis = require('../helpers/redis')

var config = require('../config')



/**
 * Locate
 * @param {Multicast} multicast instance
 * @constructor
 */
var Locate = function(multicast){
  this.multicast = multicast
  this.token = shortId.generate()
  this.errors = []
  this.basket = {}
  this.timeout = null
}


/**
 * Lookup a sha1
 * @param {string} sha1
 * @param {function} done
 */
Locate.prototype.lookup = function(sha1,done){
  var that = this
  var peers
  async.series(
    [
      //validate input
      function(next){
        if(40 !== sha1.length || 'string' !== typeof sha1)
          return next('invalid sha1')
        that.sha1 = sha1
        next()
      },
      //lookup peers
      function(next){
        redis.smembers('peer:list',function(err,result){
          if(err) return next(err)
          peers = result
          next()
        })
      },
      //send to peers
      function(next){
        var done = function(){
          debug(that.sha1,'Locate response window closed')
          that.multicast.removeAllListeners(that.token)
          next()
        }
        var timeout = function(){
          //otherwise continue to wait
          that.timeout = setTimeout(
            function(){
              debug(that.sha1,'calling locate timeout')
              done()
            },
            config.locate.timeout
          )
        }
        that.multicast.on(that.token,function(req,rinfo){
          debug('got locate response',req,rinfo)
          var hostname = ''
          debug(that.sha1,'[LOCATE@' + that.token + '] ' +
            rinfo.address + ' says ' +
            (req.exists ? 'YES' : 'NO'))
          async.series(
            [
              //resolve ip to peer hostname
              function(next){
                redis.hget('peer:ip',rinfo.address,function(err,result){
                  if(err) return next(err)
                  hostname = result
                  that.basket[hostname] = !!req.exists
                  if(peers.indexOf(hostname) > -1)
                    peers.splice(peers.indexOf(hostname),1)
                  next()
                })
              }
            ],
            //each recv packet resets the return timer to 1/4 sec
            function(err){
              if(err){
                debug(that.sha1,'Failed to respond to locate: ' + err)
                that.errors.push(err)
              }
              clearTimeout(that.timeout)
              //if we have all the peers return now
              if(0 === peers.length) return next()
              //otherwise rearm the timeout
              timeout()
            }
          )
        })
        that.multicast.send(
          'locate',
          {token: that.token, sha1: that.sha1},
          function(err){
            if(err) next(err)
            //setup the initial timeout now that we sent
            debug('setting up initial timeout for fail window')
            timeout()
          }
        )
      }
    ],
    function(err){
      if(err) debug(that.sha1,'Locate error',err)
      debug(that.sha1,'Locate result',that.basket)
      done(err,that.basket)
    }
  )
}


/**
 * Locate helper
 * @type {Locate}
 */
module.exports = Locate
