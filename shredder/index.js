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
    logger.info(
      'Worker for job ' + opts.handle + ' has finished and exited without error'
    )
    done()
  })
  //start the worker by sending it options
  worker.send({options: opts})
}


/**
 * The job queue
 */
var q = async.priorityQueue(
  function(opts,done){
    if(
      'undefined' === typeof opts.handle ||
      null === opts.handle ||
      !opts.handle
    ){
      done('ERROR: Job.handle not set')
    }
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
      q.push(job,job.priority || 10)
    }
  })
}


/**
 * Process an incoming job
 * @param {object} message
 * @param {Socket} socket
 */
var newJob = function(message,socket){
  //build job description
  var job = {
    handle: shortId.generate(),
    priority: 10,
    description: message.description
  }
  //parse the description
  var description = JSON.parse(message.description)
  //check to see if there is a priority override
  if(description.priority) job.priority = description.priority
  //check to see if the job has been scheduled and defer it if so
  if(
    description.schedule &&
    description.schedule.start &&
    'now' !== description.schedule.start
  ){
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
    logger.info(
      'Job queued locally as ' + job.handle +
      ' with a priority of ' + job.priority
    )
    q.push(job,job.priority || 10)
  } else {
    logger.info(
      'Job deferred locally as ' + job.handle +
      ' with a priority of ' + job.priority
    )
  }
  //respond to the request with the assigned handle and queue position
  socket.end(commUtil.withLength(commUtil.build(
    job.handle,
    {status: 'ok', handle: job.handle, position: q.length()}
  )))
}


/**
 * Set up and listen
 * @param {function} done Callback
 */
var meshStart = function(done){
  // shred:job:push - queue entry acceptor
  mesh.tcp.on('shred:job:push',function(message,socket){
    newJob(message,socket)
  })
  logger.info('Listening for new shredder jobs')
  //check and see if there is a snapshot if so load it
  done()
}


/**
 * Stop mesh listening
 * @param {function} done
 * @return {*}
 */
var meshStop = function(done){
  mesh.tcp.removeAllListeners('shred:job:push')
  done()
}


/**
 * Shutdown shredder
 * @param {function} done
 * @return {*}
 */
var shutdown = function(done){
  //if nothing is happening just exit
  if(0 === deferred.length && q.idle()){
    logger.info('Nothing processing, exiting')
    return done()
  }
  async.series(
    [
      //since there is something happening start shutting everything down and saving
      function(next){
        logger.info(
          'Pausing queue to prevent further jobs from being started'
        )
        q.pause()
        next()
      },
      //shutdown all the remaining workers
      function(next){
        //now wait so we can exit
        logger.info('Waiting for current jobs to finish processing')
        var interval
        var i = 0
        var waitForWorkers = function(){
          var running = q.running()
          //still waiting
          if(running > 0){
            i++
            if(i % 10 === 0)
              logger.info(
                'Still waiting for ' + running + ' worker(s) to exit...'
              )
            return
          }
          //finish exiting
          clearInterval(interval)
          next()
        }
        interval = setInterval(waitForWorkers,1000)
      },
      //now that the workers are dead stop listening for new jobs
      //  (any that we received in the meantime will be stored)
      function(next){
        logger.info('Ceasing to listen for new jobs')
        meshStop(next)
      },
      //setup and write our snapshot of remaining items in the q
      function(next){
        var snapshot = {tasks: q.tasks, deferred: deferred}
        //dont write a snapshot if there is nothing queued
        if(snapshot.tasks.length === 0 && snapshot.deferred.length === 0)
          return next()
        logger.info(
          'Writing the current queue of jobs to: ' + config.shredder.snapshot
        )
        if(fs.existsSync(config.shredder.snapshot))
          fs.unlinkSync(config.shredder.snapshot)
        fs.writeFileSync(config.shredder.snapshot,JSON.stringify(snapshot))
        logger.info('Snapshot written successfully')
        next()
      }
    ],
    done
  )
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
      //check to see if there is a snapshot to restore
      function(next){
        if(!fs.existsSync(config.shredder.snapshot)) return next()
        logger.info('Found shredder snapshot... restoring')
        var snapshot = JSON.parse(fs.readFileSync(config.shredder.snapshot))
        //repopulate deferred
        snapshot.deferred.forEach(function(task){
          deferred.push(task)
        })
        //push tasks into q
        snapshot.tasks.forEach(function(task){
          q.push(task.data,task.data.priority || 10)
        })
        fs.unlinkSync(config.shredder.snapshot)
        logger.info('Finished restoring jobs')
        next()
      },
      //setup for deferred scheduling
      function(next){
        //start trying to schedule the deferred jobs
        deferredInterval = setInterval(scheduleDeferred,15000)
        next()
      },
      //start listening for new jobs from mesh
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
    logger.info('Starting to shutdown shredder')
    async.series(
      [
        //stop scheduling any deferred jobs
        function(next){
          logger.info('Stopping scheduling of any deferred jobs')
          if(deferredInterval) clearInterval(deferredInterval)
          next()
        },
        //check for running jobs and store a snapshot if we have to
        function(next){
          logger.info('Shutting down and saving state if necessary')
          shutdown(next)
        }
      ],
      function(err){
        logger.info('Shredder shutdown complete')
        done(err)
      }
    )
  }
}
