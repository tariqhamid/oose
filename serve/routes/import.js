'use strict';
var express = require('express')
  , fs = require('fs')
  , config = require('../../config')
  , mkdirp = require('mkdirp')
  , Busboy = require('busboy')
  , crypto = require('crypto')
  , websocket = require('websocket-stream')
  , app = express()

//make sure the root folder exists
if(!fs.existsSync(config.get('import.dataRoot'))){
  mkdirp.sync(config.get('import.dataRoot'))
}

var connPool = {}
var bestTarget = function(){
  var target = {host: 'localhost', port: 3002}
  return connPool.hasOwnProperty(target.host) ?
    connPool[target.host] :
    connPool[target.host] = websocket('ws://' + 'localhost' + ':' + '3002')
}

app.use(function(req,res,next){
  var contentType = req.get('content-type')
  if('post' === req.method.toLowerCase()){
    if(0 === contentType.indexOf('multipart/form-data')){
      req.files = []
      req.body = {sourceType:'multipart'}
      //setup busboy
      var busboy = new Busboy({headers:req.headers})
      busboy.on('file',function(fieldname,file,filename){
        var shasum = crypto.createHash('sha1')
        file.on('data',shasum.update)
        req.files.push({fd:file,fieldname:fieldname,filename:filename,hash:shasum})
      })
      busboy.on('field',function(fieldname,val){
        req.body[fieldname] = val
      })
      busboy.on('error',next)
      busboy.on('end',next)
      req.pipe(busboy)
    } else if(contentType && 0 === contentType.indexOf('application/x-www-form-urlencoded')){
      express.urlencoded()(req,res,next)
    } else if(contentType && contentType.indexOf('json') > -1){
      express.json()(req,res,next)
    } else {
      next()
    }
  } else {
    next()
  }
})
app.post('/',function(req,res){
  switch(req.body.sourceType){
  case 'multipart':
    req.files.forEach(function(file){
      file.fd.pipe(bestTarget())
    })
    break
  case 'download':

  default:
    res.end('what')
  }
})

app.listen(config.get('import.port'))

module.exports = app