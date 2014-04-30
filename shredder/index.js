'use strict';
var readdirp = require('readdirp')
  , fs = require('fs')
  , path = require('path')
  , net = require('net')
  , restler = require('restler')
  , config = require('../config')
  , async = require('async')
  , log = require('winston')
  , crypto = require('crypto')
  , ffmpeg = require('fluent-ffmpeg')
  , Transcoder = require('stream-transcoder')
  , mmm = require('mmmagic')
  , temp = require('temp')
  , mkdirp = require('mkdirp')
  , gpac = require('./plugins/gpac')
  , url = require('../helpers/url')
  , PassThrough = require('stream').PassThrough
  , EventEmitter = require('events').EventEmitter

var Sniffer = function(){
  PassThrough.call(this)
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
  var vid = new Transcoder(fs.createReadStream(path))
  //  vid.maxSize(1280,720)
  vid.videoCodec('h264')
  vid.videoBitrate(512 * 1024)
  vid.audioCodec('libfaac')
  vid.audioBitrate(128 * 1024)
  vid.custom('crf','23')
  vid.custom('preset','medium')
  vid.custom('movflags','+faststart')
  vid.format('mp4')
  done(null,vid)
}


/**
 * Import a file
 * @param {string} path Full path to file
 * @param {function} done Callback
 */
Shredder.prototype.importFile = function(path,done){
  var self = this
  var peer, client, sum, mimeType, transcode
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
          transcode = result
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
        if(!transcode){
          readable = fs.createReadStream(path)
          readable.on('error',next)
          readable.pipe(sniff).pipe(client)
        } else {
          //setup temp folder
          var tmpDir = config.get('shredder.root') + '/tmp'
          if(!fs.existsSync(tmpDir)) mkdirp.sync(tmpDir)
          var tmpPath = temp.path({dir: tmpDir})
          transcode.on('finish',function(){
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
          transcode.writeToFile(tmpPath)
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
    config.set('shredder.root',config.get('root'))
  if(!fs.existsSync(config.get('shredder.root')))
    return done(new Error('Root folder does not exist'))

  self.q = async.queue(
    function(task,done){
      var path = task.path
      log.info('Starting to import ' + path)
      importFile(path,function(err,sha1){
        if(err) log.error('Failed to import ' + path + ': ' + err)
        else log.info('Import successful for ' + path + ' sha1 sum [' + sha1 + ']')
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
      setTimeout(self.run,1000)
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
  //this looks excessive but its the only way to maintain the scope of the close functions
  async.series([
    function(next){next()},
  ],function(err){
    if(err) logger.error('Shredder failed to stop: ' + err)
  })
  done()
}


/**
 * Export shredder instance
 * @type {Mesh}
 */
module.exports = new Shredder()
