'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')

var NotFoundError = require('../../helpers/NotFoundError')
var PurchasePath = require('../../helpers/PurchasePath')
var redis = require('../../helpers/redis')
var SHA1File = require('../../helpers/SHA1File')
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
  var life = req.body.life || 21600 //6 hours
  //first check for the real file
  SHA1File.find(req.body.sha1)
    .then(function(file){
      if(!file) throw new NotFoundError('File not found')
      if(file instanceof Array) throw new UserError('SHA1 is ambiguous')
      return PurchasePath.create(file)
    })
    .then(function(result){
      purchase = result
      purchase.life = life
      return redis.hmsetAsync(PurchasePath.redisKey(purchase.token),purchase)
    })
    .then(function(){
      return redis.expire(PurchasePath.redisKey(purchase.token),purchase.life)
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
  redis.hgetallAsync(PurchasePath.redisKey(token))
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
  var key = PurchasePath.redisKey(token)
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
  var key = PurchasePath.redisKey(token)
  var purchase
  redis.hgetallAsync(key)
    .then(function(result){
      if(!result) throw new UserError('Purchase not found')
      purchase = result
      return PurchasePath.remove(purchase.token,purchase.ext)
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
