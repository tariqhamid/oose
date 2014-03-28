'use strict';
var express = require('express')
  , app = express()
  , config = require('../config')
  , redis = require('../helpers/redis')

app.get('/api/selectPeer',function(req,res){
  redis.hgetall(['peers:*'],function(err,peers){
    console.log(peers)
    res.json({status: 'ok', code: 0, peer: '127.0.0.1'})
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

exports.start = function(done){
  app.listen(config.get('prism.port'),config.get('prism.host'),done)
}

if(require.main === module){
  exports.start(function(){
    var logger = require('../helpers/logger')
    logger.info('Prism  started listening on port ' + config.get('prism.port'))
  })
}