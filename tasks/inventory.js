'use strict';
var readdirp = require('readdirp')
  , file = require('../helpers/file')
  , path = require('path')


/**
 * Export job
 * @param {Object} job
 * @param {Function} done
 */
module.exports = function(job,done){
  var fileCount = 0
  job.log('Starting task to build inventory')
  var rdStream = readdirp({root: path.resolve(job.data.root) || path.resolve('./data'), directoryFilter: ['!tmp']})
  rdStream.on('warn',console.error)
  rdStream.on('error',console.error)
  rdStream.on('end',function(){
    job.log('Completed building inventory, read ' + fileCount + ' files')
    done()
  })
  rdStream.on('data',function(entry){
    fileCount++
    var sha1 = file.sha1FromPath(entry.path)
    file.redisInsert(sha1,function(err){
      if(err) job.log('Failed to read ' + sha1 + ' file ' + entry.path + ' ' + err)
    })
  })
}
