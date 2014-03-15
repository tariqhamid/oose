'use strict';
var ObjectManage = require('object-manage')
  , fs = require('fs')

var config = new ObjectManage()
config.load({
  serve: {
    port: 3000,
    dataRoot: './data/serve',
    mcastAddr: '226.0.0.1'
  },
  import: {
    port: 3001,
    dataRoot: './data/import',
    mcastAddr: '226.0.0.2'
  }
})

if(fs.existsSync('./config.user.js')){
  config.load(require('./config.user'))
}

module.exports = config