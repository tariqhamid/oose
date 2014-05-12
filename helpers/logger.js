'use strict';
var fs = require('fs')
  , mkdirp = require('mkdirp')
  , util = require('util')

//make sure the log folder exists
if(!fs.existsSync('./log')) mkdirp.sync('./log')

//setup logger
var logger = require('caterpillar').createLogger({lineOffset: 2})
var fileFilter = require('caterpillar-filter').createFilter({level: 5})
var consoleFilter = require('caterpillar-filter').createFilter({level: 6})
var fileLog = fs.createWriteStream(__dirname + '/../log/oose.log')
var human = require('caterpillar-human').createHuman({colors: {7: 'magenta'}})

//log to console
logger.pipe(consoleFilter).pipe(human).pipe(process.stdout)

//log to file
logger.pipe(fileFilter).pipe(fileLog)

//add item to beginning of arguments object and convert to array
var unshift = function(args,value){
  var obj = [value]
  for(var i in args){
    if(args.hasOwnProperty(i)) obj.push(args[i])
  }
  return obj
}

//normalize logged args
var stringify = function(args){
  args.forEach(function(item,i,o){
    if('string' !== typeof item)
      o[i] = util.inspect(item)
  })
  return args
}



/**
 * Constructor
 * @param {string} tag
 * @constructor
 */
var Logger = function(tag){
  var that = this
  that.tag = '[' + (tag || 'oose').toUpperCase() + '] '
}


/**
 * Log stuff
 */
Logger.prototype.log = function(){
  var args = unshift(arguments,this.tag)
  var level = args[1]
  args.splice(1,1)
  args.unshift(level)
  args = stringify(args)
  logger.log.apply(logger,args)
}


/**
 * Log debug
 */
Logger.prototype.debug = function(){
  this.log.apply(this,unshift(arguments,'debug'))
}


/**
 * Log info
 */
Logger.prototype.info = function(){
  this.log.apply(this,unshift(arguments,'info'))
}


/**
 * Log notice
 */
Logger.prototype.notice = function(){
  this.log.apply(this,unshift(arguments,'notice'))
}


/**
 * Log warn
 */
Logger.prototype.warning = function(){
  this.log.apply(this,unshift(arguments,'warn'))
}


/**
 * Log error
 */
Logger.prototype.error = function(){
  this.log.apply(this,unshift(arguments,'error'))
}


/**
 * Log critical
 */
Logger.prototype.critical = function(){
  this.log.apply(this,unshift(arguments,'critical'))
}


/**
 * Log alert
 */
Logger.prototype.alert = function(){
  this.log.apply(this,unshift(arguments,'alert'))
}


/**
 * Log emergency
 */
Logger.prototype.emergency = function(){
  this.log.apply(this,unshift(arguments,'emergency'))
}


/**
 * Create instance
 * @param {string} tag
 * @return {Logger}
 */
Logger.create = function(tag){
  return new Logger(tag)
}


/**
 * Console filter
 */
Logger.consoleFilter = consoleFilter


/**
 * File Filter
 */
Logger.fileFilter = fileFilter


/**
 * Export module
 * @type {exports.Logger}
 */
module.exports = Logger
