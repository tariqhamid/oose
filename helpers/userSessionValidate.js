'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:userSessionValidate')

var api = require('../helpers/api')
var UserError = require('../helpers/UserError')

var config = require('../config')

var cache = {}


/**
 * Validate User Session Middleware
 * @param {object} req
 * @param {object} res
 * @param {function} next
 */
module.exports = function(req,res,next){
  var token = req.body.$sessionToken || req.query.$sessionToken || ''
  P.try(function(){
    if('string' !== typeof token || 64 !== token.length)
      throw new UserError('Invalid session token passed')
    if(cache[token] && cache[token].expires >= +new Date()){
      debug('cache hit',token)
      return new P(function(resolve){
        process.nextTick(function(){
          resolve(cache[token].session)
        })
      })
    } else {
      debug('cache miss',token)
      return api.master.post('/user/session/validate',{
        token: token,
        ip: req.ip
      })
        .spread(function(res,body){
          if(!body)
            throw new UserError('Session doesnt exist')
          if('Session valid' !== body.success)
            throw new UserError('Invalid session')
          cache[token] = {
            session: body.session,
            expires: +new Date() + (config.prism.userSessionCache * 1000)
          }
          return cache[token].session
        })
    }
  })
    .then(function(session){
      req.session = session
      next()
    })
    .catch(UserError,function(err){
      res.status(401)
      res.json({err: err.message})
    })
}
