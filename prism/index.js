'use strict';
var express = require('express')
  , app = express()
  , server = require('http').createServer(app)
  , config = require('../config')
  , redis = require('../helpers/redis')
  , async = require('async')
  , running = false
  , util = require('../helpers/communicator').util
app.get('/api/peerNext',function(req,res){
  redis.hgetall('peerNext',function(err,peer){
    if(err) return res.json({status: 'error', code: 1, message: err})
    res.json({status: 'ok', code: 0, peer: peer})
  })
})

app.get('/:sha1/:filename',function(req,res){
  var sha1 = req.params.sha1
  var existsInCache = false
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
          var peers = payload.message.peers
          console.log(peers)
        })
        client.on('error',function(err){
          next(err)
        })
      }
    ],
    //send the response
    function(err){
      if(err) return res.send({status: 'error', code: 1, message: err})
      res.send('..l..')
    }
  )
  /*
  redis.hget('hashPeers',sha1,function(err,peers){
    peers = JSON.parse(peers)
    //do some load balancing stuff here
    res.redirect('http://' + peers[0].hostname + req.originalUrl)
  })*/
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
