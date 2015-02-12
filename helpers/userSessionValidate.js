'use strict';
var basicAuth = require('basic-auth-connect')
var debug = require('debug')('oose:userSessionValidate')
var oose = require('oose-sdk')

var api = require('../helpers/api')
var redis = require('../helpers/redis')
var NetworkError = oose.NetworkError
var UserError = oose.UserError

var config = require('../config')

var auth = basicAuth(config.prism.username,config.prism.password)


/**
 * Validate User Session Middleware
 * @param {object} req
 * @param {object} res
 * @param {function} next
 * @return {*}
 */
module.exports = function(req,res,next){
  var token = req.get(config.master.user.sessionTokenName) || ''
  debug('got token',token)
  //without a token lets try basic auth since it can override
  if(!token){
    auth(req,res,next)
  } else {
    var session
    redis.getAsync(redis.schema.userSession(token))
      .then(function(result){
        if('string' !== typeof token || 64 !== token.length)
          throw new UserError('Invalid session token passed')
        if(!result){
          debug('cache miss',token)
          var client = api.master()
          return client.postAsync({
            url: client.url('/user/session/validate'),
            json: {
              token: token,
              ip: req.ip
            }
          })
            .spread(function(res,body){
              if(!body)
                throw new UserError('Session doesnt exist')
              if('Session valid' !== body.success)
                throw new UserError('Invalid session')
              session = body.session
              return redis.setAsync(
                redis.schema.userSession(token),JSON.stringify(session))
                //.then(function(){
                //  var expiration = Math.ceil(
                //     (((+new Date(session.expires)) - (+new Date())) / 1000))
                //  redis.expireAsync(redis.schema.userSession(token),expiration)
                //})
            })
            .catch(client.handleNetworkError)
        } else {
          debug('cache hit',token)
          session = JSON.parse(result)
        }
      })
      .then(function(){
        req.session = session
        next()
      })
      .catch(SyntaxError,function(err){
        res.status(500)
        res.json({error: 'Failed to parse session record from redis: ' +
        err.message})
      })
      .catch(NetworkError,function(err){
        res.status(500)
        res.json({error: 'Failed to validate session: ' + err.message})
      })
      .catch(UserError,function(err){
        res.status(401)
        res.json({error: err.message})
      })
  }
}
