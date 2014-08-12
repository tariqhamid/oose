'use strict';
var fs = require('fs')
var os = require('os')
var path = require('path')
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
        job.cacheCheck(function(err,result){
          if(err) return next(err)
          if(!result) return next()
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
          })
          done()
        })
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
        })
        job.obtainResources(next)
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
        })
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
        })
        job.save(function(err,result){
          if(err) return next(err)
          job.update({
            resources: result
          })
          next()
        })
      },
      //step 5: save the build to cache
      function(next){
        job.cacheStore(next)
      }
    ],
    function(err){
      if(err){
        job.update({
          status: 'error',
          message: err
        })
        return done()
      }
      job.update({
        status: 'complete',
        message: 'Processing complete',
        steps: {
          complete: 3,
          total: 3
        }
      })
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
  config.get('shredder.concurrency') || os.cpus().length || 1
)


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
    //jab job into local q
    logger.info('Job queued locally as ' + job.handle)
    q.push(job)
    //respond to the request with the assigned handle and queue position
    socket.end(commUtil.withLength(commUtil.build(
      job.handle,
      {status: 'ok', handle: job.handle, position: q.length()}
    )))
  })
  logger.info('Listening for shredder jobs')
  done()
}


/**
 * Stop mesh listening
 * @param {function} done
 */
var meshStop = function(done){
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
        if(!config.get('shredder.root'))
          config.set('shredder.root',path.resolve(config.get('root')))
        //make sure the root folder exists
        if(!fs.existsSync(config.get('shredder.root')))
          mkdirp.sync(config.get('shredder.root'))
        if(!fs.existsSync(config.get('shredder.root')))
          return next('Root folder [' + path.resolve(config.get('shredder.root')) + '] does not exist')
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
