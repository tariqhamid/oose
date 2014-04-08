'use strict';
var Collector = require('../helpers/collector')
  , logger = require('../helpers/logger')
  , redis = require('../helpers/redis')
  , config = require('../config')

var selectPeer = function(basket,done){
  redis.zrevrangebyscore('peer:rank',100,0,function(err,peers){
    if(err) logger.error(err)
    if(!peers[0]){
      done('Can\'t select next peer: no winner exists')
    } else {
      var hostname = peers[0]
      redis.hgetall('peer:db:' + hostname,function(err,peer){
        if(err) logger.error(err)
        if(!peer.hostname || !peer.ip){
          done('Can\'t select next peer: missing IP or hostname')
        } else {
          basket.hostname = peer.hostname
          basket.domain = config.get('domain')
          basket.ip = peer.ip
          basket.port = peer.importPort
          basket.availableCapacity = peer.availableCapacity
          done(null,basket)
        }
      })
    }
  })
}

var save = function(basket,done){
  if(Object.keys(basket).length > 0){
    redis.hmset('peer:next',basket,function(err){
      if(err) done('Couldn\'t save next peer:' + err)
      else done(null,basket)
    })
  } else done(null,basket)
}

var peerNext = new Collector()
peerNext.collect(selectPeer)
peerNext.save(save)
peerNext.on('error',logger.warn)


/**
 * Export module
 * @type {Collector}
 */
module.exports = peerNext
