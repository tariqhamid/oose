'use strict';
var express = require('express')
  , app = express()
  , server = require('http').createServer(app)
  , config = require('../config')
  , redis = require('../helpers/redis')
  , async = require('async')
  , util = require('../helpers/communicator').util

var running = false


/**
 * Build cache for prism
 * @param {string} sha1
 * @param {function} done
 */
var buildCache = function(sha1,done){
  var exists = {}
  async.series(
    [
      //acquire list of peers from locate up on the master
      function(next){
        console.log('Sending mesh.locate for ' + sha1)
        var client = util.tcpSend('locate',{sha1: sha1},config.get('mesh.port'),config.get('mesh.host'))
        client.once('readable',function(){
          //read our response
          var payload = util.parse(client.read(client.read(2).readUInt16BE(0)))
          //close the connection
          client.end()
          //check if we got an error
          if('ok' !== payload.message.status) return next(payload.message.message)
          //make sure the response is our sha1
          if(sha1 !== payload.command) return next('Wrong command resposne for ' + sha1)
          for(var i in payload.message.peers){
            if(payload.message.peers.hasOwnProperty(i)){
              if(payload.message.peers[i]) exists[i] = true
            }
          }
          next()
        })
        client.on('error',next)
      }
    ],
    //add the result to cache
    function(err){
      if(err) return done(err)
      redis.sadd('prism:' + sha1,Object.keys(exists),function(err){
        if(err) return done(err)
        redis.expire('prism:' + sha1,config.get('prism.cache.expire'),done)
      })
    }
  )
}


/**
 * Build redirect url
 * @param {object} req
 * @param {object} winner
 * @return {string}
 */
var buildDestination = function(req,winner){
  var destination = req.protocol + '://' + winner.hostname
  if(config.get('domain')){
    destination += '.' + config.get('domain')
  }
  if((80 !== winner.exportPort && 'http' === req.protocol) || 443 !== winner.exportPort && 'https' === req.protocol){
    destination += ':' + winner.exportPort
  }
  destination += req.originalUrl
  return destination
}

app.get('/api/peerNext',function(req,res){
  redis.hgetall('peer:next',function(err,peer){
    if(err) return res.json({status: 'error', code: 1, message: err})
    res.json({status: 'ok', code: 0, peer: peer})
  })
})

app.get('/:sha1/:filename',function(req,res){
  var sha1 = req.params.sha1
  var existsInCache = false
  var peerList = []
  var peers = {}
  var winner = false
  async.series(
    [
      //check if we already know about this file
      function(next){
        redis.exists('prism:' + sha1,function(err,result){
          if(err) return next(err)
          if(1 === result) existsInCache = true
          next()
        })
      },
      //if we must do a mesh.locate on the file
      function(next){
        if(existsInCache) return next()
        buildCache(sha1,next)
      },
      //grab from cache
      function(next){
        redis.smembers('prism:' + sha1,function(err,result){
          if(err) return next(err)
          peerList = result
          next()
        })
      },
      //resolve peer info
      function(next){
        async.each(
          peerList,
          function(hostname,next){
            redis.hgetall('peer:list:' + hostname,function(err,peer){
              if(err) return next(err)
              peers[hostname] = peer
              next()
            })
          },
          next
        )
      },
      //pick a winner
      function(next){
        for(var hostname in peers){
          if(peers.hasOwnProperty(hostname)){
            if(!winner || peers[hostname].availableCapacity < winner.availableCapacity){
              winner = peers[hostname]
            }
          }
        }
        next()
      }
    ],
    //send the response
    function(err){
      if(err) return res.send({status: 'error', code: 1, message: err})
      res.redirect(buildDestination(req,winner))
    }
  )
})


/**
 * Start prism
 * @param {function} done
 */
exports.start = function(done){
  if('function' !== typeof done) done = function(){}
  server.timeout = 0
  server.listen(config.get('prism.port'),config.get('prism.host'),function(err){
    running = true
    done(err)
  })
}


/**
 * Stop server
 * @param {function} done
 */
exports.stop = function(done){
  if('function' !== typeof done) done = function(){}
  if(server && running) server.close()
  done()
}
