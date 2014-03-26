'use strict';
var express = require('express')
  , app = express()
  , config = require('../config')
app.get('*',function(req,res){
  res.send('..l..')
})

exports.start = function(){
  app.listen(config.get('resolve.port'),config.get('resolve.host'),function(err){
    if(err) console.error('Failed to start resolve: ' + err)
    else console.log('Resolve is started')
  })
}
