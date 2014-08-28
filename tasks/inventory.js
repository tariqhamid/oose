'use strict';
var path = require('path')
var readdirp = require('readdirp')

var file = require('../helpers/file')
var logger = require('../helpers/logger').create('task:inventory')

var config = require('../config')


/**
 * Decide throttling of the progress messages
 * @param {object} progress
 * @param {boolean} force
 * @return {boolean}
 */
var progressThrottle = function(progress,force){
  var show = false
  var now = +(new Date())
  var lastUpdate = +progress.lastUpdate
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
  var duration = ((+new Date()) - progress.start) / 1000
  var fps = (progress.fileCount / (duration || 0.1)).toFixed(2)
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
    start: +(new Date()),
    fileCount: 0,
    lastUpdate: 0,
    rate: 250
  }
  var root = config.root
  logger.info('Starting to build inventory')
  var rdStream = readdirp(
    {root: path.resolve(root) || path.resolve('./data'),
    directoryFilter: ['!tmp']}
  )
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
    progressMessage(progress,false)
    var sha1 = file.sha1FromPath(entry.path)
    file.redisInsert(sha1,function(err){
      if(err){
        logger.warn(
          'Failed to read ' + sha1 + ' file ' + entry.path + ' ' + err
        )
      }
    })
  })
}
