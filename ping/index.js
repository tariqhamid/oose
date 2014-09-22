'use strict';
var async = require('async')
var axon = require('axon')
var debug = require('debug')('oose:ping')

var child = require('../helpers/child').child
var logger = require('../helpers/logger').create('ping')
var shortId = require('../helpers/shortid')
var redis = require('../helpers/redis')

var config = require('../config')
var emitter
var pingHosts = {}
var intervalPing
var intervalSave
var intervalSearch
var servers = {}


/**
 * Handle a new ping request
 * @param {string} ip
 * @param {object} req
 * @param {object} info
 * @return {*}
 */
var pingHandler = function(ip,req,info){
  //validate request
  if(!ip || !req || !info || !req.token || !req.stamp){
    debug('got invalid ping request ignoring',ip,req,info)
    return
  }
  //push the newest record
  var latency = req.stamp - info.last.stamp - config.ping.interval
  //if the latency is outside of our max window ignore it
  if(latency > config.ping.max){
    debug('ignoring late or first ping',latency)
    info.last.token = req.token
    info.last.stamp = req.stamp
    return
  }
  //store new latency record
  info.latency.current = latency
  info.latency.history.push(latency)
  //trim any old records off the front
  if(info.latency.history.length > 10)
    info.latency.history.splice(0,info.latency.history.length - 10)
  //keep info to compare with next events
  info.last.token = req.token
  info.last.stamp = req.stamp
  //update the pingHosts tracking
  pingHosts[ip] = latency
  //debug('updated info record',info)
}


/**
 * Connect to a new server and setup handlers
 * @param {string} ip
 */
var pingConnect = function(ip){
  debug('found server to connect to',ip)
  var info = {
    latency: {
      current: 0,
      history: []
    },
    last: {
      token: '',
      stamp: 0
    }
  }
  //mark that we are connecting to the server
  servers[ip] = {}
  var sock = axon.socket('sub-emitter')
  sock.set('retry max timeout',config.ping.max)
  sock.set('hwm',config.ping.hwm)
  //handle errors
  sock.on('error',function(err){
    debug('failed to connect to ' + ip,err)
    if(pingHosts[ip]) delete pingHosts[ip]
    if(servers[ip]) delete servers[ip]
  })
  sock.connect(config.ping.port,ip,function(){
    sock.on('disconnect',function(){
      debug('got close event from ' + ip + ', cleaning up records')
      if(pingHosts[ip]) delete pingHosts[ip]
      if(servers[ip]) delete servers[ip]
    })
    sock.on('ping',function(req){
      pingHandler(ip,req,info)
    })
    servers[ip] = {
      sock: sock,
      info: info
    }
  })

}


var pingSearch = function(){
  redis.hgetall('peer:ip',function(err,result){
    if(err){
      debug('redis error',err)
      return
    }
    Object.keys(result).forEach(function(ip){
      if(servers[ip]) return
      pingConnect(ip)
    })
  })
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
      debug('starting ping system')
      async.series(
        [
          //start axon server
          function(next){
            emitter = axon.socket('pub-emitter')
            emitter.bind(+config.ping.port,config.ping.host,function(err){
              debug('axon emitter setup and bound',err)
              next(err)
            })
          },
          //start our emitter
          function(next){
            debug('starting ping send')
            intervalPing = setInterval(
              function(){
                var req = {
                  token: shortId.generate(),
                  stamp: +(new Date())
                }
                emitter.emit('ping',req)
              },
              +config.ping.interval
            )
            next()
          },
          //setup save timer
          function(next){
            debug('starting ping save')
            intervalSave = setInterval(pingSave,+config.ping.interval * 2)
            next()
          },
          //setup searching for clients
          function(next){
            debug('starting ping search')
            intervalSearch = setInterval(pingSearch,+config.ping.interval)
            next()
          }
        ],
        function(err){
          if(err) return done(err)
          done()
        }
      )
    },
    function(done){
      done = done || function(){}
      if(emitter){
        debug('stopping emitter')
        emitter.emit('disconnect')
        emitter.close()
      }
      if(intervalSearch){
        debug('stopping ping search')
        clearInterval(intervalSearch)
      }
      if(intervalSave){
        debug('stopping ping save')
        clearInterval(intervalSave)
      }
      if(intervalPing){
        debug('stopping ping send')
        clearInterval(intervalPing)
      }
      done()
    }
  )
}
