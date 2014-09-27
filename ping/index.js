'use strict';
var async = require('async')
var axon = require('axon')
var debug = require('debug')('oose:ping')
var child = require('infant').child

var logger = require('../helpers/logger').create('ping')
var PingClient = require('../helpers/PingClient')
var shortId = require('../helpers/shortid')
var redis = require('../helpers/redis')

var config = require('../config')
var emitter

var pingHosts = {}
var intervalPing
var intervalSave
var intervalSearch
var servers = {}
var serverWait = {}



var pingSearch = function(){
  redis.hgetall('peer:ip',function(err,result){
    if(err){
      debug('redis error',err)
      return
    }
    Object.keys(result).forEach(function(ip){
      if(servers[ip] || serverWait[ip]) return
      //camp to prevent connection flooding
      serverWait[ip] = true
      var tearDown = function(){
        setTimeout(function(){
          delete serverWait[ip]
        },config.ping.interval * 2)
        serverWait[ip] = true
        delete pingHosts[ip]
        delete servers[client.ip]
      }
      //setup new ping client
      var client = new PingClient(
        config.ping.port,
        ip,
        config.ping.interval,
        config.ping.max
      )
      //deal with errors
      client.on('error',function(err){
        debug(client.ip + ' has errored',err)
        tearDown()
      })
      //deal with teardowns
      client.on('stop',function(){
        debug(client.ip + ' has stopped')
        tearDown()
      })
      //handle new ping times
      client.on('ping',function(latency){
        pingHosts[client.ip] = latency
      })
      //connect to that client
      client.connect(function(err){
        if(err){
          debug('failed to connect to ' + ip,err)
          return
        }
        //add to server list
        delete serverWait[ip]
        servers[ip] = client
      })
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
            emitter.sock.set('retry max timeout',(config.ping.max * 2))
            emitter.sock.set('hwm',(config.ping.max / config.ping.interval * 2))
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
      //stop pinging
      if(intervalPing){
        debug('stopping ping send')
        clearInterval(intervalPing)
      }
      //stop searching
      if(intervalSearch){
        debug('stopping ping search')
        clearInterval(intervalSearch)
      }
      //stop saving
      if(intervalSave){
        debug('stopping ping save')
        clearInterval(intervalSave)
      }
      //stop clients
      for(var i in servers){
        if(!servers.hasOwnProperty(i)) continue
        servers[i].stop()
      }
      //stop emitter
      if(emitter){
        debug('stopping emitter')
        emitter.emit('disconnect')
        emitter.close()
      }
      done()
    }
  )
}
