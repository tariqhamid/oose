'use strict';
var fs = require('fs')
var path = require('path')
var async = require('async')
var ObjectManage = require('object-manage')
var Resource = require('./resource')
var Parameter = require('./parameter')
var Logger = require('../../helpers/logger')
var drivers = require('../drivers')
var crypto = require('crypto')
//var config = require('../../config')
var hideout = require('../../helpers/hideout')


/**
 * Load a template if there is one
 * @param {Job} job manager
 * @param {object} input
 * @return {ObjectManage}
 */
var loadTemplate = function(job,input){
  if(input instanceof ObjectManage) input = JSON.parse(JSON.stringify(input.data))
  //setup a new object manage
  var obj = new ObjectManage()
  //load our input
  obj.load(input)
  //if there is not a template we are done
  if(!input.template) return obj
  //figure out template location
  var file = path.resolve(__dirname + '/../templates/' + input.template + '.json')
  if(!fs.existsSync(file)){
    job.logger.warning('Requested template ' + input.template + ' doesnt exist')
    return obj
  }
  //since we have an existing template lets grab it
  var content = fs.readFileSync(file)
  obj.load(JSON.parse(content))
  //load our input over it again for overrides
  obj.load(input)
  return obj
}


/**
 * Generate a job signature
 * @param {Job} job
 * @return {sha1}
 */
var generateSignature = function(job){
  //we need to extract parts of the description to determine the jobs uniqueness
  //things like source urls dont help, and if we dont have sha1's of our source
  //files it is impossible to generate a reusable signature
  //thus the signature formula is encode + save + source sha1's
  //make sure we have available information
  var valid = true
  job.description.get('resource').forEach(function(item,i){
    var resource = job.resource.get(item.name)
    if(resource && resource.sha1){
      job.description.data.resource[i].sha1 = resource.sha1
      return
    }
    if(item.sha1 && 40 === item.sha1.length) return
    valid = false
  })
  //if we dont have all the required information then there is no chance of creating a signature
  if(!valid) return null
  //start to assemble the fingerprint that will be hashed to generate the job signature
  var fingerprint = {}
  //add sha1's of the resources
  fingerprint.resource = []
  job.description.get('resource').forEach(function(item){
    fingerprint.resource.push(item.sha1)
  })
  //add the entire encoding stanza (any difference here will yield a different result
  fingerprint.encoding = job.description.get('encoding')
  //add the entire save section as this will also yield different output
  fingerprint.save = job.description.get('save')
  //create our sha1 hasher
  var shasum = crypto.createHash('sha1')
  //convert our fingerprint to JSON and then dump it into the hasher
  shasum.update(JSON.stringify(fingerprint))
  //the resulting digest will be our signature
  return shasum.digest('hex')
}


/**
 * Throttle helper for sending updates
 * @param {number} rate
 * @param {Date} pointer
 * @param {string} status
 * @return {boolean}
 */
var throttleUpdate = function(rate,pointer,status){
  if(!pointer) pointer = 0
  var now = new Date().valueOf()
  //make sure pointer is a number
  if(pointer instanceof Date) pointer = pointer.valueOf()
  //make sure rate is a number
  rate = parseInt(rate,10)
  //figure out the next available send date
  var nextSend = pointer + rate
  //throttle messages provided its not a status change message
  if(status.match(/error|complete/)) return true
  if(!rate) return true
  return (now >= nextSend)
}



/**
 * Job processor
 * @param {string} handle
 * @param {JSON} description
 * @constructor
 */
var Job = function(handle,description){
  this.logger = Logger.create('shredder:job:' + handle)
  this.handle = handle
  this.resource = new Resource()
  this.description = new ObjectManage()
  this.description.load(JSON.parse(description))
  this.signature = null
  this.metrics = new ObjectManage()
  this.metrics.load(JSON.parse(JSON.stringify(this.defaultMetrics)))
  this.metrics.set('handle',handle)
  this.result = {}
  this.callbackThrottle = {}
}


/**
 * Default metric structure
 * @type {{}}
 */
Job.prototype.defaultMetrics = {
  handle: '',
  status: '',
  message: '',
  steps: {
    complete: 0,
    total: 1
  },
  frames: {
    description: '',
    complete: 0,
    total: 1
  },
  resources: {}
}


/**
 * Send job update to the registered callback
 * @param {object} changes
 * @param {function} done
 * @return {*}
 */
