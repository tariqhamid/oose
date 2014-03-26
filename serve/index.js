'use strict';
var express = require('express')
  , app = express()
  , fs = require('fs')
  , config = require('../config')

var fileBySha1 = function(sha1){
  var file = config.get('serve.root')
  var parts = sha1.split('')
  for(var i = 1; i <= parts.length; i++){
    file = file + parts[i - 1]
    if(i % 2 === 0){
      file = file + '/'
    }
  }
  return file
}

app.get('/:sha1/:filename',function(req,res){
  var file = fileBySha1(req.params.sha1)
  if(!fs.existsSync(file)){
    res.status(404)
    res.send('File not found')
  } else {
    if(req.query.download){
      res.download(file)
    } else {
      res.sendFile(file)
    }
  }
})

exports.start = function(){
  app.listen(config.get('serve.port'),config.get('serve.host'),function(err){
    if(err) console.error('Failed to start serve: ' + err)
    else console.log('Serve is started')
  })
  return app
}
