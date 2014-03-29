'use strict';
var Collector = require('./collector')
  , logger = require('./logger')
  , redis = require('./redis')

var selectPeer = function(basket,done){
  redis.zrevrangebyscore('peerRank',100,0,function(err,peers){
    if(err) logger.error(err)
    if(!peers[0]){
      logger.warn('Cant select next peer no winner exists')
      done()
    } else {
      var hostname = peers[0]
      redis.hgetall('peers:' + hostname,function(err,peer){
        if(err) logger.error(err)
        if(!peer.hostname || !peer.ip){
          logger.warn('Cant select next peer missing ip or hostname')
          done()
        } else {
          basket.handle = peer.handle
          basket.hostname = peer.hostname
          basket.ip = peer.ip
          basket.port = peer.port
          done()
        }
      })
    }
  })
}

var save = function(basket,done){
  if(Object.keys(basket).length > 0){
    redis.hmset('nextPeer',basket,function(err){
      if(err) logger.warn('Couldnt save next peer ' + err)
      done()
    })
  } else done()
}

var nextPeer = new Collector()
nextPeer.use(selectPeer)
nextPeer.use('store',save)


/**
 * Export module
 * @type {Collector}
 */
module.exports = nextPeer
