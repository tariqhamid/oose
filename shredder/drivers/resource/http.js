'use strict';
var request = require('request')
var async = require('async')
var prettyBytes = require('pretty-bytes')
var url = require('url')
var Sniffer = require('../../../helpers/Sniffer')
var crypto = require('crypto')
var fs = require('fs')


/**
 * Show the progress message
 * @param {object} opts
 * @param {object} progress
 * @param {object} frames
 * @return {string}
 */
var progressMessage = function(opts,progress,frames){
  var bps = prettyBytes((
    (frames.complete || 1) / ((new Date().valueOf() - (progress.start.valueOf() || 1)) / 1000)
  ))
  return 'Downloading resource [' + opts.name + '] ' +
    prettyBytes(frames.complete || 0) + ' / ' +
    prettyBytes(frames.total || 0) + ' ' +
    ((frames.complete / frames.total) * 100).toFixed(2) + '% [' +
    bps + 'ps]'
}


/**
 * Decide throttling of the progress messages
 * @param {object} progress
 * @param {object} frames
 * @return {boolean}
 */
var progressThrottle = function(progress,frames){
  var show = false
  var now = new Date().valueOf()
  var lastUpdate = progress.lastUpdate
  if(lastUpdate instanceof Date) lastUpdate = progress.lastUpdate.valueOf()
  if(frames.total === frames.complete) show = true
  if(!lastUpdate) show = true
  if(now > lastUpdate + progress.rate) show = true
  if(show){
    progress.lastUpdate = new Date()
    return true
  }
  return false
}


/**
 * Execute a request
 * @param {Job} job
 * @param {req} req
 * @param {function} done
 * @return {*}
 */
var executeRequest = function(job,req,done){
  var opts = req.opts || {}
  var resource = req.resource || null
  var jar = req.jar || request.jar()
  //make sure a url was provided
  if(!opts.url && !opts.uri)
    return done('No URL for retrieval of ' + (opts.name || 'no name'))
  //if a uri was sent, copy it to url and remove it
  if(opts.uri && !opts.url){
    opts.url = opts.uri
    delete opts.uri
  }
  //set the method to get if not set
  if(!opts.method) opts.method = 'get'
  //try to render the url with any parameters
  opts.url = req.parameter.render(opts.url)
  //parse the url, need to make sure its valid, so we can fail gracefully if not
  var parsedUrl = url.parse(opts.url)
  if(!parsedUrl.protocol || !parsedUrl.host || !parsedUrl.path) return done('Invalid URL passed: ' + opts.url)
  //start the request
  job.logger.info('Retrieving resource ',opts)
  //add the cookie jar
  opts.jar = jar
  //make the request
  var client = request(opts)
  client.on('error',function(err){done(err)})
  client.on('response',function(res){
    //setup metrics
    var frames = {
      description: 'HTTP Resource Driver, downloading ' + opts.url,
      complete: 0,
      total: parseInt(res.headers['content-length'],10) || 0
    }
    var progress = {
      start: new Date(),
      lastUpdate: 0,
      rate: 1000
    }
    //setup error and progress handling
    res.on('error',function(err){done(err)})
    res.on('data',function(data){
      frames.complete += data.length
      if(frames.complete > frames.total) frames.total = frames.complete
      //show progress message if we can
      if(progressThrottle(progress,frames))
        job.logger.info(progressMessage(opts,progress,frames))
      //send a job update about our progress (force it on the last frame)
      job.update({frames: frames},(frames.total === frames.complete))
    })
    //decide what to do with the output
    if(resource){
      var shasum = crypto.createHash('sha1')
      var sniff = new Sniffer()
      sniff.on('data',function(data){shasum.update(data)})
      var tmp = fs.createWriteStream(resource.path)
      tmp.on('finish',function(){
        job.resource.load(opts.name,{sha1: shasum.digest('hex')})
        job.logger.info('Successfully retrieved resource from ' + opts.url + ' and saved to ' + resource.path)
        done()
      })
      res.pipe(sniff).pipe(tmp)
    } else {
      //if there is a parse argument lets buffer the data and parse it
      if(opts.parse){
        var buffer = ''
        //we must switch to string mode to be able to parse output
        res.setEncoding('utf-8')
        res.on('data',function(data){
          buffer += data
        })
        //parse the data using the provided regex and store the params
        res.on('end',function(){
          var exp, match
          for(var i in opts.parse){
            if(!opts.parse.hasOwnProperty(i)) continue
            exp = new RegExp(opts.parse[i],'i')
            match = exp.exec(buffer)
            if(match && match[1]) req.parameter.set(i,match[1])
          }
          done()
        })
      }
      //if no resource is passed and no parse args defined, ignore the output
      else {
        res.on('end',function(){done()})
      }
    }
  })
}


/**
 * Driver name
 * @type {string}
 */
exports.name = 'http'


/**
 * Driver Category
 * @type {string}
 */
exports.category = 'resource'


/**
 * Driver description
 * @type {string}
 */
exports.description = 'Offers ability to use http as a resource retrieval method'


/**
 * Execute the driver with the given options
 * @param {Job} job manager
 * @param {Parameter} parameter manager
 * @param {object} options
 * @param {function} done
 */
exports.run = function(job,parameter,options,done){
  job.resource.create(options.get('name'),function(err,resource){
    if(err) return done(err)
    var chain = []
    //if we dont have a chain lets make one out of the single request
    if(!options.get('chain')) chain.push(options.get())
    else chain = options.get('chain')
    //pop the last request off the chain and save it for the end
    var final = chain.pop()
    var jar = request.jar()
    //loop through the chain
    async.eachSeries(
      chain,
      //execute each member of the chain and gracefully handle errors
      function(opts,next){
        //setup the request and dont provide a resource, since these are intermediate requests
        opts.name = options.get('name')
        var req = {
          resource: null,
          jar: jar,
          parameter: parameter,
          opts: opts
        }
        executeRequest(job,req,function(err){
          if(err && !opts.optional) return next(err)
          if(err && opts.optional) job.logger.warning('Failed resource request: ' + err)
          next()
        })
      },
      //execute the final request if there were no errors
      function(err){
        if(err) return done(err)
        //setup for the final request (provide the resource)
        final.name = options.get('name')
        var req = {
          resource: resource,
          jar: jar,
          parameter: parameter,
          opts: final
        }
        executeRequest(job,req,done)
      }
    )
  })
}
