'use strict';
var async = require('async')

var Job = require('./helpers/job')
var logger = require('../helpers/logger').create('shredder:worker')

//inform that we are alive
logger.info('Spawned and waiting for job description')


/**
 * Set the process title
 * @type {string}
 */
process.title = 'oose:shredder:worker'


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
    },true,done)
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
        },true,done)
      }
      job.update({
        status: 'complete',
        message: 'Processing complete',
        steps: {
          complete: 3,
          total: 3
        }
      },true,done)
    }
  )
}

//receive one message from master which should be the job description
process.once('message',function(m){
  if(!m.options){
    logger.error('Received invalid message from master, exiting',m)
    process.exit(1)
    return
  }
  var opts = m.options
  logger.info('Received description from master for job ' + opts.handle)
  //adjust the process title
  process.title = 'OOSE: shredder ' + opts.handle
  //setup our job maintainer
  logger.info('Starting to process job ' + opts.handle)
  var job = new Job(opts.handle,opts.description)
  runJob(job,function(err){
    if(err){
      job.logger.error('Job processing failed: ' + err)
      //tell the master we failed
      process.exit(1)
    } else {
      job.logger.info('Job processing successful')
      //tell the master we finished successfully
      process.exit(0)
    }
  })
})
