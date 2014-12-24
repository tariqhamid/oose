'use strict';
var debug = require('debug')('oose:userSessionValidate')

var api = require('../helpers/api')
var redis = require('../helpers/redis')
var UserError = require('../helpers/UserError')

var config = require('../config')


/**
 * Validate User Session Middleware
 * @param {object} req
 * @param {object} res
 * @param {function} next
 */
module.exports = function(req,res,next){
  var token = req.get('X-OOSE-Token') || ''
  var session
  redis.getAsync(redis.schema.userSession(token))
    .then(function(result){
      if('string' !== typeof token || 64 !== token.length)
        throw new UserError('Invalid session token passed')
      if(!result){
        debug('cache miss',token)
        var client = api.master()
        return client.post(client.url('/user/session/validate'),{
          token: token,
          ip: req.ip
        })
          .spread(function(res,body){
            if(!body)
              throw new UserError('Session doesnt exist')
            if('Session valid' !== body.success)
              throw new UserError('Invalid session')
            session = body.session
            return redis.setAsync(
              redis.schema.userSession(token),JSON.stringify(session))
          })
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
      res.json({err: 'Failed to parse session record from redis: ' +
        err.message})
    })
    .catch(UserError,function(err){
      res.status(401)
      res.json({err: err.message})
    })
}
