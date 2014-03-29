'use strict';
var readdirp = require('readdirp')
  , file = require('../helpers/file')
  , logger = require('../helpers/logger')
  , path = require('path')


/**
 * Export job
 * @param {Object} job
 * @param {Function} done
 */
module.exports = function(job,done){
  var fileCount = 0
  logger.info('Starting task to build inventory')
  var rdStream = readdirp({root: path.resolve(job.data.root) || path.resolve('./data'), directoryFilter: ['!tmp']})
  rdStream.on('warn',console.error)
  rdStream.on('error',console.error)
  rdStream.on('end',function(){
    logger.info('Completed building inventory, read ' + fileCount + ' files')
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
