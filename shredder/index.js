'use strict';
var fs = require('fs')
var ObjectManage = require('object-manage')
//var util = require('util')
var path = require('path')
//var net = require('net')
//var redis = require('../helpers/redis')
var config = require('../config')
var async = require('async')
var Logger = require('../helpers/logger')
//var crypto = require('crypto')
//var ffmpeg = require('fluent-ffmpeg')
//var temp = require('temp')
var mkdirp = require('mkdirp')
//var Sniffer = require('../helpers/Sniffer')
var restler = require('restler')
var shortId = require('shortid')
var mesh = require('../mesh')
var drivers = require('./drivers')
var Resource = require('./helpers/resource')
var commUtil = require('../helpers/communicator').util
//var testing = !!config.get('shredder.testing')
var logger = Logger.create('shredder')
var running = false


/**
 * Load a profile if there is one
 * @param {object} input
 * @return {ObjectManage}
 */
var loadProfile = function(input){
  //setup a new object manage
  var obj = new ObjectManage()
  //load our input
  obj.load(input)
  //if there is not a profile we are done
  if(!input.profile) return obj
  //figure out profile location
  var file = path.resolve('../profiles/' + input.profile + '.json')
  if(!fs.existsSync(file)) return obj
  //since we have an existing profile lets grab it
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
 * Call prism for nextPeer
 * @param {function} done Callback
 *
var nextPeer = function(done){
  redis.hgetall('peer:next',function(err,peer){
    if('undefined' === typeof peer || null === peer){
      err = 'Could not obtain a peer from redis'
    }
    if(!err){
      peer.host = peer.hostname + '.' + peer.domain
      done(null,peer)
    } else done(err)
  })
}
*/


/**
 * Get source file into a local temp file
 * @param {object} job Job description
 * @param {function} done Callback
 *
var getSource = function(job,done){
  //setup temp folder
  var tmpDir = config.get('shredder.root') + '/tmp'
  if(!fs.existsSync(tmpDir)) mkdirp.sync(tmpDir)
  restler.get(job.source.url).on('complete',function(result){
    if(result instanceof Error) return done(result)
    var tempfile = temp.path({dir: tmpDir})
    fs.writeFile(tempfile,result,function(err){
      if(!err){
        done(null,tempfile)
      } else done(err)
    })
  })
}
*/


/**
 * Get source video metadata (info)
 * @param {string} path Full path of file to process
 * @param {function} done Callback
 *
var getVideoInfo = function(path,done){
  var ffmeta = ffmpeg.Metadata
  ffmeta(path,function(metadata,err){
    if(!err){
      done(null,metadata)
    } else done(err)
  })
}
*/


/**
 * Process video
 * @param {string} path Full path of file to process
 * @param {function} done Callback
 *
var processVideo = function(path,done){
  var infs = fs.createReadStream(path)
  infs.on('error',done) // calls as done(err) so skipped the closure - FIXME ?
  var ffproc = new ffmpeg({source:infs,nolog:true})
  ffproc.on('error',done) // calls as done(err) so skipped the closure - FIXME ?
//  ffproc.withSize('?x360')
  ffproc.addOption('-preset','medium')
  ffproc.withVideoCodec('libx264')
  ffproc.withVideoBitrate('200k')
  ffproc.addOption('-crf',23)
  ffproc.withAudioCodec('libfaac')
  ffproc.withAudioChannels(2)
  ffproc.withAudioBitrate('128k')
  ffproc.toFormat('mp4')
  ffproc.addOption('-movflags','+faststart')
  done(null,ffproc)
}
*/


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
        async.each(
          description.get('resource'),
          function(item,next){
            item = loadProfile(item)
            //set the default driver if we dont already have it
            if(!item.exists('driver')) item.set('driver','http')
            //check to see if the driver exists
            if(!drivers[item.get('driver')]) return next('Driver ' + item.get('driver') + ' doesnt exist')
            //run the driver
            drivers[item.driver].run(logger,resource,item,next)
          },
          next
        )
      },
      //step 2: execute encoding operations
      function(next){
        //if there are no encoding operation just continue
        if(!description.exists('encoding') || !description.get('encoding').length) return next()
        async.eachSeries(
          description.get('encoding'),
          function(items,next){
            //if item is not an array make it an array
            if(!(items instanceof Array)) items = [items]
            async.eachSeries(
              items,
              function(item,next){
                item = loadProfile(item)
                //make sure a driver was supplied
                if(!item.exists('driver')) return next('No driver defined: ' + JSON.stringify(item.data))
                //make sure the driver exists
                if(!drivers[item.get('driver')]) return next('Driver: ' + item.get('driver') + ' doesnt exist')
                //run the driver
                drivers[item.get('driver')].run(logger,resource,item,next)
              },
              next
            )
          },
          next
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
  /*
  async.series(
    [
      //grab the source file
      function(next){
        getSource(job,function(err,result){
          if(!err){
            job.source.tempfile = result
            next()
          } else next(err)
        })
      },
      //check to see if this is a video file and if so obtain metadata (info)
      function(next){
        if(!config.get('shredder.transcode.videos.enabled')) return next()
        getVideoInfo(job.source.tempfile,function(err,result){
          if(!err){
            job.source.videoInfo = result
            logger.info('videoInfo:' + util.inspect(job.source.videoInfo))
            next()
          } else next(err)
        })
      },
      //figure out our peer
      function(next){
        logger.info('Checking nextPeer')
        nextPeer(function(err,result){
          if(!err){
            job.output.peer = result
            next()
          } else next(err)
        })
      },
      //connect to the peer
      function(next){
        var peer = job.output.peer
        logger.info('Connecting to destination store @ ' + peer.ip + ':' + peer.portImport)
        store = net.connect(peer.portImport,peer.ip)
        store.on('error',next)
        store.on('connect',next)
      },
      //set up our processing chain
      function(next){
        processVideo(job.source.tempfile,function(err,result){
          if(!err){
            ffProcess = result
            next()
          } else next(err)
        })
      },
      //send file to peer
      function(next){
        var readable
        var shasum = crypto.createHash('sha1')
        var sniff = new Sniffer()
        sniff.on('data',function(data){
          shasum.update(data)
        })
        sniff.on('end',function(){
          job.output.videoSha1 = shasum.digest('hex')
        })
        store.on('end',next)
        if(!ffProcess){
          readable = fs.createReadStream(path)
          readable.on('error',next)
          readable.pipe(sniff).pipe(store)
        } else {
          var tmpPath = job.output.tempfile
          ffProcess.on('end',function(){
            //rail through mp4box
            gpac.hint(tmpPath,function(err){
              if(!err){
                readable = fs.createReadStream(tmpPath)
                readable.on('error',function(err){
                  fs.unlinkSync(tmpPath)
                  next(err)
                })
                readable.on('end',function(){
                  fs.unlinkSync(tmpPath)
                })
                readable.pipe(sniff).pipe(store)
              } else next(err)
            })
          })
          ffProcess.saveToFile(tmpPath)
        }
      },
      //remove the original file
      function(next){
        if(!testing){
          fs.unlink(path,next)
        } else next()
      }
    ],
    function(err){
      if(!err){
        done(null,job)
      } else done(err)
    }
  )
  */
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
        job.logger.error('Import failed: ' + err)
      } else {
        job.logger.info('Import successful')
        jobComplete(job)
      }
      done()
    })
  },
  config.get('shredder.concurrency') || 1
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
      job.source.sha1,
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
