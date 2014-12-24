'use strict';
var P = require('bluebird')

var purchasePath = require('../../helpers/purchasePath')
var redis = require('../../helpers/redis')
var UserError = require('../../helpers/UserError')


/**
 * Create purchase
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  var purchase = req.body.purchase
  var redisKey
  P.try(function(){
    if(64 !== purchase.token.length)
      throw new UserError('Invalid purchase token')
    redisKey = redis.schema.purchase(purchase.token)
    return redis.existsAsync(redisKey)
  })
    .then(function(result){
      if(result) throw new UserError('Purchase already exists')
      purchase.created = +new Date()
      purchase.updated = purchase.created
      return redis.setAsync(redisKey,JSON.stringify(purchase))
    })
    .then(function(){
      return redis.expireAsync(redisKey,purchase.life)
    })
    .then(function(){
      res.json(purchase)
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
  var token = req.body.purchase.token
  var redisKey = redis.schema.purchase(token)
  redis.getAsync(redisKey)
    .then(function(result){
      if(!result) throw new UserError('Purchase not found')
      res.json(JSON.parse(result))
    })
    .catch(SyntaxError,function(err){
      res.json({error: 'Couldnt parse JSON: ' + err.message})
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
  var data = req.body
  var token = data.token
  var purchase
  var redisKey = redis.schema.purchase(token)
  redis.getAsync(redisKey)
    .then(function(result){
      if(!result) throw new UserError('Purchase not found')
      purchase = JSON.parse(result)
      if(data.life) purchase.life = data.life
      purchase.updated = +new Date()
      return redis.setAsync(redisKey,JSON.stringify(purchase))
    })
    .then(function(){
      if(data.life)
        return redis.expireAsync(redisKey,data.life)
    })
    .then(function(){
      res.json(purchase)
    })
    .catch(SyntaxError,function(err){
      res.json({error: 'Couldnt parse JSON: ' + err.message})
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
  var redisKey = redis.schema.purchase(token)
  redis.delAsync(redisKey)
    .then(function(){
      res.json({
        token: token,
        count: 1,
        success: 'Purchase removed'
      })
    })
}