Job.prototype.update = function(changes,done){
  var that = this
  //apply changes
  that.metrics.load(changes)
  var callback = that.description.get('callback')
  //if there are no callbacks defined just return
  if('undefined' === callback) return done()
  //make sure we have an array of callbacks to execute
  if(!(callback instanceof Array)) callback = [callback]
  async.each(
    callback,
    function(item,next){
      var i = callback.indexOf(item)
      if(throttleUpdate(item.throttle,that.callbackThrottle[i],that.metrics.get('status'))){
        that.callbackThrottle[i] = new Date()
        that.runDriver('callback',new Parameter(),item,next)
      } else {
        next()
      }
    },
    done
  )
}


/**
 * Run a driver for the job
 * @param {string} category
 * @param {Parameter} parameter manager
 * @param {object} options
 * @param {function} done
 * @return {*}
 */
Job.prototype.runDriver = function(category,parameter,options,done){
  var that = this
  if(!(options instanceof Array)) options = [options]
  async.eachSeries(
    options,
    function(options,next){
      options = loadTemplate(that,options)
      //set the default driver if we dont already have it
      if('resource' === category && !options.exists('driver')) options.set('driver','http')
      //check to see if the driver exists
      if(!drivers[category][options.get('driver')]) return next('Driver ' + options.get('driver') + ' doesnt exist')
      //run the driver
      drivers[category][options.get('driver')].run(that,parameter,options,next)
    },
    done
  )
}


/**
 * Obtain resources
 * @param {function} next
 * @return {*}
 */
Job.prototype.obtainResources = function(next){
  var that = this
  //make sure we have a resource section if not we cant do anything
  if(!that.description.exists('resource') || !that.description.get('resource').length)
    return next('No resources defined')
  that.logger.info('Starting to collect defined resources')
  async.each(
    that.description.get('resource'),
    function(item,next){
      that.runDriver('resource',new Parameter(),item,next)
    },
    function(err){
      if(err) return next(err)
      that.logger.info('Resource collection finished')
      next()
    }
  )
}


/**
 * Execute encoding jobs
 * @param {function} next
 * @return {*}
 */
Job.prototype.encode = function(next){
  var that = this
  //if there are no encoding operation just continue
  if(!that.description.exists('encoding') || !that.description.get('encoding').length) return next()
  that.logger.info('Starting to execute encoding jobs')
  async.eachSeries(
    that.description.get('encoding'),
    function(item,next){
      item = loadTemplate(that,item)
      var param = new Parameter()
      if(item.exists('parameters')) param.load(item.get('parameters'))
      var jobs = item.get('jobs') || []
      //sort jobs by their position
      jobs.sort(function(a,b){
        return (parseInt(a.position,10) - parseInt(b.position,10))
      })
      async.eachSeries(
        jobs,
        function(item,next){
          that.runDriver('encode',param,item,next)
        },
        next
      )
    },
    function(err){
      if(err) return next(err)
      that.logger.info('Finished executing encoding jobs')
      next()
    }
  )
}


/**
 * Save resources created during the job
 * @param {function} next
 * @return {*}
 */
Job.prototype.save = function(next){
  var that = this
  //if there is no save section defined, warn and move on
  if(!that.description.exists('save') || !that.description.get('save').length){
    that.logger.warning('No resources will be saved')
    return next()
  }
  //save the resources
  that.resource.save(that.description.get('save'),function(err,result){
    if(err) return next(err)
    that.result = result
    next(null,result)
  })
}


/**
 * Check to see if the job has alread
 * @param {function} next
 * @return {*}
 */
Job.prototype.cacheCheck = function(next){
  var that = this
  //try to generate a signature first
  if(null === that.signature) that.signature = generateSignature(that)
  //if our signature is still null just return
  if(null === that.signature) return next('no signature')
  //since we do have a signature try to see if hideout has a record of this build
  hideout.exists(that.signature,function(err,exists){
    if(err) return next(err)
    if(!exists) return next('does not exist')
    //get the value if it exists
    hideout.get(that.signature,function(err,result){
      if(err) return next(err)
      if(!result.value) return next('no value defined')
      next(null,result.value)
    })
  })
}


/**
 * Store the result of the job in hideout
 * @param {function} next
 * @return {*}
 */
Job.prototype.cacheStore = function(next){
  var that = this
  //if there is no signature try to gen one
  if(null === that.signature) that.signature = generateSignature(that)
  //if there is still no signature just return
  if(null === that.signature) return next()
  //make sure there is a result to store
  if('object' !== typeof that.result || 0 === Object.keys(that.result).length) return next()
  //now that we have our signature and result send it to hideout
  hideout.set(that.signature,that.result,function(err){
    if(err) return next(err)
    next()
  })
}


/**
 * Export Job manager
 * @type {Job}
 */
module.exports = Job
