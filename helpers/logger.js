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
    new winston.transports.File({ filename: './log/oose.log' }),
    new winston.transports.Console({ colorize: true, level: 'info'})
  ]
})
logger.cli()

module.exports = logger