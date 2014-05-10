'use strict';
var winston = require('winston')
  , fs = require('fs')
  , mkdirp = require('mkdirp')

//make sure the log folder exists
if(!fs.existsSync('./log')){
  mkdirp.sync('./log')
}



/**
 * Constructor
 * @param {string} tag
 * @constructor
 */
var Logger = function(tag){
  this.tag = '[' + (tag || 'oose').toUpperCase() + '] '
  this.logger = new winston.Logger({
    transports: [
      new winston.transports.File({ filename: './log/oose.log' }),
      new winston.transports.Console({ colorize: true, level: 'info'})
    ]
  })
  this.logger.cli()
}


/**
 * Debug log message
 * @param {*} msg
 */
Logger.prototype.debug = function(msg){
  this.logger.debug(this.tag + msg)
}


/**
 * Info log message
 * @param {*} msg
 */
Logger.prototype.info = function(msg){
  this.logger.info(this.tag + msg)
}


/**
 * Warning log message
 * @param {*} msg
 */
Logger.prototype.warn = function(msg){
  this.logger.warn(this.tag + msg)
}


/**
 * Error log message
 * @param {*} msg
 */
Logger.prototype.error = function(msg){
  this.logger.error(this.tag + msg)
}


/**
 * Static logger
 * @type {Logger}
 */
Logger.logger = new Logger('oose')


/**
 * Create instance
 * @param {string} tag
 * @return {Logger}
 */
Logger.create = function(tag){
  return new Logger(tag)
}


/**
 * Export module
 * @type {exports.Logger}
 */
module.exports = Logger
