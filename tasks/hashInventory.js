'use strict';
var readdirp = require('readdirp')
  , file = require('../helpers/file')
  , logger = require('../helpers/logger')
  , path = require('path')

//scan dataRoot
module.exports = function(job,done){
  var fileCount = 0
  logger.info('Starting task to build hash inventory')
  var rdStream = readdirp({root: path.resolve(job.data.root) || path.resolve('./data')})
  rdStream.on('warn',console.error)
  rdStream.on('error',console.error)
  rdStream.on('end',function(){
    logger.info('Completed building hash inventory, read ' + fileCount + ' files')
    done()
  })
  rdStream.on('data',function(entry){
    fileCount++
    var sha1 = file.sha1FromPath(entry.path)
    file.redisInsert(sha1,function(err){
      if(err) logger.warn('Failed to read ' + sha1 + ' file ' + entry.path + ' ' + err)
    })
  })
}
