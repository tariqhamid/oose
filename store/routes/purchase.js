'use strict';
var purchasedb = require('../../helpers/purchasedb')
var hashFile = require('../../helpers/hashFile.js')
var redis = require('../../helpers/redis.js')


//var config = require('../../config')


/**
 * Map a purchase token to a usable URI
 * @param {object} req
 * @param {object} res
 */
exports.uri = function(req,res){
  var purchaseCacheCheck = function(token){
    var purchaseUri = ''
    var redisKey = redis.schema.purchaseCacheInternal(token)
    return redis.getAsync(redisKey)
      .then(function(result){
        if(!result){
          //build cache
          return purchasedb.get(token)
            .then(function(result){
              if(result && result.expirationDate >= (+new Date())){
                purchaseUri = '/../content/' +
                  hashFile.toRelativePath(result.hash,result.ext)
              } else{
                purchaseUri = '/404'
              }
              return redis.setAsync(redisKey,purchaseUri)
            })
            .then(function(){
              return redis.expireAsync(redisKey,900)
            })
            .then(function(){
              return purchaseUri
            })
        } else {
          return result
        }
      })
      .catch(function(err){
        console.log(err,err.stack)
        return '/500'
      })
  }
  var token = req.params.token
  purchaseCacheCheck(token)
    .then(function(result){
      if('/404' === result) res.status(404)
      if('/403' === result) res.status(403)
      if('/500' === result) res.status(500)
      res.send(result)
    })
}
