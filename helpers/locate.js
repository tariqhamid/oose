'use strict';
var async = require('async')
var debug = require('oose:locate')

var shortId = require('../helpers/shortid')
var redis = require('../helpers/redis')



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
        redis.smembers('peer:rank',function(err,result){
          if(err) return next(err)
          peers = result
          next()
        })
      },
      //send to peers
      function(next){
        that.multicast.on(that.token,function(req,rinfo){
          var hostname = ''
          var done = function(){
            debug(that.sha1,'Locate response window closed')
            that.multicast.removeAllListeners(that.token)
            next()
          }
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
                  that.basket[hostname] = req.exists
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
                return
              }
              clearTimeout(that.timeout)
              //if we have all the peers return now
              if(0 === peers.length) return next()
              //otherwise continue to wait
              that.timeout = setTimeout(done,250)
            }
          )
        })
        that.multicast.send(
          'locate',
          {token: that.token, sha1: that.sha1},
          function(err){
            if(err) next(err)
          }
        )
      }
    ],
    function(err){
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
