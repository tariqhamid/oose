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
  , mmm = require('mmmagic')
  , temp = require('temp')
  , mkdirp = require('mkdirp')
  , gpac = require('./plugins/gpac')
  , Sniffer = require('../helpers/Sniffer')
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
    //jab job into local q
    var job = {
      handle: shortId.generate(),
      source: {
        url: message.source,
        sha1: message.sha1,
        mimeType: message.mimeType,
        filename: message.filename
      },
      output: message.output,
      callback: message.callback
    }
    self.q.push(job,self.jobComplete(job))
    socket.end(commUtil.withLength(commUtil.build(
      job.source.sha1,
      {status: 'ok', handle: job.handle, position: self.q.length()}
    )))
  })
  done()
}


/**
 * Handle the job callback(s)
 * @param {object} job Shredder job structure
 */
Shredder.prototype.jobComplete = function(job){
  //restler call the job.callback url
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
 * Process video
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
 * Import a file
 * @param {string} path Full path to file
 * @param {function} done Callback
 */
Shredder.prototype.importFile = function(path,done){
  var self = this
  var peer, client, sum, mimeType, videoInfo, ffProcess
  async.series(
    [
      //figure out our peer
      function(next){
        logger.info('Checking nextPeer')
        self.nextPeer(function(err,result){
          if(!err){
            peer = result
            next()
          } else next(err)
        })
      },
      //connect to the peer
      function(next){
        logger.info('Connecting nextPeer:',util.inspect(peer))
        client = net.connect(peer.port,peer.host)
        client.on('error',next)
        client.on('connect',next)
      },
      //figure out the mime type
      function(next){
        var magic = new mmm.Magic(mmm.MAGIC_MIME_TYPE)
        magic.detectFile(path,function(err,result){
          if(!err){
            mimeType = result
            next()
          } else next(err)
        })
      },
      //check to see if this is a video file and if so obtain metadata (info)
      function(next){
        if(!config.get('shredder.transcode.videos.enabled')) return next()
        if(!mimeType.match(/^video/))
          logger.warn('MIME type is not video/* (detected ' + mimeType + ')')
        self.getVideoInfo(path,function(err,result){
          if(!err){
            videoInfo = result
            logger.info('videoInfo:' + util.inspect(videoInfo))
            next()
          } else next(err)
        })
      },
      //process it
      function(next){
        self.processVideo(path,function(err,result){
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
          sum = shasum.digest('hex')
        })
        client.on('end',next)
        if(!ffProcess){
          readable = fs.createReadStream(path)
          readable.on('error',next)
          readable.pipe(sniff).pipe(client)
        } else {
          //setup temp folder
          var tmpDir = config.get('shredder.root') + '/tmp'
          if(!fs.existsSync(tmpDir)) mkdirp.sync(tmpDir)
          var tmpPath = temp.path({dir: tmpDir})
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
                readable.pipe(sniff).pipe(client)
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
        done(null,sum)
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
    config.set('shredder.root',path.resolve(__dirname + '/../_shredbox'))
  //make sure the root folder exists
  if(!fs.existsSync(config.get('shredder.root')))
    mkdirp.sync(config.get('shredder.root'))
  if(!fs.existsSync(config.get('shredder.root')))
    return done(new Error('Root folder [' + path.resolve(config.get('shredder.root')) + '] does not exist'))

  self.q = async.queue(
    function(task,done){
      var path = task.path
      logger.info('Starting to import ' + path)
      self.importFile(path,function(err,sha1){
        if(err) logger.error('Failed to import ' + path + ': ' + err)
        else logger.info('Import successful for ' + path + ' sha1 sum [' + sha1 + ']')
        done()
      })
    },
      config.get('shredder.concurrency') || 1
  )
  self.meshListen(done)
}


/**
 * Stop processing
 * @param {function} done
 */
Shredder.prototype.stop = function(done){
  var self = this
  clearTimeout(self.timeout)
  done()
}


/**
 * Export shredder instance
 * @type {Mesh}
 */
module.exports = new Shredder()
