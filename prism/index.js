'use strict';
var express = require('express')
  , app = express()
  , server = require('http').createServer(app)
  , config = require('../config')
  , redis = require('../helpers/redis')
  , running = false

app.get('/api/peerNext',function(req,res){
  redis.hgetall('peerNext',function(err,peer){
    if(err) return res.json({status: 'error', code: 1, message: err})
    res.json({status: 'ok', code: 0, peer: peer})
  })
})

app.get('/:sha1/:filename',function(req,res){
  var sha1 = req.param.sha1
  redis.hget('hashPeers',sha1,function(err,peers){
    peers = JSON.parse(peers)
    //do some load balancing stuff here
    res.redirect('http://' + peers[0].hostname + req.originalUrl)
  })
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
