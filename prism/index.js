'use strict';
var express = require('express')
  , app = express()
  , config = require('../config')
  , redis = require('../helpers/redis')
  , logger = require('../helpers/logger')

app.get('/api/nextPeer',function(req,res){
  redis.zrevrangebyscore('peerRank',100,0,function(err,peers){
    if(err) logger.error(err)
    if(!peers[0]){
      res.json({status: 'error', code: '2', message: 'No peers available'})
    } else {
      var hostname = peers[0]
      redis.hgetall('peers:' + hostname,function(err,peer){
        if(err) logger.error(err)
        if(!hostname || !peer.ip){
          res.json({status: 'error', code: '1', message: 'Failed to select next peer'})
        } else {
          res.json({status: 'ok', code: 0, hostname: hostname, ip: peer.ip})
        }
      })
    }
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
  app.listen(config.get('prism.port'),config.get('prism.host'),done)
}

if(require.main === module){
  exports.start(function(){
    var logger = require('../helpers/logger')
    logger.info('Prism  started listening on port ' + config.get('prism.port'))
  })
}
