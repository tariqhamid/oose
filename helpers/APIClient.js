'use strict';
var P = require('bluebird')
var debug = require('debug')('APIClient')
var fs = require('graceful-fs')
var request = require('request')

var NetworkError = require('./NetworkError')
var UserError = require('./UserError')

//make some promises
P.promisifyAll(request)



/**
 * Constructor
 * @param {number} port
 * @param {string} host
 * @param {object} options
 * @constructor
 */
var APIClient = function(port,host,options){
  if('object' !== typeof options) options = {}
  //defaults
  this.host = '127.0.0.1'
  this.port = 80
  this.protocol = 'https'
  //overrides
  if(host) this.host = host
  if(port) this.port = port
  if(options.protocol) this.protocol = options.protocol
  if(options.localAddress) this.localAddress = options.localAddress
  //turn on json if we can
  this.json = true
  //set the token to an empty object for now
  this.session = {}
  //set basicAuth to disabled
  this.basicAuth = {username: false, password: false}
  //set the base url now
  this.baseURL = this.protocol + '://' + this.host + ':' + this.port
  debug('init complete',this.baseURL)
}


/**
 * Set session token
 * @param {object} session
 * @return {APIClient}
 */
APIClient.prototype.setSession = function(session){
  debug('setting session',session)
  this.session = session
  return this
}


/**
 * Set basic auth
 * @param {string} username
 * @param {string} password
 * @return {APIClient}
 */
APIClient.prototype.setBasicAuth = function(username,password){
  debug('setting basic auth',username,password)
  this.basicAuth.username = username
  this.basicAuth.password = password
  return this
}


/**
 * Set local address
 * @param {string} address
 * @return {APIClient}
 */
APIClient.prototype.setLocalAddress = function(address){
  debug('setting local address',address)
  this.localAddress = address
  return this
}


/**
 * Set JSON parsing of response
 * @param {boolean} json
 * @return {APIClient}
 */
APIClient.prototype.setJSON = function(json){
  this.json = !!json
  return this
}


/**
 * Build Options
 * @param {string} dataKey The key to add the session token/data to
 * @param {object} data
 * @param {string} url
 * @return {object}
 */
APIClient.prototype.buildOptions = function(dataKey,data,url){
  var options = {}
  //add ssl options
  options.rejectUnauthorized = false
  //set the data
  if(data) options[dataKey] = data
  else options[dataKey] = {}
  //add session if we have one
  if(this.session.token) options[dataKey].$sessionToken = this.session.token
  //add basic auth if enabled
  if(this.basicAuth.username || this.basicAuth.password){
    options.auth = {
      username: this.basicAuth.username,
      password: this.basicAuth.password
    }
  }
  //set the local address if we have one
  if(this.localAddress) options.localAddress = this.localAddress
  //turn on json
  if(this.json && 'json' !== dataKey) options.json = true
  //set the url
  if(url) options.url = url
  debug('built options',options)
  return options
}


/**
 * Validate API Response
 * @param {string} verb
 * @param {string} path
 * @param {object} res
 * @param {object} body
 */
APIClient.prototype.validateResponse = function(verb,path,res,body){
  var that = this
  if('object' !== typeof body && this.json) body = JSON.parse(body)
  if(200 !== res.statusCode){
    throw new UserError(
      'Invalid response code (' + res.statusCode + ')' +
      ' to ' + verb + ' ' + that.baseURL + path)
  }
  if(body.error){
    if(body.error.message) throw new UserError(body.error.message)
    if(body.error) throw new UserError(body.error)
  }
}


/**
 * Make a get request
 * @param {string} path
 * @param {object} data
 * @return {P}
 */
APIClient.prototype.get = function(path,data){
  var that = this
  var url = that.baseURL + path
  var options = that.buildOptions('qs',data,url)
  debug('----> GET REQ',options.url)
  return request.getAsync(options)
    .spread(function(res,body){
      debug('<----GET RES',options.url,body)
      that.validateResponse('GET',path,res,body)
      return [res,body]
    })
    .catch(Error,function(err){
      if(err.message.match('connect'))
        throw new NetworkError(err.message)
      else throw err
    })
}


/**
 * Make a post request
 * @param {string} path
 * @param {object} data
 * @return {P}
 */
APIClient.prototype.post = function(path,data){
  var that = this
  var url = that.baseURL + path
  var options = that.buildOptions('json',data,url)
  debug('----> POST REQ',options.url)
  return request.postAsync(options)
    .spread(function(res,body){
      debug('<---- POST RES ',options.url,body)
      that.validateResponse('POST',path,res,body)
      return [res,body]
    })
    .catch(Error,function(err){
      if(err.message.match('connect'))
        throw new NetworkError(err.message)
      else throw err
    })
}


/**
 * Upload a file
 * @param {string} path
 * @param {string} filepath
 * @param {object} data
 * @return {P}
 */
APIClient.prototype.upload = function(path,filepath,data){
  var that = this
  var url = that.baseURL + path
  var options = that.buildOptions('qs',{},url)
  //add file
  options.formData = data || {}
  options.formData.file = fs.createReadStream(filepath)
  //make the request
  debug('----> UPLOAD REQ',options.url)
  return request.postAsync(options)
    .spread(function(res,body){
      debug('<---- UPLOAD RES',options.url,body)
      that.validateResponse('UPLOAD',path,res,body)
      return [res,body]
    })
    .catch(Error,function(err){
      if(err.message.match('connect'))
        throw new NetworkError(err.message)
      else throw err
    })
}


/**
 * Download content and respond with a stream
 * @param {string} path
 * @param {object} data
 * @return {request}
 */
APIClient.prototype.download = function(path,data){
  var that = this
  var url = that.baseURL + path
  var options = that.buildOptions('json',data,url)
  return request.post(options)
}


/**
 * Should put a readable stream
 * @param {string} path
 * @return {request}
 */
APIClient.prototype.put = function(path){
  var that = this
  var url = that.baseURL + path
  var options = that.buildOptions('qs',{},url)
  return request.put(options)
}


/**
 * Export Class
 * @type {APIClient}
 */
module.exports = APIClient
