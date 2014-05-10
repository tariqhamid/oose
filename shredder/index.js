'use strict';
var fs = require('fs')
  , util = require('util')
  , path = require('path')
  , net = require('net')
  , redis = require('../helpers/redis')
  , config = require('../config')
  , async = require('async')
  , logger = require('../helpers/logger').create('shredder')
  , crypto = require('crypto')
  , ffmpeg = require('fluent-ffmpeg')
  , temp = require('temp')
  , mkdirp = require('mkdirp')
  , gpac = require('./plugins/gpac')
  , Sniffer = require('../helpers/Sniffer')
  , restler = require('restler')
  , shortId = require('shortid')
  , mesh = require('../mesh')
var EventEmitter = require('events').EventEmitter
var commUtil = require('../helpers/communicator').util



/**
 * Shredder constructor
 * @constructor
 */
var Shredder = function(){
  var self = this
  EventEmitter.call(self)
}
Shredder.prototype = Object.create(EventEmitter.prototype)


/**
 * Set up Mesh event listener
 * @param {function} done Callback
 */
Shredder.prototype.meshListen = function(done){
  var self = this
  // shred:job:push - queue entry acceptor
  mesh.tcp.on('shred:job:push',function(message,socket){
    //use an uppercase friendly character set
    shortId.characters('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    //build job description
    var job = {
      handle: shortId.generate(),
      logger: logger,
      source: {
        url: message.source,
        sha1: message.sha1,
        mimeType: message.mimeType,
        filename: message.filename
      },
      output: message.output,
      callback: message.callback
    }
    //jab job into local q
    logger.info('Job queued locally as ' + job.handle)
    self.q.push(job)
    //respond to the request with the assigned handle and queue position
    socket.end(commUtil.withLength(commUtil.build(
      job.source.sha1,
      {status: 'ok', handle: job.handle, position: self.q.length()}
    )))
  })
  done()
}


/**
 * Handle job completion callback
 * @param {object} job Job description
 */
Shredder.prototype.jobComplete = function(job){
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
 */
Shredder.prototype.nextPeer = function(done){
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


/**
 * Get source file into a local temp file
 * @param {object} job Job description
 * @param {function} done Callback
 */
Shredder.prototype.getSource = function(job,done){
  //setup temp folder
  var tmpDir = config.get('shredder.root') + '/tmp'
  if(!fs.existsSync(tmpDir)) mkdirp.sync(tmpDir)
  //
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


/**
 * Get source video metadata (info)
 * @param {string} path Full path of file to process
 * @param {function} done Callback
 */
Shredder.prototype.getVideoInfo = function(path,done){
  var ffmeta = ffmpeg.Metadata
  ffmeta(path,function(metadata,err){
    if(!err){
      done(null,metadata)
    } else done(err)
  })
}


/**
 * Process video
 * @param {string} path Full path of file to process
 * @param {function} done Callback
 */
Shredder.prototype.processVideo = function(path,done){
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


/**
 * Run a job
 * @param {object} job Job structure
 * @param {function} done Callback
 */
Shredder.prototype.runJob = function(job,done){
  var self = this
  var store, ffProcess
  // replace the global logger with the job-specific one
  var logger = job.logger // NOTE - SCOPE SMASHING HERE

  logger.info('Starting')
  async.series(
    [
      //grab the source file
      function(next){
        self.getSource(job,function(err,result){
          if(!err){
            job.source.tempfile = result
            next()
          } else next(err)
        })
      },
      //check to see if this is a video file and if so obtain metadata (info)
      function(next){
        if(!config.get('shredder.transcode.videos.enabled')) return next()
        self.getVideoInfo(job.source.tempfile,function(err,result){
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
        self.nextPeer(function(err,result){
          if(!err){
            job.output.peer = result
            next()
          } else next(err)
        })
      },
      //connect to the peer
      function(next){
        var peer = job.output.peer
        logger.info('Connecting to destination store @ ' + peer.host + ':' + peer.port)
        store = net.connect(peer.port,peer.host)
        store.on('error',next)
        store.on('connect',next)
      },
      //set up our processing chain
      function(next){
        self.processVideo(job.source.tempfile,function(err,result){
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
        if(!self.testing){
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
}


/**
 * Start shredder (but not necessarily the Shredder-queue)
 * @param {function} done
 * @return {*}
 */
Shredder.prototype.start = function(done){
  var self = this
  //load profile
  if(config.get('shredder.profile')){
    self.profile = path.resolve(config.get('shredder.profile'))
    if(!fs.existsSync(self.profile))
      return done(new Error('Configuration profile not found'))
    config.load(require(self.profile))
  }
  //check for testing
  self.testing = !!config.get('shredder.testing')
  //check if root exists
  if(!config.get('shredder.root'))
    config.set('shredder.root',path.resolve(config.get('root')))
  //make sure the root folder exists
  if(!fs.existsSync(config.get('shredder.root')))
    mkdirp.sync(config.get('shredder.root'))
  if(!fs.existsSync(config.get('shredder.root')))
    return done(new Error('Root folder [' + path.resolve(config.get('shredder.root')) + '] does not exist'))
  //set up the local queue
  self.q = async.queue(
    function(job,done){
      if('undefined' === typeof job.handle || null === job.handle || !job.handle)
        done('ERROR: Job.handle not set')
      //now that the job is running, overload the main logger for this scope
      var logger = require('../helpers/logger').create('shredder:job:'+job.handle)
      job.logger = logger
      self.runJob(job,function(err){
        if(err){
          logger.error('Import failed: ' + err)
        } else {
          logger.info('Import successful')
          self.jobComplete(job)
        }
        done()
      })
    },
      config.get('shredder.concurrency') || 1
  )
  //startup otherwise complete, listen on mesh
  self.meshListen(done)
}


/**
 * Stop processing
 * @param {function} done
 */
Shredder.prototype.stop = function(done){
  done()
}


/**
 * Export shredder instance
 * @type {Mesh}
 */
module.exports = new Shredder()
