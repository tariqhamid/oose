'use strict';
var mongoose = require('mongoose')

var logger = require('../helpers/logger').create('gump:generateIds')
var shortid = require('../helpers/shortid')

var File = require('../models/file').model

var config = require('../config')

mongoose.connect(config.mongoose.dsn,config.mongoose.options,function(err){
  if(err) throw err
  logger.info('Starting to fill in missing file IDs for Gump')
  var stream = File.find().stream()
  stream.on('error',function(err){
    logger.error(err)
    process.exit()
  })
  stream.on('data',function(doc){
    if(!doc.handle) doc.handle = shortid.generate()
    doc.save(function(err){
      if(err){
        logger.error(err.message)
        process.exit()
      }
    })
  })
  stream.on('end',function(){
    logger.info('Finished generating missing IDs')
    process.exit()
  })
})
