'use strict';
var debug = require('debug')('oose:ping')
var util = require('util')

var child = require('../helpers/child').child
var logger = require('../helpers/logger').create('ping')
var Multicast = require('../helpers/multicast')
var shortId = require('../helpers/shortid')
var redis = require('../helpers/redis')

var config = require('../config')
var multicast
var pingHosts = {}
var pingInterval
var pingSaveInterval
var thisToken


/**
 * Ping server
 * @param {EventEmitter} multicast
 * @return {function}
 */
var pingServer = function(multicast){
  return function(req,rinfo){
    req.rinfo = rinfo
    multicast.send('pong',req)
  }
}


/**
 * Ping client
 * @param {object} res
 * @param {object} rinfo
 */
var pingClient = function(res,rinfo){
  if(res.token === thisToken){
    pingHosts[rinfo.address] = +(new Date()) - +res.stamp
  } else {
    debug('[PING] Out of order ping ' +
      'response detected and ignored from ' + rinfo.address + ':' + rinfo.port)
  }
}


/**
 * Setup listeners for ping requests
 * @param {EventEmitter} multicast
 */
var pingListen = function(multicast){
  multicast.on('ping',pingServer(multicast)) //server
  multicast.on('pong',pingClient) //client
}


/**
 * Remove listeners for ping requests
 * @param {EventEmitter} multicast
 */
var pingStop = function(multicast){
  multicast.removeListener('ping',pingServer)
  multicast.removeListener('pong',pingClient)
}


/**
 * Send a ping request to multicast
 * @param {EventEmitter} multicast
 */
var pingSend = function(multicast){
  thisToken = shortId.generate()
  multicast.send('ping',{
    token: thisToken,
    stamp: +(new Date())
  })
  debug('hosts:' + util.inspect(pingHosts))
}

var pingSave = function(){
  if(!Object.keys(pingHosts).length){
    debug('skipping ping save, no hosts exist')
    return
  }
  debug('saving ping hosts',pingHosts)
  redis.hmset('peer:ping',pingHosts,function(err){
    if(err) logger.error('Couldnt save ping hosts',err)
  })
}


if(require.main === module){
  child(
    'oose:ping',
    function(done){
      done = done || function(){}
      //setup our multicast handler
      if(!multicast){
        multicast = new Multicast()
        multicast.bind(
          config.ping.port,
          config.ping.host,
          config.ping.multicast,
          function(err){
            if(err) return done(err)
            pingListen(multicast)
            pingInterval = setInterval(
              function(){pingSend(multicast)},
              config.ping.interval
            )
            pingSaveInterval = setInterval(pingSave,config.ping.interval)
            done()
          }
        )
      }
    },
    function(done){
      done = done || function(){}
      if(pingInterval) clearInterval(pingInterval)
      pingStop(multicast)
      done()
    }
  )
}
