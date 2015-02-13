'use strict';
var P = require('bluebird')
var oose = require('oose-sdk')

var redis = require('../../helpers/redis')
var UserError = oose.UserError

var config = require('../../config')


/**
 * Create purchase
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  redis.incr(redis.schema.counter('prism','purchase:create'))
  var purchase = req.body.purchase
  var redisKey, cacheKey
  P.try(function(){
    if(64 !== purchase.token.length)
      throw new UserError('Invalid purchase token')
    redisKey = redis.schema.purchase(purchase.token)
    cacheKey = redis.schema.purchaseCache(purchase.sha1,purchase.sessionToken)
    return redis.existsAsync(redisKey)
  })
    .then(function(result){
      if(result) throw new UserError('Purchase already exists')
      purchase.created = +new Date()
      purchase.updated = purchase.created
      return P.all([
        redis.setAsync(redisKey,JSON.stringify(purchase)),
        redis.setAsync(cacheKey,JSON.stringify(purchase))
      ])
    })
    .then(function(){
      return P.all([
        redis.expireAsync(redisKey,purchase.life),
        redis.expireAsync(cacheKey,config.prism.purchaseCache)
      ])
    })
    .then(function(){
      res.json(purchase)
    })
    .catch(UserError,function(err){
      redis.incr(redis.schema.counterError('prism','purchase:create'))
      res.json({error: err.message})
    })
}


/**
 * Find purchase
 * @param {object} req
 * @param {object} res
 */
exports.find = function(req,res){
  redis.incr(redis.schema.counter('prism','purchase:find'))
  var token = req.body.token
  var redisKey = redis.schema.purchase(token)
  redis.getAsync(redisKey)
    .then(function(result){
      if(!result) throw new UserError('Purchase not found')
      res.json(JSON.parse(result))
    })
    .catch(SyntaxError,function(err){
      redis.incr(redis.schema.counterError('prism','purchase:find:syntax'))
      res.json({error: 'Couldnt parse JSON: ' + err.message})
    })
    .catch(UserError,function(err){
      redis.incr(redis.schema.counterError('prism','purchase:find'))
      res.json({error: err.message})
    })
}


/**
 * Update purchase
 * @param {object} req
 * @param {object} res
 */
exports.update = function(req,res){
  redis.incr(redis.schema.counter('prism','purchase:update'))
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
      redis.incr(redis.schema.counterError('prism','purchase:update:syntax'))
      res.json({error: 'Couldnt parse JSON: ' + err.message})
    })
    .catch(UserError,function(err){
      redis.incr(redis.schema.counterError('prism','purchase:update'))
      res.json({error: err.message})
    })
}


/**
 * Remove purchase
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  redis.incr(redis.schema.counter('prism','purchase:remove'))
  var token = req.body.token
  var redisKey = redis.schema.purchase(token)
  var purchase
  redis.getAsync(redisKey)
    .then(function(result){
      purchase = JSON.parse(result)
      var promises = [redis.delAsync(redisKey)]
      if(purchase && purchase.sessionToken){
        var cacheKey = redis.schema.purchaseCache(
          purchase.sha1,purchase.sessionToken)
        promises.push(redis.delAsync(cacheKey))
      }
      return P.all(promises)
    })
    .then(function(){
      res.json({
        token: token,
        count: 1,
        success: 'Purchase removed'
      })
    })
}
