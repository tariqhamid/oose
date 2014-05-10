'use strict';
var temp = require('temp')
  , config = require('../../config')
  , fs = require('fs')
  , mkdirp = require('mkdirp')
  , mmm = require('mmmagic')
  , async = require('async')
  , net = require('net')
  , crypto = require('crypto')
  , restler = require('restler')
  , Sniffer = require('../../helpers/Sniffer')
  , File = require('../models/file').model


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
  var files = []
  var path = File.decode(req.query.path)
  if(!req.query.god || !req.session.user.admin)
    path.unshift(req.session.user._id)
  req.pipe(req.busboy)
  req.busboy.on('field',function(key,value){
    body[key] = value
  })
  req.busboy.on('file',function(fieldname,file,filename){
    var tmp = temp.path({dir: config.get('gump.tmpDir')})
    var fileParams = {
      tmp: tmp,
      filename: filename,
      sha1: ''
    }
    var shasum = crypto.createHash('sha1')
    var sniff = new Sniffer()
    sniff.on('data',function(data){
      shasum.update(data)
    })
    sniff.on('end',function(){
      fileParams.sha1 = shasum.digest('hex')
    })
    files.push(fileParams)
    if(!fs.existsSync(config.get('gump.tmpDir')))
      mkdirp.sync(config.get('gump.tmpDir'))
    var writable = fs.createWriteStream(tmp)
    file.pipe(sniff).pipe(writable)
  })
  req.busboy.on('finish',function(){
    async.each(
      files,
      function(file,next){
        var mimeType, doc
        var magic = new mmm.Magic(mmm.MAGIC_MIME_TYPE)
        var importJob
        async.series(
          [
            //detect mime type
            function(next){
              magic.detectFile(file.tmp,function(err,result){
                if(err) return next(err)
                mimeType = result
                next()
              })
            },
            //decide whether to use shredder or raw import
            function(next){
              var prismBaseUrl = 'http://' + config.get('gump.prism.host') + ':' + config.get('gump.prism.port')
              var gumpBaseUrl = 'http://' + config.get('gump.host') + ':' + config.get('gump.port')
              if(mimeType.match(/video|audio/i)){
                restler
                  .post(prismBaseUrl + '/api/shredderJob',{
                    data: {
                      mimeType: mimeType,
                      filename: file.filename,
                      sha1: file.sha1,
                      source: gumpBaseUrl + '/tmp/' + path.basename(file.tmp),
                      callback: gumpBaseUrl + '/api/importJobUpdate',
                      output: {
                        preset: 'mp4Stream'
                      }
                    }
                  })
                  .on('complete',function(result){
                    if(result instanceof Error){
                      return next(result)
                    }
                    importJob = result.handle
                    next()
                  })
              } else {
                var peerNext = {}
                async.series(
                  [
                    //ask for nextPeer
                    function(next){
                      restler.get(prismBaseUrl + '/api/peerNext').on('complete',function(result){
                          if(result instanceof Error) return next(result)
                          if(!result.peer) return next('Next peer could not be found')
                          peerNext = result.peer
                          next()
                        })
                    },
                    //send to import
                    function(next){
                      var client = net.connect(peerNext.port,peerNext.host)
                      client.on('connect',function(){
                        var rs = fs.createReadStream(file.tmp)
                        rs.pipe(client)
                        client.on('error',function(err){
                          next(err)
                        })
                        client.on('end',function(){
                          next()
                        })
                      })
                    }
                  ],
                  next
                )
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
              doc = new File()
              doc.name = file.filename
              doc.tmp = file.tmp
              doc.path = currentPath
              doc.mimeType = mimeType
              if(importJob){
                doc.importJob = importJob
                doc.status = 'procesing'
              } else {
                doc.status = 'ok'
              }
              next()
            },
            //save doc
            function(next){
              doc.save(function(err){
                if(err) return next(err.message)
                next()
              })
            }
          ],
          next
        )
      },
      function(err){
        if(err){
          res.status(500)
          res.json({error: err})
        } else {
          res.json({success: 'File upload successfully'})
        }
      }
    )
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
  File.findOne({_id: req.query.id},function(err,result){
    if(result.status === 'processing'){
      return res.render('fileProcessing',{
        file: result,
        god: req.query.god ? true : false
      })
    }
  })
}


/**
 * Job Import updates
 * @param {object} req
 * @param {object} res
 */
exports.jobImportUpdate = function(req,res){
  var file
  async.series(
    [
      //find file by job
      function(next){
        File.findOne({'importJob.handle': req.body.handle},function(err,result){
          if(err) return next(err.message)
          if(!result) return next('could not find file by handle')
          file = result
          next()
        })
      },
      //update job status
      function(next){
        file.importJob.status = req.body.status
        file.importJob.message = req.body.message
        if(req.body.framesTotal) file.importJob.framesTotal = req.body.framesTotal
        if(req.body.framesComplete) file.importJob.framesComplete = req.body.framesComplete
        if(req.body.manifest) file.importJob.manifest = req.body.manifest
        if('complete' === file.importJob.status){
          file.status = 'ok'
          fs.unlink(file.tmp,next)
        } else if('error' === file.importJob.status){
          file.importError = req.body.message
          fs.unlink(file.tmp,next)
        } else{
          next()
        }
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
