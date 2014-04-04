'use strict';
var Collector = require('../helpers/collector')
  , logger = require('../helpers/logger')
  , redis = require('../helpers/redis')
  , config = require('../config')

var selectPeer = function(basket,done){
  redis.zrevrangebyscore('peerRank',100,0,function(err,peers){
    if(err) logger.error(err)
    if(!peers[0]){
      logger.warn('Can\'t select next peer: no winner exists')
      done()
    } else {
      var hostname = peers[0]
      redis.hgetall('peers:' + hostname,function(err,peer){
        if(err) logger.error(err)
        if(!peer.hostname || !peer.ip){
          logger.warn('Can\'t select next peer: missing IP or hostname')
          done()
        } else {
          basket.hostname = peer.hostname
          basket.domain = config.get('domain')
          basket.ip = peer.ip
          basket.port = peer.importPort
          basket.availableCapacity = peer.availableCapacity
          done()
        }
      })
    }
  })
}

var save = function(basket,done){
  if(Object.keys(basket).length > 0){
    redis.hmset('peerNext',basket,function(err){
      if(err) logger.warn('Couldn\'t save next peer:' + err)
      done()
    })
  } else done()
}

var peerNext = new Collector()
peerNext.use(selectPeer)
peerNext.use('store',save)


/**
 * Export module
 * @type {Collector}
 */
module.exports = peerNext
