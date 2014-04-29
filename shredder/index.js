'use strict';
var readdirp = require('readdirp')
  , fs = require('fs')
  , path = require('path')
  , net = require('net')
  , restler = require('restler')
  , config = require(__dirname + '/config')
  , async = require('async')
  , log = require('winston')
  , crypto = require('crypto')
  , os = require('os')
  , Transcoder = require('stream-transcoder')
  , mmm = require('mmmagic')
  , PassThrough = require('stream').PassThrough
  , temp = require('temp')
  , mkdirp = require('mkdirp')
  , MP4Box = require(__dirname + '/helpers/MP4Box')

//check for testing
var testing = false
if('test' === process.argv[3]) testing = true

//load profile
var profile = path.resolve(process.argv[2])
if(!fs.existsSync(profile))
  throw new Error('Configuration profile not found')
config.load(require(profile))

//check if root exists ..l..
if(!fs.existsSync(config.get('root')))
  throw new Error('Root folder doesnt exist')

var prismUrl = function(command){
  return 'http://' + config.get('prism.host') + ':' + config.get('prism.port') + '/api/' + command
}

var nextPeer = function(done){
  restler.get(prismUrl('peerNext')).on('complete',function(res){
    if(res instanceof Error) return done(res)
    done(null,res.peer)
  })
}

var processVideo = function(path,mimeType,done){
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

var Sniffer = function(){
  PassThrough.call(this)
}
Sniffer.prototype = Object.create(PassThrough.prototype)

var importFile = function(path,done){
  var peer, client, sum, mimeType, fileMetadata, transcode
  async.series(
    [
      //figure out our peer
      function(next){
        nextPeer(function(err,result){
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
        if(!config.get('transcode.videos.enabled')) return next()
        if(!mimeType.match(/^video/)) return next()
        processVideo(path,mimeType,function(err,result){
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
          var tmpDir = config.get('root') + '/tmp'
          if(!fs.existsSync(tmpDir)) mkdirp.sync(tmpDir)
          var tmpPath = temp.path({dir: tmpDir})
          transcode.on('finish',function(){
            //rail through mp4box
            MP4Box.hint(tmpPath,function(err){
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
        if(testing) return next()
        fs.unlink(path,next)
      }
    ],
    function(err){
      if(err) return done(err)
      done(null,sum)
    }
  )
}

var q = async.queue(
  function(task,done){
    var path = task.path
    log.info('Starting to import ' + path)
    importFile(path,function(err,sha1){
      if(err) log.error('Failed to import ' + path + ': ' + err)
      else log.info('Import successful for ' + path + ' sha1 sum [' + sha1 + ']')
      done() 
    })
  },
  config.get('concurrency') || 1
)

var run = function(){
  var stream = readdirp({root: config.get('root'), directoryFilter: ['!tmp']})
  stream.on('data',function(entry){
    q.push({path: entry.fullPath})
  })
  stream.on('end',function(){
    setTimeout(run,1000)
  })
}
run()
