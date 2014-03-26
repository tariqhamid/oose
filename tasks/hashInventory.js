'use strict';
var readdirp = require('readdirp')
  , redis = require('../helpers/redis')

//scan dataRoot
module.exports = function(job,done){
  var rdStream = readdirp({root: job.data.root || './data'})
  rdStream.on('warn',console.error)
  rdStream.on('error',console.error)
  rdStream.on('end',done)
  rdStream.on('data',function(entry){
    var sha1 = entry.path
    sha1.replace('/','')
    sha1.replace('\\','')
    redis.lpush('hashTable',sha1)
    redis.hset('hashInfo',sha1,JSON.stringify(entry))
  })
}