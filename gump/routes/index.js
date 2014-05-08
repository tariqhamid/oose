'use strict';
var temp = require('temp')
  , config = require('../../config')
  , fs = require('fs')
  , mkdirp = require('mkdirp')
  , mmm = require('mmmagic')
  , async = require('async')
  , File = require('../models/file').model


/**
 * Embed
 * @type {exports}
 */
exports.embed = require('./embed')


/**
 * Homepage
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  File
    .findInPath(req.query.path)
    .where('name',new RegExp(req.query.search || '.*','i'))
    .exec(function(err,results){
      if(err) return res.send(err.message)
      res.render('index',{
        path: req.query.path || '/',
        files: results,
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
exports.folderRemove = function(req,res){
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
      res.redirect('/?path=' + req.query.path)
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
  req.pipe(req.busboy)
  req.busboy.on('field',function(key,value){
    body[key] = value
  })
  req.busboy.on('file',function(fieldname,file,filename){
    var tmp = temp.path({dir: config.get('gump.tmpDir')})
    files.push({tmp: tmp, filename: filename})
    if(!fs.existsSync(config.get('gump.tmpDir')))
      mkdirp.sync(config.get('gump.tmpDir'))
    var writable = fs.createWriteStream(tmp)
    file.pipe(writable)
  })
  req.busboy.on('finish',function(){
    async.each(
      files,
      function(file,next){
        var mimeType, doc
        var magic = new mmm.Magic(mmm.MAGIC_MIME_TYPE)
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
            //create doc
            function(next){
              doc = new File()
              doc.name = file.filename
              doc.tmp = file.tmp
              doc.path = doc.absolutePath(req.query.path,req.body.name)
              doc.mimeType = mimeType
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
  async.series(
    [
      function(next){
        doc = new File()
        doc.name = req.body.name
        doc.path = doc.absolutePath(req.query.path,req.body.name)
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
      res.redirect('/?path=' + req.query.path)
    }
  )
}
