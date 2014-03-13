'use strict';
var ObjectManage = require('object-manage')
  , fs = require('fs')

var config = new ObjectManage()
config.load({
  serve: {
    port: 3000,
    dataRoot: './data/serve'
  }
})

if(fs.existsSync('./config.user.js')){
  config.load(require('./config.user'))
}

module.exports = config