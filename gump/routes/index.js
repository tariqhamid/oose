'use strict';
var temp = require('temp')
  , config = require('../../config')
  , fs = require('fs')
  , mkdirp = require('mkdirp')
  , mmm = require('mmmagic')
  , async = require('async')
  , path = require('path')
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
  File.find({path: /^\/[^\/]+$/},function(err,results){
    if(err) return res.send(err.message)
    res.render('index',{path: '/', files: results})
  })
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
              doc.path = '/' + [req.query.path,file.filename]
                .filter(function(i){return (i && i !== '/')})
                .join('/')
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
