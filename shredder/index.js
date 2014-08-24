'use strict';
var fs = require('graceful-fs')
var os = require('os')
var path = require('path')
var moment = require('moment')
var config = require('../config')
var async = require('async')
var Logger = require('../helpers/logger')
var mkdirp = require('mkdirp')
var shortId = require('shortid')
var mesh = require('../mesh')
var Job = require('./helpers/job')
var commUtil = require('../helpers/communicator').util
var logger = Logger.create('shredder')
var running = false
var deferred = []
var deferredInterval = null


/**
 * Check a job for a cached result
 * @param {Job} job
 * @param {function} next
 * @param {function} done
 */
var jobCacheCheck = function(job,next,done){
  job.cacheCheck(function(err,result){
    if(err){
      job.logger.info('Cache hit failed: ' + err)
      return next()
    }
    if(!result) return next()
    job.logger.info('Cache hit successful!',result)
    job.update({
      status: 'complete',
      message: 'Complete, cache hit found',
      steps: {
        complete: 1,
        total: 1
      },
      frames: {
        complete: 1,
        total: 1
      },
      resources: result
    },true)
    done()
  })
}


/**
 * Run a job
 * @param {object} job Job structure
 * @param {function} done Callback
 */
var runJob = function(job,done){
  job.logger.info('Starting to process job')
  async.series(
    [
      //check to see if this job was already processed in the past
      function(next){
        jobCacheCheck(job,next,done)
      },
      //step 2: obtain resources
      function(next){
        job.update({
          status: 'resource',
          message: 'Obtaining resources',
          steps: {
            complete: 0,
            total: 3
          }
        },true)
        job.obtainResources(next)
      },
      //now that we have resources check the cache again
      function(next){
        jobCacheCheck(job,next,done)
      },
      //step 3: execute encoding operations
      function(next){
        job.update({
          status: 'encode',
          message: 'Executing encoding jobs',
          steps: {
            complete: 1,
            total: 3
          },
          frames: {
            complete: 0,
            total: 1
          }
        },true)
        job.encode(next)
      },
      //step 4: save any resources after processing has finished
      function(next){
        job.update({
          status: 'saving',
          message: 'Saving resources',
          steps: {
            complete: 2,
            total: 3
          },
          frames: {
            complete: 0,
            total: 1
          }
        },true)
        job.save(function(err,result){
          if(err) return next(err)
          job.update({
            resources: result
          },true)
          next()
        })
      },
      //step 5: save the build to cache
      function(next){
        job.cacheStore(function(err){
          if(err) job.logger.info('Cache store failed: ' + err)
          next()
        })
      }
    ],
    function(err){
      //cleanup the resources here since we dont it need any more
      job.resource.cleanup()
      if(err){
        job.update({
          status: 'error',
          message: err
        },true)
        return done()
      }
      job.update({
        status: 'complete',
        message: 'Processing complete',
        steps: {
          complete: 3,
          total: 3
        }
      },true)
      done()
    }
  )
}


/**
 * The job queue
 */
var q = async.queue(
  function(opts,done){
    if('undefined' === typeof opts.handle || null === opts.handle || !opts.handle)
      done('ERROR: Job.handle not set')
    //setup our job maintainer
    var job = new Job(opts.handle,opts.description)
    runJob(job,function(err){
      if(err) job.logger.error('Job processing failed: ' + err)
      else job.logger.info('Job processing successful')
      done()
    })
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
      handle: shortId.generate().toUpperCase(),
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
