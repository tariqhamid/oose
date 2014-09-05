'use strict';
var async = require('async')
var bodyParser = require('body-parser')
var debug = require('debug')('oose:prism')
var express = require('express')

var app = express()
var server = require('http').createServer(app)

var commUtil = require('../helpers/communicator').util
//var logger = require('../helpers/logger').create('prism')
var peer = require('../helpers/peer')
var redis = require('../helpers/redis')

var config = require('../config')

var running = false

app.use(bodyParser.urlencoded({extended:true}))
app.use(bodyParser.json())


/**
 * Build cache for prism
 * @param {string} sha1
 * @param {function} done
 */
var buildCache = function(sha1,done){
  debug(sha1,'building cache')
  var exists = []
  async.series(
    [
      //acquire list of peers from locate up on the master
      function(next){
        var client = commUtil.tcpSend(
          'locate',
          {sha1: sha1},
          config.mesh.port,
          config.mesh.host
        )
        client.once('readable',function(){
          var sizebits = client.read(2)
          if(null === sizebits)
            return done('failed to parse locate response, empty payload')
          //read our response
          var payload = commUtil.parse(client.read(sizebits.readUInt16BE(0)))
          //close the connection
          client.end()
          //check if we got an error
          if('ok' !== payload.message.status)
            return next(payload.message.message)
          //make sure the response is our sha1
          if(sha1 !== payload.command)
            return next('Wrong command response for ' + sha1)
          debug(sha1,'got payload',payload.message.peers)
          for(var i in payload.message.peers){
            if(!payload.message.peers.hasOwnProperty(i)) continue
            if(payload.message.peers[i] && 'null' !== i) exists.push(i)
          }
          debug(sha1,'got locate back',exists)
          next()
        })
        client.on('error',next)
      },
      //add the result to cache
      function(next){
        debug(sha1,'adding to prism existence')
        redis.sadd('prism:' + sha1,exists,function(err){next(err)})
      },
      //add the hit counters
      function(next){
        debug(sha1,'setting up lb counters')
        var hits = {}
        exists.forEach(function(hostname){
          hits[hostname] = 0
        })
        redis.hmset(
          'prism:lb:' + sha1,
          hits,
          function(err){next(err)}
        )
      },
      //set the keys to expire
      function(next){
        debug(sha1,'setting expire on keys')
        redis.expire(
          ['prism:' + sha1,'prism:lb:' + sha1],
          config.prism.cache.expire,
          function(err){next(err)}
        )
      }
    ],
    function(err){
      debug(sha1,'finished building cache')
      if(err) return done(err)
      if(!exists.length) return done('file not found')
      done()
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
  if(!winner) return false
  var destination = req.protocol + '://' + winner.hostname
  if(config.domain){
    destination += '.' + config.domain
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
  redis.hgetall('peer:next',function(err,results){
    if(err) return res.json({status: 'error', code: 1, message: err})
    var peers = []
    for(var k in results){
      if(!results.hasOwnProperty(k)) continue
      var info = JSON.parse(results[k])
      info.host = info.hostname
      if(info.domain) info.host = info.hostname + '.' + info.domain
      peers.push(info)
    }
    res.json({status: 'ok', code: 0, peers: peers})
  })
})

app.get('/:sha1/:filename',function(req,res){
  var sha1 = req.params.sha1
  var hits = []
  var peerList = []
  var peers = []
  var winner = {}
  async.series(
    [
      //validate
      function(next){
        if(!sha1.match(/^[0-9a-f]{40}$/)) next('invalid hash')
        debug(sha1,'got request')
        next()
      },
      ///grab from cache
      function(next){
        redis.smembers('prism:' + sha1,function(err,result){
          if(err) return next(err)
          if(result && result.length){
            debug(sha1,'cache hit found using it')
            peerList = result
            next()
          }
          //since we dont have the result in cache, build the cache, store it and grab it
          else {
            debug(sha1,'cache miss')
            async.series(
              [
                function(next){
                  buildCache(sha1,next)
                },
                function(next){
                  redis.smembers('prism:' + sha1,function(err,result){
                    if(err) return next(err)
                    if(!result) return next('file not found')
                    peerList = result
                    next()
                  })
                }
              ],
              function(err){
                next(err)
              }
            )
          }
        })
      },
      //resolve peer info
      function(next){
        async.each(
          peerList,
          function(hostname,next){
            redis.hgetall('peer:db:' + hostname,function(err,peer){
              debug(sha1,'got result for peer info')
              if(err) return next(err)
              if(!peer) return next()
              if(peer.hits) delete peer.hits
              peers.push(peer)
              next()
            })
          },
          next
        )
      },
      //resolving hit info
      function(next){
        redis.hgetall('prism:lb:' + sha1,function(err,result){
          debug(sha1,'got result for hit info',result)
          hits = result
          next(err)
        })
      },
      //pick a winner
      function(next){
        var candidates = ''
        peers.forEach(function(peer){
          candidates += '[' + peer.hostname + ':' + hits[peer.hostname] + '] '
          if(!winner.hostname || +hits[peer.hostname] < +hits[winner.hostname]){
            winner = peer
          }
        })
        debug(sha1,'Candidates ' + candidates + 'Selecting ' + winner.hostname + ' as winner')
        if(!winner) return next('Could not select peer')
        next()
      },
      //increment the hits of the winner
      function(next){
        debug(sha1,'incrementing hits on prism:lb:' + sha1)
        redis.hincrby('prism:lb:' + sha1,winner.hostname,1,function(err){
          next(err)
        })
      }
    ],
    //send the response
    function(err){
      if('file not found' === err){
        res.status(404)
        res.send('File not found')
        return
      }
      if(err){
        res.status(500)
        return res.send({status: 'error', code: 1, message: err})
      }
      var url = buildDestination(req,winner)
      debug(sha1,'redirecting to',url)
      res.redirect(url)
    }
  )
})


app.post('/api/shredderJob',function(req,res){
  var peerNext, jobHandle
  async.series(
    [
      //figure out next peer
      function(next){
        peer.nextByHits(function(err,result){
          if(err) return next(err)
          peerNext = result
          next()
        })
      },
      //send the request to that peer
      function(next){
        var client = commUtil.tcpSend(
          'shred:job:push',
          {description: JSON.stringify(req.body)},
          peerNext.portShredder,
          peerNext.ip
        )
        client.once('readable',function(){
          var size = client.read(2)
          if(null === size) return next('Failed to queue job')
          size = size.readUInt16BE(0)
          //read our response
          var payload = commUtil.parse(client.read(size))
          //close the connection
          client.end()
          //check if we got an error
          if('ok' !== payload.message.status)
            return next(payload.message.message)
          if(!payload.message.handle) return next('No job handle created')
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


/**
 * Start prism
 * @param {function} done
 */
exports.start = function(done){
  if('function' !== typeof done) done = function(){}
  server.timeout = 0
  server.listen(config.prism.port,config.prism.host,function(err){
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
  if(server && running){
    running = false
    server.close()
  }
  done()
}
