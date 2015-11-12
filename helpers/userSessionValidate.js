'use strict';
var P = require('bluebird')
var basicAuth = require('basic-auth-connect')
var debug = require('debug')('oose:userSessionValidate')
var request = require('request')

var redis = require('../helpers/redis')

var config = require('../config')
var couchLoginUrl =
  config.couchdb.options.secure ? 'https://' : 'http://' +
  config.couchdb.host + ':' +
  config.couchdb.port + '/_session'

var auth = basicAuth(config.prsm.username,config.prism.password)

//make some promises
P.promisifyAll(request)


/**
 * Validate User Session Middleware
 * @param {object} req
 * @param {object} res
 * @param {function} next
 * @return {*}
 */
module.exports = function(req,res,next){
  var token = req.get(config.master.user.sessionTokenName) || ''
  var session
  debug('got token',token)
  //without a token lets try basic auth since it can override
  if(!token){
    redis.incr(redis.schema.counter('prism','userSessionValidate:basic'))
    auth(req,res,next)
  } else {
    redis.incr(redis.schema.counter('prism','userSessionValidate:full'))
    //now i think we need to query the session itself
    request.postAsync({
      url: couchLoginUrl,
      json: true,
      headers: {
        Cookie: token
      }
    })
      .spread(function(res,body){
        console.log(res,body)
        if(200 !== res.statusCode){
          throw new Error(
            'Failed to query session information ' + body.toJSON())
        }
        session = {
          token: token,
          ip: req.ip,
          data: body
        }
        redis.incr(redis.schema.counter('prism','userSession:' + session.token))
        req.session = session
        next()
      })
      .catch(function(err){
        redis.incr(redis.schema.counterError('prism','userSessionValidate'))
        res.status(401)
        res.json({error: err.message})
      })
  }
}
