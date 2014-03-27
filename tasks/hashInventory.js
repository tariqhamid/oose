'use strict';
var readdirp = require('readdirp')
  , file = require('file')

//scan dataRoot
module.exports = function(job,done){
  var rdStream = readdirp({root: job.data.root || './data'})
  rdStream.on('warn',console.error)
  rdStream.on('error',console.error)
  rdStream.on('end',done)
  rdStream.on('data',function(entry){
    file.insertToRedis(file.sha1FromPath(entry.path))
  })
}
