'use strict';
var P = require('bluebird')

var api = require('../../helpers/api')
var cradle = require('../../helpers/couchdb')
var redis = require('../../helpers/redis')

var NetworkError = oose.NetworkError
var UserError = oose.UserError

var config = require('../../config')


/**
 * User Login
 * @param {object} req
 * @param {object} res
 */
exports.login = function(req,res){
  redis.incr(redis.schema.counter('prism','user:login'))
  P.try(function(){
    if(req.get(config.master.user.sessionTokenName))
      throw new UserError('Already logged in')
    return master.postAsync({
      url: master.url('/user/login'),
      json: {
        username: req.body.username,
        password: req.body.password,
        ip: req.ip
      }
    })
  })
    .spread(function(response,body){
      res.json(body)
    })
    .catch(master.handleNetworkError)
    .catch(NetworkError,function(err){
      redis.incr(redis.schema.counterError('prism','user:login:network'))
      res.status(500)
      res.json({error: 'Failed to login: ' + err.message})
    })
    .catch(UserError,function(err){
      redis.incr(redis.schema.counterError('prism','user:login'))
      res.json({error: err.message})
    })
    .catch(Error,function(err){
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
  master.postAsync({
    url: master.url('/user/logout'),
    json: {
      token: req.session.token,
      ip: req.ip
    }
  })
    .spread(function(response,body){
      res.json(body)
    })
    .catch(master.handleNetworkError)
    .catch(NetworkError,function(err){
      redis.incr(redis.schema.counterError('prism','user:logout:network'))
      res.status(500)
      res.json({error: 'Failed to logout: ' + err.message})
    })
    .catch(UserError,function(err){
      redis.incr(redis.schema.counterError('prism','user:logout'))
      res.json({error: err.message})
    })
}


/**
 * Password reset
 * @param {object} req
 * @param {object} res
 */
exports.passwordReset = function(req,res){
  redis.incr(redis.schema.counter('prism','user:passwordReset'))
  master.postAsync({
    url: master.url('/user/password/reset'),
    json: {username: req.session.User.username}
  })
    .spread(function(response,body){
      res.json(body)
    })
    .catch(master.handleNetworkError)
    .catch(NetworkError,function(err){
      redis.incr(redis.schema.counterError('prism','user:passwordReset:network'))
      res.status(500)
      res.json({error: 'Failed to reset password: ' + err.message})
    })
    .catch(UserError,function(err){
      redis.incr(redis.schema.counterError('prism','user:passwordReset'))
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


/**
 * Session update
 * @param {object} req
 * @param {object} res
 */
exports.sessionUpdate = function(req,res){
  redis.incr(redis.schema.counter('prism','user:sessionUpdate'))
  var data = req.body
  master.postAsync({
    url: master.url('/user/session/update'),json: {
      token: req.session.token,
      ip: req.ip,
      data: data.data
    }
  })
    .spread(function(response,body){
      res.json(body)
    })
    .catch(master.handleNetworkError)
    .catch(NetworkError,function(err){
      redis.incr(redis.schema.counterError('prism','user:sessionUpdate:network'))
      res.status(500)
      res.json({error: 'Failed to update session: ' + err.message})
    })
    .catch(UserError,function(err){
      redis.incr(redis.schema.counterError('prism','user:sessionUpdate'))
      res.json({error: err.message})
    })
}
