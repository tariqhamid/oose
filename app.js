'use strict';
var mesh = require('./mesh')
  , config = require('./config')
  , serve = require('./serve')
  , resolve = require('./resolve')

//start mesh for discovery and communication
mesh.start()

//start serve if its enabled
if(config.get('serve.enabled')){
  serve.start()
}

//start resolve if its enabled
if(config.get('resolve.enabled')){
  resolve.start()
}