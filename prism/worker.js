'use strict';
var async = require('async')
var axon = require('axon')
var bodyParser = require('body-parser')
var debug = require('debug')('oose:prism')
var express = require('express')
var worker = require('infant').worker

var app = express()
var server = require('http').createServer(app)

var peer = require('../helpers/peer')
var redis = require('../helpers/redis')

var config = require('../config')
var locate = axon.socket('req')
var running = false

app.disable('etag')
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
      //remove any existing redis keys when we get called here
      function(next){
        redis.del(['prism:' + sha1,'prism:lb:' + sha1],function(err){
          next(err)
        })
      },
      //acquire list of peers from locate up on the master
      function(next){
        locate.send({sha1: sha1},function(err,result){
          if(err) return next(err)
          var peers = result
          debug(sha1,'got payload',peers)
          for(var i in peers){
            if(!peers.hasOwnProperty(i)) continue
            if(peers[i] && 'null' !== i) exists.push(i)
          }
          debug(sha1,'got locate back',exists)
          if(0 === exists.length) return next('file not found')
          next()
        })
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
          function(err){ next(err) }
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
      done(err)
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
  debug('buildDestination','building destination url')
  if(!winner){
    debug('buildDestination','error, no winner exists')
    return false
  }
  var destination = req.protocol + '://' + winner.hostname
  if(config.locale.domain){
    destination += '.' + config.locale.domain
    debug('buildDestination','adding domain',destination)
  }
  if(
    (80 !== +winner.portExport && 'http' === req.protocol) ||
    (443 !== +winner.portExport && 'https' === req.protocol)
  ){
    destination += ':' + winner.portExport
    debug('buildDestination','adding port',destination)
  }
  destination += req.originalUrl
  debug('buildDestination','merging with original uri',destination)
  return destination
}


/**
 * Query the system for the next available peer
 */
app.get('/api/peerNext',function(req,res){
  debug('peerNext','got request, asking redis')
  redis.hgetall('peer:next',function(err,results){
    debug('peerNext','got response from redis',err,results)
    if(err) return res.json({status: 'error', code: 1, message: err})
    var peers = []
    for(var k in results){
      if(!results.hasOwnProperty(k)) continue
      var info = JSON.parse(results[k])
      info.host = info.hostname
      if(info.domain) info.host = info.hostname + '.' + info.domain
      peers.push(info)
    }
    debug('peerNext','peer list compiled, done',peers)
    res.json({status: 'ok', code: 0, peers: peers})
  })
})


/**
 * Accept new shredder jobs
 */
app.post('/api/shredderJob',function(req,res){
  var peerNext, jobHandle
  debug('got shredder job request')
  async.series(
    [
      //figure out next peer
      function(next){
        peer.nextByHits()
          .then(function(result){
            peerNext = result
            debug('selected peer for shredder job',peerNext.hostname)
            next()
          })
          .catch(next)
      },
      //send the request to that peer
      function(next){
        var client = axon.socket('req')
        debug(
          'setting up connection to send job',
          peerNext.ip + ':' + peerNext.portShredder)
        client.connect(+peerNext.portShredder,peerNext.ip)
        client.send(
          {description: JSON.stringify(req.body)},
          function(err,result){
            client.close()
            if(err) return next(err)
            debug('job sent',err,result)
            if(!result.handle) return next('No job handle created')
            jobHandle = result.handle
            next()
          }
        )
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
 * Main file request lookup
 */
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
        if(!sha1.match(/^[0-9a-f]{40}$/))
          return next('invalid hash')
        debug(sha1,'got request')
        next()
      },
      ///check for cache
      function(next){
        redis.exists('prism:' + sha1,function(err,exists){
          if(err) return next(err)
          if(exists){
            debug(sha1,'cache hit found using it')
            return next()
          }
          //since we don't have the result in cache,
          debug(sha1,'cache miss')
          buildCache(sha1,function(err){
            debug(sha1,'build cache returned',err)
            next(err)
          })
        })
      },
      function(next){
        debug(sha1,'looking up redis key for peer list')
        redis.smembers('prism:' + sha1,function(err,result){
          debug(sha1,'got peer list',err,result)
          if(err) return next(err)
          if(!result || !result.length) return next('file not found')
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
              debug(sha1,'got result for peer info')
              if(err) return next(err)
              if(!peer) return next()
              if(peer.hits) delete peer.hits
              peers.push(peer)
              next()
            })
          },
          function(err){
            if(err) return next(err)
            if(!peers.length) return next('No peers found')
            next()
          }
        )
      },
      //resolving hit info
      function(next){
        redis.hgetall('prism:lb:' + sha1,function(err,result){
          debug(sha1,'got result for hit info',result)
          //check if we dont have hits, if not create them
          if(!result){
            peerList.forEach(function(hostname){
              hits[hostname] = 0
            })
            redis.hmset('prism:lb:' + sha1,hits,function(err){
              next(err)
            })
          }
          //if we do have hits just continue on
          else {
            hits = result
            next(err)
          }
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
        debug(sha1,
            'Candidates ' + candidates +
            'Selecting ' + winner.hostname + ' as winner'
        )
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
      if(err) debug(sha1,err)
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
      //check for erroneous url check
      if(!url){
        res.status(500)
        res.send({
          status: 'error',
          code: 2,
          message: 'Could not build destination url'
        })
        return
      }
      debug(sha1,'redirecting to',url)
      res.redirect(url)
    }
  )
})


/**
 * Start prism
 * @param {function} done
 */
exports.start = function(done){
  if('function' !== typeof done) done = function(){}
  //server.timeout = 0
  async.series(
    [
      function(next){
        locate.connect(
          +config.locate.port,
          config.locate.host || '127.0.0.1',
          next
        )
      },
      function(next){
        server.listen(
          +config.prism.port,
          config.prism.host,
          next
        )
      }
    ],
    function(err){
      if(!err) running = true
      done(err)
    }
  )
}


/**
 * Stop server
 * @param {function} done
 */
exports.stop = function(done){
  async.series(
    [
      function(next){
        if(!server) return next()
        debug('closing server')
        server.close(function(err){
          debug('server closed',err)
        })
        next()
      },
      function(next){
        if(!locate) return next()
        debug('closing locate')
        locate.close()
        next()
      }
    ],
    done
  )
}

if(require.main === module){
  worker(
    server,
    'oose:' + config.locale.id + ':prism:worker',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
