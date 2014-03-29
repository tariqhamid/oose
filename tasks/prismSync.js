'use strict';
var redis = require('../helpers/redis')


/**
 * Export task
 * @param {object} job
 * @param {function} done
 */
module.exports = function(job,done){
  job.log('Prism beginning to sync its master hash inventory')
  var rs = redis.zscan('peerRank')
  rs.on('data',function(entry){
    console.log(entry)
  })
  rs.on('error',done)
  rs.on('close',function(){
    done()
  })
}
