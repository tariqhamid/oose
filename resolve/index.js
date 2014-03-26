'use strict';
var express = require('express')
  , app = express()
  , config = require('../config')
  , redis = require('../helpers/redis')

app.get('/:sha1/:filename',function(req,res){
  var sha1 = req.param.sha1
  redis.hget('hashPeers',sha1,function(err,peers){
    peers = JSON.parse(peers)
    //do some load balancing stuff here
    res.redirect('http://' + peers[0].hostname + req.originalUrl)
  })
})

exports.start = function(){
  app.listen(config.get('resolve.port'),config.get('resolve.host'),function(err){
    if(err) console.error('Failed to start resolve: ' + err)
    else console.log('Resolve is started')
  })
}
