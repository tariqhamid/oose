'use strict';
var express = require('express')
  , fs = require('fs')
  , config = require('../config')
  , mkdirp = require('mkdirp')
  , app = express()

//make sure the root folder exists
if(!fs.existsSync(config.get('serve.dataRoot'))){
  mkdirp.sync(config.get('serve.dataRoot'))
}

app.use(express.static(config.get('serve.dataRoot')))

app.listen(config.get('serve.port'))

module.exports = app
