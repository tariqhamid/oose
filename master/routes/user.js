'use strict';
var oose = require('oose-sdk')

var sequelize = require('../helpers/sequelize')()
var UserError = oose.UserError

var User = sequelize.models.User
var UserSession = sequelize.models.UserSession


/**
 * User find
 * @param {object} req
 * @param {object} res
 */
exports.find = function(req,res){
  var data = req.body
  User.find({where: {username: data.username}})
    .then(function(result){
      if(!result) throw new UserError('No user found')
      var values = result.dataValues
      delete values.password
      res.json(values)
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Create User
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  var data = req.body
  var password = User.generatePassword()
  User.create({
    username: data.username,
    password: password
  })
    .then(function(result){
      res.json({
        success: 'User created',
        id: result.id,
        password: password
      })
    })
    .catch(sequelize.ValidationError,function(err){
      res.json({error: sequelize.validationErrorToString(err)})
    })
    .catch(sequelize.UniqueConstraintError,function(){
      res.json({error: 'Username already exists'})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Update a user
 * @param {object} req
 * @param {object} res
 */
exports.update = function(req,res){
  var data = req.body
  User.find({
    where: {username: data.username}
  })
    .then(function(result){
      if(!result) throw new UserError('No user found for update')
      result.active = !!data.active
      return result.save()
    })
    .then(function(){
      res.json({success: 'User updated'})
    })
    .catch(sequelize.ValidationError,function(err){
      res.json({error: sequelize.validationErrorToString(err)})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Reset a users password
 * @param {object} req
 * @param {object} res
 */
exports.passwordReset = function(req,res){
  var data = req.body
  var password = User.generatePassword()
  User.find({
    where: {username: data.username}
  })
    .then(function(result){
      if(!result) throw new UserError('No user found for password reset')
      result.password = password
      return result.save()
    })
    .then(function(){
      res.json({success: 'User password reset', password: password})
    })
    .catch(sequelize.ValidationError,function(err){
      res.json({error: sequelize.validationErrorToString(err)})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Log a user in
 * @param {object} req
 * @param {object} res
 */
exports.login = function(req,res){
  var data = req.body
  User.login(data.username,data.password,data.ip)
    .then(function(user){
      //create a session
      return UserSession.create({
        token: UserSession.generateToken(),
        ip: data.ip,
        UserId: user.id
      })
    })
    .then(function(session){
      res.json({success: 'User logged in', session: session.dataValues})
    })
    .catch(sequelize.ValidationError,function(err){
      res.json({error: sequelize.validationErrorToString(err)})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Log a user out
 * @param {object} req
 * @param {object} res
 */
exports.logout = function(req,res){
  var data = req.body
  UserSession.find({where: {token: data.token, ip: data.ip}})
    .then(function(session){
      if(!session) throw new UserError('Session not found')
      return session.destroy()
    })
    .then(function(){
      res.json({success: 'User logged out'})
    })
    .catch(sequelize.ValidationError,function(err){
      res.json({error: sequelize.validationErrorToString(err)})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Find a session
 * @param {object} req
 * @param {object} res
 */
exports.sessionFind = function(req,res){
  var data = req.body
  UserSession.find({where: {token: data.token, ip: data.ip}, include: [User]})
    .then(function(session){
      if(!session) throw new UserError('Session could not be found')
      if((+session.expires) < (+new Date())){
        throw new UserError('Session has expired')
      }
      res.json({success: 'Session valid', session: session.dataValues})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Update session data
 * @param {object} req
 * @param {object} res
 */
exports.sessionUpdate = function(req,res){
  var data = req.body
  UserSession.find({where: {token: data.token, ip: data.ip}})
    .then(function(session){
      if(!session) throw new UserError('Session could not be found')
      if((+session.expires) < (+new Date())){
        throw new UserError('Session has expired')
      }
      if(data.data) session.data = JSON.stringify(data.data)
      return session.save()
    })
    .then(function(session){
      res.json({success: 'Session updated', session: session})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Remove a user
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  var data = req.body
  User.destroy({where: {username: data.username}})
    .then(function(count){
      res.json({success: 'User removed', count: count})
    })
}
