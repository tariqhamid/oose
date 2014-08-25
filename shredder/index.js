'use strict';
var async = require('async')
var childProcess = require('child_process')
var fs = require('graceful-fs')
var mkdirp = require('mkdirp')
var moment = require('moment')
var os = require('os')
var path = require('path')
var util = require('util')

var commUtil = require('../helpers/communicator').util
var Logger = require('../helpers/logger')
var shortId = require('../helpers/shortid')
var logger = Logger.create('shredder')

var config = require('../config')
var mesh = require('../mesh')

var deferred = []
var deferredInterval = null
var running = false


/**
 * Spawn a worker to process the job
 * @param {object} opts
 * @param {function} done
 */
var spawnWorker = function(opts,done){
  logger.info('Starting to spawn worker for job ' + opts.handle)
  var worker = childProcess.fork(__dirname + '/worker.js')
  worker.on('error',function(err){
    done(util.inspect(err))
  })
  worker.on('exit',function(code){
    if(0 !== code)
      return done('Worker failed, exited with code: ' + code)
    logger.info('Worker for job ' + opts.handle + ' has finished and exited without error')
    done()
  })
  //start the worker by sending it options
  worker.send({options: opts})
}


/**
 * The job queue
 */
var q = async.queue(
  function(opts,done){
    if('undefined' === typeof opts.handle || null === opts.handle || !opts.handle)
      done('ERROR: Job.handle not set')
    spawnWorker(opts,done)
  },
  config.shredder.concurrency || os.cpus().length || 1
)


/**
 * Iterate deferred jobs and punt them to the queue
 */
var scheduleDeferred = function(){
  deferred.forEach(function(job,i){
    if(job.start <= new Date()){
      //drop from deferred
      deferred.splice(i,1)
      //send to q for processing
      logger.info('Job queued locally as ' + job.handle)
      q.push(job)
    }
  })
}


/**
 * Set up Mesh event listener
 * @param {function} done Callback
 */
var meshStart = function(done){
  // shred:job:push - queue entry acceptor
  mesh.tcp.on('shred:job:push',function(message,socket){
    //build job description
    var job = {
      handle: shortId.generate(),
      description: message.description
    }
    //check to see if the job has been scheduled and defer it if so
    var description = JSON.parse(message.description)
    if(description.schedule && description.schedule.start && 'now' !== description.schedule.start){
      if(description.schedule.match(/^\+/)){
        description.schedule.start = description.schedule.start.replace(/^\+(\d+)/,'$1')
        job.start = new Date().getTime() + description.schedule.start
      } else {
        job.start = moment(description.schedule.start)
      }
    }
    //if we have a start it means we are deferred
    if(!job.start){
      //jab job into local q
      logger.info('Job queued locally as ' + job.handle)
      q.push(job)
    } else {
      logger.info('Job deferred locally as ' + job.handle)
    }
    //respond to the request with the assigned handle and queue position
    socket.end(commUtil.withLength(commUtil.build(
      job.handle,
      {status: 'ok', handle: job.handle, position: q.length()}
    )))
  })
  //start trying to train the deferred jobs
  deferredInterval = setInterval(scheduleDeferred,15000)
  logger.info('Listening for shredder jobs')
  done()
}


/**
 * Stop mesh listening
 * @param {function} done
 */
var meshStop = function(done){
  if(deferredInterval) clearTimeout(deferredInterval)
  mesh.tcp.removeAllListeners('shred:job:push')
  done()
}


/**
 * Start shredder (but not necessarily the Shredder-queue)
 * @param {function} done
 * @return {*}
 */
exports.start = function(done){
  if('function' !== typeof done) done = function(){}
  async.series(
    [
      //setup root folder for processing jobs
      function(next){
        //check if root exists
        if(!config.shredder.root)
          config.$set('shredder.root',path.resolve(config.root))
        //make sure the root folder exists
        if(!fs.existsSync(config.shredder.root))
          mkdirp.sync(config.shredder.root)
        if(!fs.existsSync(config.shredder.root))
          return next('Root folder [' + path.resolve(config.shredder.root) + '] does not exist')
        next()
      },
      //start listening on mesh
      function(next){
        meshStart(next)
      }
    ],
    function(err){
      if(err) return done(err)
      running = true
      done()
    }
  )
}


/**
 * Stop server
 * @param {function} done
 */
exports.stop = function(done){
  if('function' !== typeof done) done = function(){}
  if(running){
    meshStop(function(err){
      if(err) return done(err)
      running = false
      done()
    })
  }
}
