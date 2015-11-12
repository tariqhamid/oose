'use strict';
var P = require('bluebird')
var request = require('request')

var redis = require('../../helpers/redis')

var config = require('../../config')
var couchLoginUrl =
  config.couchdb.options.secure ? 'https://' : 'http://' +
  config.couchdb.host + ':' +
  config.couchdb.port + '/_session'

//make some promises
P.promisifyAll(request)


/**
 * User Login
 * @param {object} req
 * @param {object} res
 */
exports.login = function(req,res){
  redis.incr(redis.schema.counter('prism','user:login'))
  var sessionToken
  //make a login request to couch db
  request.postAsync({
    url: couchLoginUrl,
    json: {
      name: req.body.username,
      password: req.body.password
    }
  })
    .spread(function(res,body){
      console.log(res,body)
      //i would think we are going to get a 403 for bad logins and then 200
      //for good logins, we will find out
      if(200 !== res.statusCode)
        throw new Error('Invalid login response ' + res.statusCode)
      //need our session token from the session
      if(!res.headers['Set-Cookie'])
        throw new Error('No cookie sent in response')
      //now i think we need to query the session itself
      sessionToken = res.headers['Set-Cookie']
      return request.postAsync({
        url: couchLoginUrl,
        json: true,
        headers: {
          Cookie: sessionToken
        }
      })
    })
    .spread(function(res,body){
      console.log(res,body)
      if(200 !== res.statusCode)
        throw new Error('Failed to query session information ' + body.toJSON())
      res.json({
        token: sessionToken,
        ip: req.ip,
        data: body
      })
    })
    .catch(function(err){
      redis.incr(redis.schema.counterError('prism','user:login:invalid'))
      if(!err.message.match('invalid user or password')) throw err
      res.json({error: 'Invalid username or password to master'})
    })
}


/**
 * User Logout
 * @param {object} req
 * @param {object} res
 */
exports.logout = function(req,res){
  redis.incr(redis.schema.counter('prism','user:logout'))
  //make a login request to couch db
  request.deleteAsync({
    url: couchLoginUrl,
    json: true,
    headers: {
      Cookie: req.session.token
    }
  })
    .spread(function(response,body){
      res.json(body)
    })
    .catch(function(err){
      redis.incr(redis.schema.counterError('prism','user:logout'))
      res.json({error: err.message})
    })
}


/**
 * Session validate
 * @param {object} req
 * @param {object} res
 */
exports.sessionValidate = function(req,res){
  redis.incr(redis.schema.counter('prism','user:sessionValidate'))
  //the middleware will have already validated us
  res.json({success: 'Session valid'})
}
