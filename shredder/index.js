'use strict';
var readdirp = require('readdirp')
  , fs = require('fs')
  , path = require('path')
  , net = require('net')
  , restler = require('restler')
  , config = require('../config')
  , async = require('async')
  , logger = require('../helpers/logger')
  , crypto = require('crypto')
  , ffmpeg = require('fluent-ffmpeg')
  , mmm = require('mmmagic')
  , temp = require('temp')
  , mkdirp = require('mkdirp')
  , gpac = require('./plugins/gpac')
  , url = require('../helpers/url')
  , EventEmitter = require('events').EventEmitter

var PassThrough = require('stream').PassThrough
var Sniffer = function(){
  PassThrough.call(this)
  this.timeout = null
}
Sniffer.prototype = Object.create(PassThrough.prototype)



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
 * Call prism for nextPeer
 * @param {function} done Callback
 */
Shredder.prototype.nextPeer = function(done){
  restler.get(url.prism('peerNext')).on('complete',function(res){
    if(res instanceof Error) return done(res)
    done(null,res.peer)
  })
}


/**
 * Process video
 * @param {string} path Full path of file to process
 * @param {string} mimeType MIME type of file
 * @param {function} done Callback
 */
Shredder.prototype.processVideo = function(path,mimeType,done){
  var ffmeta = ffmpeg.Metadata
  ffmeta(path,function(metadata,err){
    if(!err){
      var infs = fs.createReadStream(path)
      infs.on('error',done) // calls as done(err) so skipped the closure - FIXME ?
      var ffproc = new ffmpeg({source:infs,nolog:true})
      ffproc.on('error',done) // calls as done(err) so skipped the closure - FIXME ?
      //  vid.maxSize(1280,720)
      ffproc.addOption('-preset','medium')
      ffproc.withVideoCodec('libx264')
      ffproc.withVideoBitrate('512k')
      ffproc.addOption('-crf',23)
      ffproc.withAudioCodec('libfaac')
      ffproc.withAudioChannels(2)
      ffproc.withAudioBitrate('128k')
      ffproc.toFormat('mp4')
      ffproc.addOption('-movflags','+faststart')
      done(null,ffproc)
    } else done(err)
  })
}


/**
 * Import a file
 * @param {string} path Full path to file
 * @param {function} done Callback
 */
Shredder.prototype.importFile = function(path,done){
  var self = this
  var peer, client, sum, mimeType, ffProcess
  async.series(
    [
      //figure out our peer
      function(next){
        self.nextPeer(function(err,result){
          if(err) return next(err)
          peer = result
          next()
        })
      },
      //connect to the peer
      function(next){
        client = net.connect(peer.port,peer.host)
        client.on('error',next)
        client.on('connect',next)
      },
      //figure out the mime type
      function(next){
        var magic = new mmm.Magic(mmm.MAGIC_MIME_TYPE)
        magic.detectFile(path,function(err,result){
          if(err) return next(err)
          mimeType = result
          next()
        })
      },
      //check to see if this is a video file and if so process it
      function(next){
        if(!config.get('shredder.transcode.videos.enabled')) return next()
        if(!mimeType.match(/^video/)) return next()
        self.processVideo(path,mimeType,function(err,result){
          if(err) return next(err)
          ffProcess = result
          next()
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
              if(err) return next(err)
              readable = fs.createReadStream(tmpPath)
              readable.on('error',function(err){
                fs.unlinkSync(tmpPath)
                next(err)
              })
              readable.on('end',function(){
                fs.unlinkSync(tmpPath)
              })
              readable.pipe(sniff).pipe(client)
            })
          })
          ffProcess.saveToFile(tmpPath)
        }
      },
      //remove the original file
      function(next){
        if(self.testing) return next()
        fs.unlink(path,next)
      }
    ],
    function(err){
      if(err) return done(err)
      done(null,sum)
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

  self.run = function(){
    var stream = readdirp({root: config.get('shredder.root'), directoryFilter: ['!tmp']})
    stream.on('data',function(entry){
      self.q.push({path: entry.fullPath})
    })
    stream.on('end',function(){
      self.timeout = setTimeout(self.run,1000)
    })
  }
  self.run()
  done()
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
