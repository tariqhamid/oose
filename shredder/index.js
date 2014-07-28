'use strict';
var fs = require('fs')
var os = require('os')
var ObjectManage = require('object-manage')
var path = require('path')
var config = require('../config')
var async = require('async')
var Logger = require('../helpers/logger')
var mkdirp = require('mkdirp')
var restler = require('restler')
var shortId = require('shortid')
var mesh = require('../mesh')
var drivers = require('./drivers')
var Resource = require('./helpers/resource')
var Parameter = require('./helpers/parameter')
var commUtil = require('../helpers/communicator').util
var logger = Logger.create('shredder')
var running = false


/**
 * Load a template if there is one
 * @param {object} input
 * @return {ObjectManage}
 */
var loadTemplate = function(input){
  //setup a new object manage
  var obj = new ObjectManage()
  //load our input
  obj.load(input)
  //if there is not a template we are done
  if(!input.template) return obj
  //figure out template location
  var file = path.resolve(__dirname + '/templates/' + input.template + '.json')
  if(!fs.existsSync(file)) return obj
  //since we have an existing template lets grab it
  obj.load(JSON.parse(fs.readFileSync(file)))
  //load our input over it again for overrides
  obj.load(input)
  return obj
}


/**
 * Handle job completion callback
 * @param {object} job Job description
 */
var jobComplete = function(job){
  var response = {
    handle: job.handle,
    status: 'complete',
    message: 'Job has completed successfully'
  }
  if(job.output.framesTotal) response.framesTotal = job.output.framesTotal
  if(job.output.framesComplete) response.framesComplete = job.output.framesComplete
  response.manifest = {}
  if(job.output.videoSha1) response.manifest.video = job.output.videoSha1
  if(job.output.imageSha1) response.manifest.image = job.output.imageSha1
  restler.post(job.callback,{data: response})
}


/**
 * Run a job
 * @param {object} job Job structure
 * @param {function} done Callback
 */
var runJob = function(job,done){
  //var store, ffProcess
  // replace the global logger with the job-specific one
  var logger = job.logger // NOTE - SCOPE SMASHING HERE
  //blow up job description from JSON
  var description = new ObjectManage()
  description.load(JSON.parse(job.description))
  logger.info('Starting to process job')
  //setup resource manager
  var resource = new Resource()
  async.series(
    [
      //step 1: obtain resources
      function(next){
        //make sure we have a resource section if not we cant do anything
        if(!description.exists('resource') || !description.get('resource').length)
          return next('No resources defined')
        logger.info('Starting to collect defined resources')
        async.each(
          description.get('resource'),
          function(item,next){
            item = loadTemplate(item)
            //load the parameters
            var param = new Parameter()
            if(item.exists('parameters')) param.load(item.get('parameters'))
            //set the default driver if we dont already have it
            if(!item.exists('driver')) item.set('driver','http')
            //check to see if the driver exists
            if(!drivers[item.get('driver')]) return next('Driver ' + item.get('driver') + ' doesnt exist')
            //run the driver
            drivers[item.get('driver')].run(logger,resource,param,item,next)
          },
          function(err){
            if(err) return next(err)
            logger.info('Resource collection finished')
            next()
          }
        )
      },
      //step 2: execute encoding operations
      function(next){
        //if there are no encoding operation just continue
        if(!description.exists('encoding') || !description.get('encoding').length) return next()
        logger.info('Starting to execute encoding jobs')
        async.eachSeries(
          description.get('encoding'),
          function(item,next){
            item = loadTemplate(item)
            //load the parameters
            var param = new Parameter()
            if(item.exists('parameters')) param.load(item.get('parameters'))
            async.eachSeries(
              item.get('jobs'),
              function(item,next){
                //make sure a driver was supplied
                if(!item.driver) return next('No driver defined: ' + JSON.stringify(item))
                //make sure the driver exists
                if(!drivers[item.driver]) return next('Driver: ' + item.driver + ' doesnt exist')
                //run the driver
                drivers[item.driver].run(logger,resource,param,item,next)
              },
              next
            )
          },
          function(err){
            if(err) return next(err)
            logger.info('Finished executing encoding jobs')
            next()
          }
        )
      },
      //step 3: save any resources after processing has finished
      function(next){
        //if there is no save section defined, warn and move on
        if(!description.exists('save') || !description.get('save').length){
          logger.warning('No resources will be saved')
          return next()
        }
        //save the resources
        resource.save(description.get('save'),next)
      }
    ],
    done
  )
}


/**
 * The job queue
 */
var q = async.queue(
  function(job,done){
    if('undefined' === typeof job.handle || null === job.handle || !job.handle)
      done('ERROR: Job.handle not set')
    //now that the job is running, overload the main logger for this scope
    job.logger = Logger.create('shredder:job:'+job.handle)
    runJob(job,function(err){
      if(err){
        job.logger.error('Job processing failed: ' + err)
      } else {
        job.logger.info('Job processing successful')
        jobComplete(job)
      }
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
