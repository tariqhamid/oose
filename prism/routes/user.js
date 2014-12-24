'use strict';
var P = require('bluebird')

var api = require('../../helpers/api')
var UserError = require('../../helpers/UserError')

var master = api.master()


/**
 * User Login
 * @param {object} req
 * @param {object} res
 */
exports.login = function(req,res){
  var data = req.body
  P.try(function(){
    if(data.$sessionToken) throw new UserError('Already logged in')
    return master.post(master.url('/user/login'),{
      username: req.body.username,
      password: req.body.password,
      ip: req.ip
    })
  })
    .spread(function(response,body){
      res.json(body)
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
    .catch(Error,function(err){
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
  var data = req.body
  P.try(function(){
    if(!data.$sessionToken) throw new UserError('No token provided')
    return master.post(master.url('/user/logout'),
      {token: data.$sessionToken, ip: req.ip})
  })
    .spread(function(response,body){
      res.json(body)
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Password reset
 * @param {object} req
 * @param {object} res
 */
exports.passwordReset = function(req,res){
  master.post(
    master.url('/user/password/reset'),
    {username: req.session.User.username}
  )
    .spread(function(response,body){
      res.json(body)
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Session validate
 * @param {object} req
 * @param {object} res
 */
exports.sessionValidate = function(req,res){
  //the middleware will have already validated us
  res.json({success: 'Session valid'})
}


/**
 * Session update
 * @param {object} req
 * @param {object} res
 */
exports.sessionUpdate = function(req,res){
  var data = req.body
  master.post(master.url('/user/session/update'),{
    token: req.session.token,
    ip: req.ip,
    data: data.data
  })
    .spread(function(response,body){
      res.json(body)
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}
