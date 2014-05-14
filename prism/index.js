'use strict';
var express = require('express')
  , app = express()
  , server = require('http').createServer(app)
  , config = require('../config')
  , redis = require('../helpers/redis')
  , async = require('async')
var commUtil = require('../helpers/communicator').util

var running = false

app.use(express.urlencoded())


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
        var client = commUtil.tcpSend('locate',{sha1: sha1},config.get('mesh.port'),config.get('mesh.host'))
        client.once('readable',function(){
          //read our response
          var payload = commUtil.parse(client.read(client.read(2).readUInt16BE(0)))
          //close the connection
          client.end()
          //check if we got an error
          if('ok' !== payload.message.status) return next(payload.message.message)
          //make sure the response is our sha1
          if(sha1 !== payload.command) return next('Wrong command response for ' + sha1)
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
  if(
    (80 !== winner.portExport && 'http' === req.protocol) ||
    443 !== winner.portExport && 'https' === req.protocol
  ){
    destination += ':' + winner.portExport
  }
  destination += req.originalUrl
  return destination
}

app.get('/api/peerNext',function(req,res){
  redis.hgetall('peer:next',function(err,peer){
    if(err) return res.json({status: 'error', code: 1, message: err})
    peer.host = peer.hostname + '.' + peer.domain
    res.json({status: 'ok', code: 0, peer: peer})
  })
})

app.post('/api/shredderJob',function(req,res){
  var peerNext, jobHandle
  async.series(
    [
      //validate input
      function(next){
        if(!req.body.filename) return next('filename is required')
        if(!req.body.mimeType) return next('mimeType is required')
        if(!req.body.sha1) return next('sha1 is required')
        if(!req.body.source) return next('source url is required')
        if(!req.body.callback) return next('callback url is required')
        next()
      },
      //figure out next peer
      function(next){
        redis.hgetall('peer:next',function(err,result){
          if(err) return next(err)
          if(!result) return next('could not find next peer')
          peerNext = result
          next()
        })
      },
      //send the request to that peer
      function(next){
        var client = commUtil.tcpSend('shred:job:push',req.body,peerNext.portMesh,peerNext.ip)
        client.once('readable',function(){
          //read our response
          var payload = commUtil.parse(client.read(client.read(2).readUInt16BE(0)))
          //close the connection
          client.end()
          //check if we got an error
          if('ok' !== payload.message.status) return next(payload.message.message)
          //make sure the response is our sha1
          if(req.body.sha1 !== payload.command) return next('Wrong command response for ' + req.body.sha1)
          if(!payload.message.handle) return next('No job handle created for ' + req.body.sha1)
          jobHandle = payload.message.handle
          next()
        })
        client.on('error',next)
      }
    ],
    function(err){
      if(err){
        return res.json({
          status: 'error',
          code: 1,
          message: err
        })
      }
      return res.json({
        status: 'ok',
        code: 0,
        handle: jobHandle
      })
    }
  )
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
            redis.hgetall('peer:db:' + hostname,function(err,peer){
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
