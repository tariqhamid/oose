'use strict';
var request = require('request')
var logger = require('./logger').create('hideout')
var config = require('../config')


/**
 * Build request to hideout
 * @param {string} type
 * @param {string} key
 * @param {*} value
 * @return {{url: string, auth: {user: *, password: *}}}
 */
var buildRequest = function(type,key,value){
  var req = {
    method: 'POST',
    strictSSL: false,
    url: config.hideout.url + '/' + type,
    auth: {
      user: config.hideout.user,
      password: config.hideout.password
    }
  }
  if('get' === type || 'exists' === type){
    req.json = {
      key: key
    }
  }
  if('set' === type){
    req.json = {
      key: key,
      value: value
    }
  }
  return req
}


/**
 * Execute a request to hideout
 * @param {object} req
 * @param {function} done
 */
var executeRequest = function(req,done){
  request(req,function(err,res,body){
    if(err) return done(err)
    if(200 !== res.statusCode){
      logger.warning('Request failed unexpected status code ' + res.statusCode + ': ',req)
      return done('Unexpected status code from hideout ' + res.statusCode)
    }
    var result = body
    if('ok' !== result.status){
      logger.warning('Request failed, ' + result.message,req)
      return done(result.message)
    }
    done(null,result,body)
  })
}


/**
 * Check if a key exists
 * @param {string} key
 * @param {function} done
 */
exports.exists = function(key,done){
  var req = buildRequest('exists',key)
  executeRequest(req,function(err,result){
    if(err) return done(err)
    done(null,(result.exists === 1))
  })
}


/**
 * Get the value of a key
 * @param {string} key
 * @param {function} done
 */
exports.get = function(key,done){
  var req = buildRequest('get',key)
  executeRequest(req,function(err,result){
    if(err) return done(err)
    done(null,result)
  })
}


/**
 * Set a key to a value
 * @param {string} key
 * @param {*} value
 * @param {function} done
 */
exports.set = function(key,value,done){
  var req = buildRequest('set',key,value)
  executeRequest(req,function(err,result){
    if(err) return done(err)
    done(null,result)
  })
}
