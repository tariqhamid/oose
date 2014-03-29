'use strict';
var redis = require('../helpers/redis')
  , async = require('async')


/**
 * Export task
 * @param {object} job
 * @param {function} done
 */
module.exports = function(job,done){
  job.log('Prism beginning to sync its master hash inventory')
  redis.smembers('peerList',function(err,peers){
    if(err) return done(err)
    async.each(peers,function(hostname,next){
      redis.hgetall('peers:' + hostname,function(err,peer){
        if(err) return done(err)
        console.log(peer)
        next()
      })
    },done)
  })
}
