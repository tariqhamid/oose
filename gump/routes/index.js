'use strict';
var async = require('async')
var crypto = require('crypto')
var debug = require('debug')('oose:gump')
var fs = require('graceful-fs')
var mkdirp = require('mkdirp')
var net = require('net')
var Path = require('path')
var promisePipe = require('promisepipe')
var Q = require('q')
var request = require('request')
var temp = require('temp')
var through2 = require('through2')

var Logger = require('../../helpers/logger')
var shortid = require('../../helpers/shortid')
var logger = Logger.create('gump')

var File = require('../../models/file').model
var Embed = require('../../models/embed').model

var config = require('../../config')
var duplicateNameExp = /\(\d+\)$/


/**
 * Embed
 * @type {exports}
 */
exports.embed = require('./embed')


/**
 * User
 * @type {exports}
 */
exports.user = require('./user')


/**
 * Homepage
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  var path = File.decode(req.query.path)
  if(!req.query.god || !req.session.user.admin)
    path.unshift(req.session.user._id)
  File
    .findChildren(path)
    .where('name',new RegExp(req.query.search || '.*','i'))
    .exec(function(err,results){
      if(err) return res.send(err.message)
      if(!req.query.god || !req.session.user.admin) path.shift()
      res.render('index',{
        path: path,
        pathEncoded: File.encode(path),
        files: results,
        god: req.query.god ? true : false,
        search: req.query.search
      })
    }
  )
}


/**
 * Process action for index
 * @param {object} req
 * @param {object} res
 */
exports.fileRemove = function(req,res){
  async.each(
    req.body.remove,
    function(item,next){
      File.findOne({_id: item},function(err,result){
        if(err) return next(err.message)
        if(!result) return next('Could not find item ' + item)
        result.remove(function(err){
          if(err) return next(err.message)
          next()
        })
      })
    },
    function(err){
      if(err){
        req.flash('error','Failed to remove item ' + err)
      } else {
        req.flash('success','Item(s) removed successfully')
      }
      res.redirect(
        '/?path=' + req.query.path + (req.query.god ? '&god=on' : '')
      )
    }
  )
}


/**
 * Upload a file
 * @param {object} req
 * @param {object} res
 */
