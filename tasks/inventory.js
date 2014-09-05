'use strict';
var async = require('async')
var debug = require('debug')('oose:task:inventory')
var path = require('path')
var childProcess = require('child_process')

var file = require('../helpers/file')
var logger = require('../helpers/logger').create('task:inventory')

var config = require('../config')
var flipSlashExp = /\\/g
var newLineExp = /\r\n/g
var rootExp = new RegExp(
  path.resolve(config.root).replace(flipSlashExp,'/'),
  'i'
)
var tmpExp = /tmp/i


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
 * Process files
 * @param {object} progress
 * @param {string} data
 * @param {function} done
 */
var processFiles = function(progress,data,done){
  //replace any windows newlines
  data = data.replace(newLineExp,'\n')
  var lines = data
    .split('\n')
    .filter(function(item){return '' !== item})
    .map(function(val){
      return val.replace(flipSlashExp,'/').replace(rootExp,'')
    })
  async.each(
    lines,
    function(entry,next){
      //disqualify tmp
      if(entry.match(tmpExp)) return next()
      //inc counters and display progress
      progress.fileCount++
      //get the sha1 from the entry
      var sha1 = file.sha1FromPath(entry)
      file.redisInsert(sha1,function(err){
        if(err)
          return next('Failed to read ' + sha1 + ' file ' + data + ' ' + err)
        debug('inserted file',sha1)
        next()
      })
    },
    function(err){
      if(err) logger.warning(err)
      progressMessage(progress,false)
      done(err)
    }
  )
}


/**
 * Run inventory
 * @param {function} done
 */
var start = function(done){
  if('function' !== typeof done) done = function(){}
  logger.info('Starting to build inventory')
  var progress = {
    start: +(new Date()),
    fileCount: 0,
    lastUpdate: 0,
    rate: 250
  }
  var buffer = ''
  var windows = 'win32' === process.platform
  var cp
  debug(windows)
  if(windows){
    debug('on windows')
    cp = childProcess.spawn('cmd',['/c','dir','/a:-d','/s','/b','/o:n'],{cwd: config.root})
  } else {
    debug('on linux')
    cp = childProcess.spawn('find',[config.root,'-type','f'])
  }
  cp.on('error',function(err){
    debug('error',err)
    done(err)
  })
  cp.stdout.setEncoding('utf-8')
  cp.stderr.setEncoding('utf-8')
  cp.stdout.on('data',function(data){
    buffer = buffer + data
  })
  cp.stderr.on('data',function(data){
    debug('stderr',data)
  })
  cp.on('close',function(code){
    debug('done reading files',code)
    processFiles(progress,buffer,function(err){
      logger.info('Inventory complete, read ' + progress.fileCount + ' files')
      done(err,progress.fileCount)
    })
  })
}

//execute inventory on open
start(function(err){
  if(err){
    process.send({status: 'error', message: err})
  }
  process.send({status: 'ok'})
  process.exit()
})
