'use strict';
var winston = require('winston')
  , fs = require('fs')
  , mkdirp = require('mkdirp')

//make sure the log folder exists
if(!fs.existsSync('./log')){
  mkdirp.sync('./log')
}

var logger = new winston.Logger({
  transports: [
    new winston.transports.File({ filename: './log/oose.log' })
  ]
})
logger.cli()

logger.addConsole = function(level){
  logger.add(winston.transports.Console,{ level: level || 'info'})
}
module.exports = logger