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
  console.log(job.data)
  redis.hgetall('peers:' + job.data.hostname,function(err,peer){
    if(err) return done(err)
    console.log('prism peer ' + peer)
    done()
  })
}
