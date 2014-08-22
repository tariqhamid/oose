'use strict';
var temp = require('temp')
  , config = require('../../config')
  , fs = require('graceful-fs')
  , mkdirp = require('mkdirp')
  , async = require('async')
  , net = require('net')
  , crypto = require('crypto')
  , request = require('request')
  , Path = require('path')
  , Sniffer = require('../../helpers/Sniffer')
  , Logger = require('../../helpers/logger')
  , Q = require('q')

var File = require('../../models/file').model
var Embed = require('../../models/embed').model
var logger = Logger.create('gump')


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
      res.redirect('/?path=' + req.query.path + (req.query.god ? '&god=on' : ''))
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
  if(!fs.existsSync(config.get('gump.tmpDir')))
    mkdirp.sync(config.get('gump.tmpDir'))
  //url creators
  var prismBaseUrl = function(){
    return 'http://' + (config.get('gump.prism.host') || '127.0.0.1') + ':' + config.get('gump.prism.port') || 3003
  }
  var gumpBaseUrl = function(){
    if(config.get('gump.baseUrl')) return config.get('gump.baseUrl')
    return 'http://' + (config.get('gump.host') || '127.0.0.1') + ':' + (config.get('gump.port') || 3004)
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
              template: 'mp4-standard-480p'
            }
          ],
          save: ['mp4-standard-480p-preview','mp4-standard-480p']
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
  var sendToOOSE = function(file,next){
    var peerNext = {}
    async.series(
      [
        //ask for nextPeer
        function(next){
          var url = prismBaseUrl() + '/api/peerNext'
          request(url,function(err,res,body){
            if(err) return next(err)
            body = JSON.parse(body)
            if(!body.peers || !body.peers.length) return next('Next peer could not be found')
            peerNext = body.peers[0]
            next()
          })
        },
        //send to import
        function(next){
          var client = net.connect(peerNext.portImport,peerNext.ip)
          client.on('error',function(err){
            next(err)
          })
          client.on('connect',function(){
            var rs = fs.createReadStream(file.tmp)
            rs.pipe(client)
            client.on('end',function(){
              next()
            })
          })
        },
        //remove tmp file
        function(next){
          fs.unlink(file.tmp,next)
        }
      ],
      next
    )
  }
  var processFile = function(file){
    var writable = fs.createWriteStream(file.tmp)
    var shasum = crypto.createHash('sha1')
    var sniff = new Sniffer()
    var doc
    sniff.on('data',function(data){
      file.size += data.length
      shasum.update(data)
    })
    writable.on('finish',function(){
      file.sha1 = shasum.digest('hex')
      async.series(
        [
          //send to oose or shredder
          function(next){
            if(file.mimetype.match(/^(video|audio)\//i)){
              sendToShredder(file,next)
            } else {
              sendToOOSE(file,next)
            }
          },
          //create parents
          function(next){
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
                File.count({path: File.encode(currentPath)},function(err,count){
                  if(err) return next(err)
                  pathCount = count
                  next()
                })
              },
              function(){
                if(0 === pathCount) return true
                nameIterator++
                currentPath.pop()
                var ext = Path.extname(file.filename)
                var basename = Path.basename(file.filename,ext)
                if(basename.match(/\(\d+\)$/)) basename = basename.replace(/\(\d+\)$/,'(' + nameIterator + ')')
                else basename += ' (' + nameIterator + ')'
                file.filename = basename + ext
                currentPath.push(file.filename)
                return false
              },
              function(err){
                if(err) return next(err)
                doc = new File()
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
              next()
            })
          }
        ],
        function(err){
          if(err) return file.promise.reject(err)
          file.promise.resolve()
        }
      )
    })
    file.readable.pipe(sniff).pipe(writable)
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
      tmp: temp.path({dir: config.get('gump.tmpDir')}),
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
      res.redirect('/?path=' + req.query.path + (req.query.god ? '&god=on' : ''))
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
  File.findOne({_id: req.query.id},function(err,result){
    var prismHost = config.get('gump.prism.hostUrl')
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
        baseUrl: config.get('gump.baseUrl'),
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
              fs.unlink(file.tmp,next)
            },
            //create the embed object
            function(next){
              var embedHandle = Embed.generateHandle()
              file.embedHandle = embedHandle
              var doc = new Embed()
              doc.handle = embedHandle
              doc.title = file.name
              doc.keywords = file.name.split(' ').join(',')
              doc.template = 'standard'
              if(file.shredder.resources['mp4-standard-480p-preview']){
                doc.media.image.push({
                  offset: null,
                  sha1: file.shredder.resources['mp4-standard-480p-preview']
                })
              }
              if(file.shredder.resources['mp4-standard-480p']){
                doc.media.video.push({
                  quality: 'standard',
                  sha1: file.shredder.resources['mp4-standard-480p']
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
        fs.unlink(file.tmp,next)
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
        File.findOne({_id: req.query.id},function(err,result){
          if(err) return next()
          if(!result) return next('Could not find file')
          file = result
          next()
        })
      },
      //build the oose url
      function(next){
        url =
          'http://' + config.get('gump.prism.host') + ':' + config.get('gump.prism.port') +
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
