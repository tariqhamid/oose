'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')

var NotFoundError = require('../../helpers/NotFoundError')
var purchasePath = require('../../helpers/purchasePath')
var redis = require('../../helpers/redis')
var sha1File = require('../../helpers/sha1File')
var UserError = require('../../helpers/UserError')

//make some promises
P.promisifyAll(fs)


/**
 * Create purchase
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  var purchase
  var token = req.body.token || purchasePath.generateToken()
  var sha1 = req.body.sha1
  var life = req.body.life || 21600 //6 hours
  //first check for the real file
  sha1File.find(sha1)
    .then(function(file){
      if(!file) throw new NotFoundError('File not found')
      if(file instanceof Array) throw new UserError('SHA1 is ambiguous')
      return purchasePath.create(token,file)
    })
    .then(function(result){
      purchase = result
      purchase.life = life
      return redis.hmsetAsync(redis.schema.purchase(purchase.token),purchase)
    })
    .then(function(){
      return redis.expire(redis.schema.purchase(purchase.token),purchase.life)
    })
    .then(function(){
      purchase.success = 'Purchase created'
      res.json(purchase)
    })
    .catch(NotFoundError,function(err){
      res.status(404)
      res.json({error: err.message})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Find purchase
 * @param {object} req
 * @param {object} res
 */
exports.find = function(req,res){
  var token = req.body.token
  redis.hgetallAsync(redis.schema.purchase(token))
    .then(function(result){
      if(!result) throw new UserError('Purchase not found')
      res.json(result)
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Update purchase
 * @param {object} req
 * @param {object} res
 */
exports.update = function(req,res){
  var token = req.body.token
  var key = redis.schema.purchase(token)
  var purchase
  redis.hgetallAsync(key)
    .then(function(result){
      if(!result) throw new UserError('Purchase not found')
      purchase = result
      if(req.body.life) purchase.life = req.body.life
      if(req.body.ext) purchase.ext = req.body.ext
      return redis.hmsetAsync(key,purchase)
    })
    .then(function(){
      if(req.body.life) return redis.expireAsync(key,purchase.life)
    })
    .then(function(){
      res.json(purchase)
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Remove purchase
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  var token = req.body.token
  var key = redis.schema.purchase(token)
  var purchase
  redis.hgetallAsync(key)
    .then(function(result){
      if(!result) return
      purchase = result
      return purchasePath.remove(purchase.token,purchase.ext)
    })
    .then(function(){
      return redis.delAsync(key)
    })
    .then(function(){
      res.json({success: 'Purchase removed'})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}
