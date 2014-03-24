'use strict';
var mesh = require('./mesh')
  , config = require('./config')
  , serve = require('./serve')
  , resolve = require('./resolve')


//start serve if its enabled
if(config.get('serve.enabled')){
  mesh.use(serve.annaounce())
  serve.start()
}

//start resolve if its enabled
if(config.get('resolve.enabled')){
  mesh.use(resolve.announce())
  resolve.start()
}

//start mesh for discovery and communication
mesh.start()