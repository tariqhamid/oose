'use strict';
var async = require('async')
var mongoose = require('mongoose')

var logger = require('../helpers/logger').create('gump:generateIds')
var shortid = require('../helpers/shortid')
var File = require('../models/file').model

var config = require('../config')

mongoose.connect(config.mongoose.dsn,config.mongoose.options,function(err){
  if(err) throw err
  logger.info('Starting to fill in missing file IDs for Gump')
  var stream = File.find({},function(err,results){
    if(err){
      logger.error(err)
      process.exit()
    }
    async.each(
      results,
      function(doc,next){
        if(!doc.handle) doc.handle = shortid.generate()
        console.log(doc.id,doc.handle)
        doc.save(function(err){
          if(err) return next(err.message)
          next()
        })
      },
      function(err){
        if(err){
          logger.error(err)
        }
        logger.info('Finished generating missing IDs')
        process.exit()
      }
    )
  })
})
