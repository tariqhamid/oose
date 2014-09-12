'use strict';
var async = require('async')
var axon = require('axon')
var debug = require('debug')('oose:locate')

var child = require('../helpers/child').child
var logger = require('../helpers/logger').create('locate')
var Locate = require('../helpers/locate')
var Multicast = require('../helpers/multicast')
var redis = require('../helpers/redis')

var config = require('../config')
var multicast
var server = axon.socket('rep')

var multicastListen = function(multicast){
  multicast.on('locate',function(message,rinfo){
    var reply = function(err,exists){
      if(err){
        logger.error('locate response failed',err)
        exists = false
      }
      multicast.send(message.token,{exists: exists})
    }
    //check if we have the file
    if(!message.sha1) return reply('no sha1 provided')
    if(40 !== message.sha1.length || 'string' !== typeof message.sha1)
      return reply('invalid sha1 provided')
    var sha1 = message.sha1
    debug(sha1,'[MCAST LOCATE] who has ' + sha1 + ' tell ' + rinfo.address +
      ' @ ' + message.token)
    redis.sismember('inventory',message.sha1,function(err,result){
      if(err){
        debug(sha1,'redis lookup error',err)
        return reply(err)
      }
      result = !!result
      debug(sha1,(result ? 'exists' : 'doesnt exist'))
      reply(err,result)
    })
  })
}

var tcpListen = function(server,multicast){
  server.on('message',function(message,reply){
    debug('got message via TCP',message)
    if('object' === typeof message && message.sha1){
      debug('starting new locate for',message.sha1)
      var l = new Locate(multicast)
      l.lookup(message.sha1,function(err,result){
        debug('got locate result',err,result)
        reply(err,result)
      })
    }
  })
}

if(require.main === module){
  child(
    'oose:locate',
    function(done){
      done = done || function(){}
      async.series(
        [
          //setup our multicast handler
          function(next){
            if(multicast) return next()
            debug('registering multicast')
            multicast = new Multicast()
            multicast.bind(
              config.locate.port,
              config.locate.host,
              config.locate.multicast,
              function(err){
                next(err)
              }
            )
          },
          //setup our tcp handler
          function(next){
            debug('listening for tcp on ' +
              [config.locate.host,config.locate.port].join(':'))
            server.bind(config.locate.port,config.locate.host,next)
          }
        ],
        function(err){
          if(err) return done(err)
          //add our multicast listener
          multicastListen(multicast)
          //add out tcp listener
          tcpListen(server,multicast)
          done()
        }
      )
    },
    function(done){
      done = done || function(){}
      done()
    }
  )
}
