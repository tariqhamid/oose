'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')
var oose = require('oose-sdk')

var NotFoundError = oose.NotFoundError
var purchasePath = require('../../helpers/purchasePath')
var redis = require('../../helpers/redis')
var sha1File = require('../../helpers/hashFile')
var UserError = oose.UserError

//make some promises
P.promisifyAll(fs)


/**
 * Create purchase
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  redis.incr(redis.schema.counter('store','purchase:create'))
  var purchase
  var token = req.body.token || purchasePath.generateToken()
  var sha1 = req.body.hash
  var ext = req.body.ext
  //first check for the real file
  sha1File.find(sha1)
    .then(function(file){
      if(!file) throw new NotFoundError('File not found')
      if(file instanceof Array) throw new UserError('SHA1 is ambiguous')
      return purchasePath.create(token,file,ext)
    })
    .then(function(result){
      purchase = result
      purchase.success = 'Purchase created'
      res.json(purchase)
    })
    .catch(NotFoundError,function(err){
      redis.incr(redis.schema.counterError('store','purchase:create:notFound'))
      res.status(404)
      res.json({error: err.message})
    })
    .catch(UserError,function(err){
      redis.incr(redis.schema.counterError('store','purchase:create'))
      res.json({error: err.message})
    })
}


/**
 * Remove purchase
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  redis.incr(redis.schema.counter('store','purchase:remove'))
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
      res.json({success: 'Purchase removed'})
    })
    .catch(UserError,function(err){
      redis.incr(redis.schema.counterError('store','purchase:remove'))
      res.json({error: err.message})
    })
}
