'use strict';
var Collector = require('./collector')
  , logger = require('./logger')
  , redis = require('./redis')

var selectPeer = function(basket,done){
  basket = false
  redis.zrevrangebyscore('peerRank',100,0,function(err,peers){
    if(err) logger.error(err)
    if(!peers[0]){
      logger.warn('Cant select next peer no winner exists')
    } else {
      var hostname = peers[0]
      redis.hgetall('peers:' + hostname,function(err,peer){
        if(err) logger.error(err)
        if(!peer.hostname || !peer.ip){
          logger.warn('Cant select next peer missing ip or hostname')
        } else {
          basket = peer
          done()
        }
      })
    }
  })
}

var save = function(basket,done){
  if(basket) redis.hmset('nextPeer',basket,done)
}

var nextPeer = new Collector()
nextPeer.use(selectPeer)
nextPeer.use('store',save)


/**
 * Export module
 * @type {Collector}
 */
module.exports = nextPeer