exports.upload = function(req,res){
  var body = {}
  var promises = []
  //normalize path and deal with god mode
  var path = File.decode(req.query.path)
  if(!req.query.god || !req.session.user.admin)
    path.unshift(req.session.user._id)
  //setup temp folder
  if(!fs.existsSync(config.gump.tmpDir))
    mkdirp.sync(config.gump.tmpDir)
  //url creators
  var prismBaseUrl = function(){
    return 'http://' + (config.gump.prism.host || '127.0.0.1') +
      ':' + config.gump.prism.port || 3003
  }
  var gumpBaseUrl = function(){
    if(config.gump.baseUrl) return config.gump.baseUrl
    return 'http://' + (config.gump.host || '127.0.0.1') +
      ':' + (config.gump.port || 3004)
  }
  //import functions
  var sendToShredder = function(file,next){
    request(
      {
        url: prismBaseUrl() + '/api/shredderJob',
        method: 'post',
        json: {
          callback: [
            {
              driver: 'http',
              throttle: '250',
              url: gumpBaseUrl() + '/api/shredderUpdate'
            }
          ],
          resource: [
            {
              name: 'video',
              driver: 'http',
              sha1: file.sha1,
              url: gumpBaseUrl() + '/tmp/' + Path.basename(file.tmp)
            }
          ],
          encoding: [
            {
              template: 'preview'
            }
          ],
          save: ['preview','video']
        }
      },
      function(err,res,body){
        if(err) return next(err)
        if('ok' !== body.status) return next(body.message)
        if(!body.handle) return next('Shredder failed to return a job handle')
        file.importJob = body.handle
        next()
      }
    )
  }
  var sendToOose = function(file,next){
    debug(file.sha1,'starting to send to OOSE')
    var peerNext = {}
    async.series(
      [
        //ask for nextPeer
        function(next){
          var url = prismBaseUrl() + '/api/peerNext'
          debug(file.sha1,'sending request to prism for peerNext',url)
          request(url,function(err,res,body){
            if(err) return next(err)
            body = JSON.parse(body)
            if(!body.peers || !body.peers.length)
              return next('Next peer could not be found')
            peerNext = body.peers[0]
            debug(file.sha1,'resolved ' + peerNext.hostname + ' as winner')
            next()
          })
        },
        //send to import
        function(next){
          //setup readable to tmp file
          var readable = fs.createReadStream(file.tmp)
          //setup writable to oose peer
          var client = net.connect(+peerNext.portImport,peerNext.ip)
          promisePipe(readable,client).then(
            function(){
              debug(file.sha1,'successfully sent file to OOSE')
              next()
            },
            function(err){
              next('Failed in stream ' + err.source + ': ' + err.message)
            }
          )
        },
        //remove tmp file
        function(next){
          debug(file.sha1,'removing tmp file')
          fs.unlink(file.tmp,next)
        }
      ],
      next
    )
  }
  var processFile = function(file){
    debug(file.filename,'starting to process uploaded file')
    var writable = fs.createWriteStream(file.tmp)
    var shasum = crypto.createHash('sha1')
    var doc
    //setup a sniffer to capture the sha1 for integrity
    var sniff = through2(
      function(chunk,enc,next){
        try {
          file.size = file.size + chunk.length
          shasum.update(chunk)
          next(null,chunk)
        } catch(err){
          next(err)
        }
      }
    )
    //execute the pipe and save the file or error out the promise
    promisePipe(file.readable,sniff,writable).then(
      //successful pipe handling
      function(){
        file.sha1 = shasum.digest('hex')
        debug(
          file.filename,
          'successfully stored to tmp file with sha1',
          file.sha1
        )
        async.series(
          [
            //send to oose or shredder
            function(next){
              if(file.mimetype.match(/^(video|audio)\//i)){
                debug(file.sha1,'sending to shredder as its audio/video')
                sendToShredder(file,next)
              } else {
                debug(file.sha1,'sending directly to oose')
                sendToOose(file,next)
              }
            },
            //create parents
            function(next){
              debug(file.sha1,'ensuring parent folder exists in gump tree')
              File.mkdirp(Object.create(path),next)
            },
            //create doc
            function(next){
              var currentPath = path.slice(0)
              currentPath.push(file.filename)
              //lets figure out if the path is already taken
              var nameIterator = 0
              var pathCount = 0
              async.doUntil(
                function(next){
                  File.count(
                    {path: File.encode(currentPath)},
                    function(err,count){
                      if(err) return next(err)
                      pathCount = count
                      next()
                    }
                  )
                },
                function(){
                  if(0 === pathCount){
                    debug(file.sha1,'file name unused, using it')
                    return true
                  }
                  nameIterator++
                  debug(
                    file.sha1,
                    'file name used, incrementing new name',
                    nameIterator
                  )
                  currentPath.pop()
                  var ext = Path.extname(file.filename)
                  var basename = Path.basename(file.filename,ext)
                  if(basename.match(duplicateNameExp))
                    basename = basename.replace(
                      duplicateNameExp,'(' + nameIterator + ')'
                    )
                  else basename += ' (' + nameIterator + ')'
                  file.filename = basename + ext
                  currentPath.push(file.filename)
                  return false
                },
                function(err){
                  if(err) return next(err)
                  doc = new File()
                  doc.handle = file.importJob || shortid.generate()
                  doc.name = file.filename
                  doc.tmp = file.tmp
                  doc.sha1 = file.sha1
                  doc.size = file.size
                  doc.path = currentPath
                  doc.mimetype = file.mimetype
                  if(file.importJob){
                    doc.shredder.handle = file.importJob
                    doc.status = 'processing'
                  } else {
                    doc.status = 'ok'
                  }
                  next()
                }
              )
            },
            //save doc
            function(next){
              doc.save(function(err){
                if(err) return next(err.message)
                debug(file.sha1,'saved new gump entry')
                next()
              })
            }
          ],
          function(err){
            if(err) return file.promise.reject(err)
            debug(file.sha1,'releasing promise')
            file.promise.resolve()
          }
        )
      },
      //stream error handling
      function(err){
        file.promise.reject(
          'Failed in stream ' + err.source + ': ' + err.message)
      }
    )
  }
  //busboy handling
  req.pipe(req.busboy)
  req.busboy.on('field',function(key,value){
    body[key] = value
  })
  req.busboy.on('file',function(fieldname,readable,filename,encoding,mimetype){
    var promise = Q.defer()
    var file = {
      promise: promise,
      tmp: temp.path({dir: config.gump.tmpDir}),
      fieldname: fieldname,
      readable: readable,
      filename: filename,
      size: 0,
      encoding: encoding,
      mimetype: mimetype,
      sha1: '',
      importJob: ''
    }
    promises.push(promise)
    processFile(file)
  })
  req.busboy.on('finish',function(){
    Q.all(promises)
      .fail(function(err){
        res.json({
          status: 'error',
          code: 1,
          message: err
        })
      })
      .done(function(){
        res.json({
          status: 'ok',
          code: 0,
          message: 'Files uploaded successfully'
        })
      })
  })
}


/**
 * Create folder
 * @param {object} req
 * @param {object} res
 */
exports.folderCreate = function(req,res){
  var doc
  var path = File.decode(req.query.path)

  path.unshift(req.session.user._id)
  async.series(
    [
      //create parents
      function(next){
        File.mkdirp(path,next)
      },
      function(next){
        path.push(req.body.name)
        doc = new File()
        doc.name = req.body.name
        doc.path = path
        doc.folder = true
        doc.mimeType = 'folder'
        doc.status = 'ok'
        next()
      },
      function(next){
        doc.save(function(err){
          if(err) return next(err.message)
          next()
        })
      }
    ],
    function(err){
      if(err){
        req.flash('error','Failed to create folder ' + err)
      } else {
        req.flash('success','Folder created successfully')
      }
      res.redirect(
        '/?path=' + req.query.path + (req.query.god ? '&god=on' : '')
      )
    }
  )
}


/**
 * File details
 * @param {object} req
 * @param {object} res
 */
exports.file = function(req,res){
  var god = req.query.god ? true : false
  File.findOne({handle: req.query.handle},function(err,result){
    var prismHost = config.gump.prism.hostUrl
    if(result.status === 'error'){
      return res.render('fileError',{
        file: result,
        prismHost: prismHost,
        god: god
      })
    }
    if(result.status === 'processing'){
      return res.render('fileProcessing',{
        file: result,
        prismHost: prismHost,
        god: god
      })
    }
    if(result.status === 'ok' && result.embedHandle){
      return res.render('fileEmbed',{
        file: result,
        prismHost: prismHost,
        baseUrl: config.gump.embedBaseUrl,
        god: god
      })
    }
    res.render('fileDetails',{
      file: result,
      prismHost: prismHost,
      god: god
    })
  })
}


/**
 * Shredder update
 * @param {object} req
 * @param {object} res
 */
exports.shredderUpdate = function(req,res){
  var file
  async.series(
    [
      //find file by job
      function(next){
        File.findOne({'shredder.handle': req.body.handle},function(err,result){
          if(err) return next(err.message)
          if(!result) return next('could not find file by handle')
          file = result
          next()
        })
      },
      //update job status
      function(next){
        file.shredder.status = req.body.status
        file.shredder.message = req.body.message
        file.shredder.steps.complete = req.body.steps.complete
        file.shredder.steps.total = req.body.steps.total
        file.shredder.frames.complete = req.body.frames.complete
        file.shredder.frames.total = req.body.frames.total
        file.shredder.resources = req.body.resources
        next()
      },
      //handle complete status
      function(next){
        if('complete' !== file.shredder.status) return next()
        file.status = 'ok'
        async.series(
          [
            //remove tmp file
            function(next){
              if(fs.existsSync(file.tmp))
                fs.unlink(file.tmp,next)
              else next()
            },
            //create the embed object
            function(next){
              file.embedHandle = file.handle
              var doc = new Embed()
              doc.handle = file.handle
              doc.title = file.name
              doc.keywords = file.name.split(' ').join(',')
              doc.template = 'standard'
              if(file.shredder.resources.preview){
                doc.media.image.push({
                  offset: null,
                  sha1: file.shredder.resources.preview
                })
              }
              if(file.shredder.resources.video){
                doc.media.video.push({
                  quality: 'standard',
                  sha1: file.shredder.resources.video
                })
              }
              doc.save(function(err){
                if(err) return next(err.message)
                next()
              })
            }
          ],
          function(err){
            if(err) return next(err)
            next()
          }
        )

      },
      //handle error status
      function(next){
        if('error' !== file.shredder.status) return next()
        if(fs.existsSync(file.tmp))
          fs.unlink(file.tmp,next)
        else next()
      },
      //save job
      function(next){
        file.save(function(err){
          if(err) return next(err.message)
          next()
        })
      }
    ],
    function(err){
      if(err){
        logger.error('Job update failed: ' + err)
        return res.json({
          status: 'error',
          code: 1,
          message: err
        })
      }
      res.json({
        status: 'ok',
        code: 0
      })
    }
  )
}


/**
 * Download redirect
 * @param {object} req
 * @param {object} res
 */
exports.download = function(req,res){
  var file, url
  async.series(
    [
      //find the file
      function(next){
        File.findOne({handle: req.query.handle},function(err,result){
          if(err) return next()
          if(!result) return next('Could not find file')
          file = result
          next()
        })
      },
      //build the oose url
      function(next){
        url =
          'http://' + config.gump.prism.host + ':' + config.gump.prism.port +
          '/' + file.sha1 + '/' + file.name + '?download=true'
        next()
      }
    ],
    function(err){
      if(err){
        return res.json({
          status: 'error',
          code: 1,
          message: err
        })
      }
      res.redirect(302,url)
    }
  )
}
