'use strict';
var readdirp = require('readdirp')
  , config = require('../config')
  , logger = require('../helpers/logger').create('task:inventory')
  , file = require('../helpers/file')
  , path = require('path')


/**
 * Decide throttling of the progress messages
 * @param {object} progress
 * @param {boolean} force
 * @return {boolean}
 */
var progressThrottle = function(progress,force){
  force = force || false
  var show = false
  var now = new Date().valueOf()
  var lastUpdate = progress.lastUpdate
  if(lastUpdate instanceof Date) lastUpdate = progress.lastUpdate.valueOf()
  if(force) show = true
  if(!lastUpdate) show = true
  if(now > lastUpdate + progress.rate) show = true
  if(show){
    progress.lastUpdate = new Date()
    return true
  }
  return false
}


/**
 * Show the progress message
 * @param {object} progress
 * @param {boolean} force
 */
var progressMessage = function(progress,force){
  var duration = (new Date().valueOf() - progress.start) / 1000
  var fps = (progress.fileCount / duration).toFixed(2)
  if(progressThrottle(progress,force)){
    logger.info(
        'Initial inventory read ' + progress.fileCount +
        ' files in ' + duration +
        ' seconds averaging ' + fps + '/fps'
    )
  }
}


/**
 * Run inventory
 * @param {function} done
 */
exports.start = function(done){
  if('function' !== typeof done) done = function(){}
  var progress = {
    start: new Date().valueOf(),
    fileCount: 0,
    lastUpdate: 0,
    rate: 1000
  }
  var root = config.get('root')
  logger.info('Starting to build inventory')
  var rdStream = readdirp({root: path.resolve(root) || path.resolve('./data'), directoryFilter: ['!tmp']})
  rdStream.on('warn',function(warn){
    logger.warning(warn)
  })
  rdStream.on('error',function(err){
    done(err)
  })
  rdStream.on('end',function(){
    progressMessage(progress,true)
    logger.info('Inventory complete')
    done(null,progress.fileCount)
  })
  rdStream.on('data',function(entry){
    progress.fileCount++
    progressMessage(progress)
    var sha1 = file.sha1FromPath(entry.path)
    file.redisInsert(sha1,function(err){
      if(err) logger.warn('Failed to read ' + sha1 + ' file ' + entry.path + ' ' + err)
    })
  })
}
