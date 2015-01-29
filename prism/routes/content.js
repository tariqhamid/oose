'use strict';
var P = require('bluebird')
var Busboy = require('busboy')
var debug = require('debug')('oose:prism:content')
var fs = require('graceful-fs')
var mime = require('mime')
var oose = require('oose-sdk')
var path = require('path')
var promisePipe = require('promisepipe')
var request = require('request')
var sha1stream = require('sha1-stream')
var temp = require('temp')

var api = require('../../helpers/api')
var NetworkError = oose.NetworkError
var NotFoundError = oose.NotFoundError
var prismBalance = require('../../helpers/prismBalance')
var promiseWhile = require('../../helpers/promiseWhile')
var purchasePath = require('../../helpers/purchasePath')
var redis = require('../../helpers/redis')
var sha1File = require('../../helpers/sha1File')
var storeBalance = require('../../helpers/storeBalance')
var UserError = oose.UserError

var config = require('../../config')
var master = api.master()

//make some promises
P.promisifyAll(temp)

var nullFunction = function(){}


/**
 * Send a file to prism
 * @param {string} tmpfile
 * @param {string} sha1
 * @param {string} extension
 * @return {P}
 */
var sendToPrism = function(tmpfile,sha1,extension){
  var prismList
  var winners = []
  //actually stream the file to new peers
  return prismBalance.prismList()//pick first winner
    .then(function(result){
      prismList = result
      return prismBalance.winner('newFile',prismList)
    })
    //pick second winner
    .then(function(result){
      if(!result){
        throw new UserError('Failed to find a prism ' +
        'instance to upload to')
      }
      winners.push(result)
      return prismBalance.winner('newFile',prismList,[result.name])
    })
    //stream the file to winners
    .then(function(result){
      if(result) winners.push(result)
      var readStream = fs.createReadStream(tmpfile)
      var promises = []
      var client
      for(var i = 0; i < winners.length; i++){
        client = api.prism(winners[i])
        promises.push(promisePipe(
          readStream,
          client.put(client.url('/content/put/' + sha1 + '.' + extension))
        ))
      }
      return P.all(promises)
    })
    .then(function(){
      //kill the content existence cache
      return prismBalance.invalidateContentExists(sha1)
    })
}


/**
 * Upload file
 * @param {object} req
 * @param {object} res
 */
exports.upload = function(req,res){
  var data = {}
  var files = {}
  var filePromises = []
  var busboy = new Busboy({
    headers: req.headers,
    highWaterMark: 65536, //64K
    limits: {
      fileSize: 2147483648000 //2TB
    }
  })
  busboy.on('field',function(key,value){
    data[key] = value
  })
  busboy.on('file',function(key,file,name,encoding,mimetype){
    var tmpfile = temp.path({prefix: 'oose-' + config.prism.name + '-'})
    var sniff = sha1stream.createStream()
    var writeStream = fs.createWriteStream(tmpfile)
    files[key] = {
      key: key,
      tmpfile: tmpfile,
      name: name,
      encoding: encoding,
      mimetype: mimetype,
      ext: mime.extension(mimetype),
      sha1: null
    }
    filePromises.push(
      P.try(function(){
        return promisePipe(file,sniff,writeStream)
      })
        .then(function(){
          files[key].sha1 = sniff.sha1
          //do a content lookup and see if this exists yet
          return prismBalance.contentExists(sniff.sha1)
        })
        .then(function(result){
          if(!result.exists && 0 === result.count){
            return sendToPrism(tmpfile,sniff.sha1,files[key].ext)
          }
          //got here? file already exists on cluster so we are done
        })
    )
  })
  busboy.on('finish',function(){
    P.all(filePromises)
      .then(function(){
        res.json({success: 'File(s) uploaded',data: data,files: files})
      })
      .catch(function(err){
        res.json({error: err.message})
      })
      //destroy all the temp files from uploading
      .finally(function(){
        var keys = Object.keys(files)
        var promises = []
        var file
        for(var i = 0; i < keys.length; i++){
          file = files[keys[i]]
          if(fs.existsSync(file.tmpfile))
            promises.push(fs.unlinkAsync(file.tmpfile))
        }
        return P.all(promises)
      })
  })
  req.pipe(busboy)
}


/**
 * Retrieve a file from a remote server for import
 * @param {object} req
 * @param {object} res
 */
exports.retrieve = function(req,res){
  var retrieveRequest = req.body.request
  var extension = req.body.extension || 'bin'
  var tmpfile = temp.path({prefix: 'oose-' + config.prism.name + '-'})
  var sniff = sha1stream.createStream()
  var sha1
  var writeStream = fs.createWriteStream(tmpfile)
  P.try(function(){
    return promisePipe(request(retrieveRequest),sniff,writeStream)
  })
    .then(function(){
      sha1 = sniff.sha1
      //do a content lookup and see if this exists yet
      return prismBalance.contentExists(sha1)
    })
    .then(function(result){
      if(!result.exists && 0 === result.count){
        return sendToPrism(tmpfile,sha1,extension)
      }
      //got here? file already exists on cluster so we are done
    })
    .then(function(){
      return fs.unlinkAsync(tmpfile)
    })
    .then(function(){
      res.json({
        sha1: sha1,
        extension: extension
      })
    })
    .catch(NetworkError,function(err){
      res.status(500)
      res.json({
        error: 'Failed to check content existence: ' + err.message
      })
    })
    .finally(function(){
      if(fs.existsSync(tmpfile))
        return fs.unlinkAsync(tmpfile)
    })
}


/**
 * Put a file directly to a prism for distribution to a store
 * @param {object} req
 * @param {object} res
 */
exports.put = function(req,res){
  var file = req.params.file
  var storeList
  master.postAsync({
    url: master.url('/store/list'),
    json: {prism: config.prism.name}
  })
    .spread(function(res,body){
      storeList = body.store
      return storeBalance.winner(storeList)
    })
    .then(function(result){
      if(!result) throw new UserError('No suitable store instance found')
      var client = api.store(result)
      var dest = client.put(client.url('/content/put/' + file))
      return promisePipe(req,dest)
    })
    .then(function(){
      res.status(201)
      res.json({success: 'File uploaded', file: file})
    })
    .catch(master.handleNetworkError)
    .catch(UserError,NetworkError,function(err){
      res.status(500)
      res.json({error: err.message})
    })
}


/**
 * Check for existence across the platform
 * @param {object} req
 * @param {object} res
 */
exports.exists = function(req,res){
  var prismList
  var sha1 = req.body.sha1
  P.try(function(){
    if(!sha1File.validate(sha1))
      throw new UserError('Invalid SHA1 passed for existence check')
    //get a list of store instances we own
    return prismBalance.prismList()
  })
    .then(function(result){
      prismList = result
      var promises = []
      var prism
      var checkExistence = function(prism){
        var client = api.prism(prism)
        return client.postAsync({
          url: client.url('/content/exists/local'),
          json: {sha1: sha1},
          timeout: 2000
        })
          .spread(function(res,body){
            return {prism: prism.name, exists: body}
          })
          .catch(client.handleNetworkError)
          .catch(NetworkError,function(){
            return {
              prism: prism.name,
              exists: {
                exists: false,
                count: 0,
                map: {}
              }
            }
          })
      }
      for(var i = 0; i < prismList.length; i++){
        prism = prismList[i]
        promises.push(checkExistence(prism))
      }
      return P.all(promises)
    })
    .then(function(results){
      var map = {}
      var exists = false
      var count = 0
      var row
      for(var i = 0; i < results.length; i++){
        row = results[i]
        if(row.exists.exists){
          exists = true
          count += row.exists.count
        }
        map[row.prism] = row.exists
      }
      var result = {sha1: sha1, exists: exists, count: count, map: map}
      res.json(result)
    })
    .catch(UserError,NetworkError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Check if content exists
 * @param {object} req
 * @param {object} res
 */
exports.existsLocal = function(req,res){
  var storeList
  var sha1 = req.body.sha1
  //get a list of store instances we own
  prismBalance.storeListByPrism(config.prism.name)
    .then(function(result){
      storeList = result
      var promises = []
      var store
      var checkExistence = function(store){
        var client = api.store(store)
        return client.postAsync({
          url: client.url('/content/exists'),
          json: {sha1: sha1},
          timeout: 2000
        })
          .spread(function(res,body){
            return {store: store.name, exists: body.exists}
          })
          .catch(client.handleNetworkError)
          .catch(NetworkError,function(){
            return {store: store.name, exists: false}
          })
      }
      for(var i = 0; i < storeList.length; i++){
        store = storeList[i]
        promises.push(checkExistence(store))
      }
      return P.all(promises)
    })
    .then(function(results){
      var map = {}
      var exists = false
      var count = 0
      var row
      for(var i = 0; i < results.length; i++){
        row = results[i]
        if(row.exists){
          exists = true
          count++
        }
        map[row.store] = row.exists
      }
      res.json({exists: exists, count: count, map: map})
    })
    .catch(UserError,NetworkError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Invalidate existence cache cluster wide
 * @param {object} req
 * @param {object} res
 */
exports.existsInvalidate = function(req,res){
  var sha1 = req.body.sha1
  prismBalance.prismList()
    .then(function(result){
      var promises = []
      var client
      for(var i = 0; i < result.length; i++){
        client = api.prism(result[i])
        promises.push(
          client.postAsync({
            url: client.url('/content/exists/invalidate/local'),
            json: {sha1: sha1}
          })
            .catch(client.handleNetworkError)
            .catch(NetworkError,nullFunction)
        )
      }
      return P.all(promises)
    })
    .then(function(){
      res.json({success: 'Cleared', sha1: sha1})
    })
    .catch(UserError,NetworkError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Invalidate existence cache locally
 * @param {object} req
 * @param {object} res
 */
exports.existsInvalidateLocal = function(req,res){
  var sha1 = req.body.sha1
  redis.delAsync(redis.schema.contentExists(sha1))
    .then(function(){
      res.json({success: 'Cleared', sha1: sha1})
    })
}


/**
 * Get content detail
 * @param {object} req
 * @param {object} res
 */
exports.detail = function(req,res){
  var sha1 = req.body.sha1
  P.try(function(){
    if(!sha1File.validate(sha1))
      throw new UserError('Invalid SHA1 passed for content detail')
    return prismBalance.contentExists(req.body.sha1)
  })
    .then(function(result){
      res.json(result)
    })
    .catch(NotFoundError,function(err){
      res.status(404)
      res.json({error: err.message})
    })
    .catch(NetworkError,function(err){
      res.status(502)
      res.json({error: err.message})
    })
    .catch(UserError,function(err){
      res.status(500)
      res.json({error: err.message})
    })
}


/**
 * Download purchased content
 * @param {object} req
 * @param {object} res
 */
exports.download = function(req,res){
  var sha1 = req.body.sha1
  var winner, exists
  prismBalance.contentExists(sha1)
    .then(function(result){
      exists = result
      if(!exists && !exists.exists)
        throw new NotFoundError('File not found')
      return storeBalance.winnerFromExists(sha1,exists)
    })
    .then(function(result){
      winner = result
      var store = api.store(winner)
      return store.postAsync(store.url('/ping'))
        .then(function(){
          var req = store.post({
            url: store.url('/content/download'),
            json: {sha1: sha1}
          })
          req.on('error',function(err){
            if(!(err instanceof Error)) err = new Error(err)
            store.handleNetworkError(err)
          })
          req.pipe(res)
        })
    })
    .catch(NetworkError,function(){
      return storeBalance.winnerFromExists(sha1,exists,[winner.name])
        .then(function(result){
          winner = result
          var store = api.store(winner)
          return store.postAsync(store.url('/ping'))
            .then(function(){
              store.post({
                url: store.url('/content/download'),
                json: {sha1: sha1}
              }).pipe(res)
            })
        })
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
 * Purchase content
 * @param {object} req
 * @param {object} res
 */
exports.purchase = function(req,res){
  var ip = req.body.ip || req.ip || '127.0.0.1'
  var sha1 = req.body.sha1
  var referrer = req.body.referrer
  var life = req.body.life || config.prism.purchaseLife
  var token, map, purchase
  var cacheKey = redis.schema.purchaseCache(sha1,req.session.token)
  P.try(function(){
    if(!sha1File.validate(sha1))
      throw new UserError('Invalid SHA1 passed for purchase')
    //check if we have cache first
    return redis.getAsync(cacheKey)
  })
    .then(function(result){
      if(result){
        debug('cache hit',cacheKey)
        purchase = JSON.parse(result)
      } else {
        debug('cache miss',cacheKey)
        return prismBalance.contentExists(sha1)
          .then(function(result){
            map = result
            if(!map.exists) throw new NotFoundError('File not found')
            //really right here we need to generate a unique token
            // (unique meaning not already in the redis registry for purchases
            // since we already have a token then we should just try
            var tokenExists = true
            return promiseWhile(
              function(){
                return !!tokenExists
              },
              function(){
                token = purchasePath.generateToken()
                return redis.existsAsync(redis.schema.purchase(token))
                  .then(function(result){
                    tokenExists = result
                  })
              }
            )
          })
          .then(function(){
            //now we know our token so register it on the store instances
            //this means iterating the existence map
            return storeBalance.populateStores(storeBalance.existsToArray(map))
          })
          .then(function(stores){
            var createPurchase = function(store){
              var client = api.store(store)
              return client
                .postAsync({
                  url: client.url('/purchase/remove'),
                  json: {token: token}
                })
                .spread(function(){
                  return client.postAsync({
                    url: client.url('/purchase/create'),
                    json: {
                      sha1: sha1,
                      token: token,
                      life: life
                    }
                  })
                })
                .catch(client.handleNetworkError)
                .catch(NetworkError,nullFunction)
            }
            var promises = []
            for(var i = 0; i < stores.length; i++){
              promises.push(createPurchase(stores[i]))
            }
            return P.all(promises)
              .then(function(results){
                var ext
                for(var i = 0; i < results.length; i++){
                  if(!ext && results[i] && results[i][1] && results[i][1].ext){
                    ext = results[i][1].ext
                    break
                  }
                }
                return ext
              })
          })
          .then(function(ext){
            //now create our purchase object
            purchase = {
              sha1: sha1,
              life: life,
              token: token,
              sessionToken: req.session.token,
              map: map,
              ext: ext,
              ip: ip,
              referrer: referrer
            }
            //okay so the purchase is registered on all our stores
            //time to register it to all the prisms
            return prismBalance.prismList()
          })
          .then(function(result){
            var createPurchase = function(prism){
              var client = api.prism(prism)
              return client
                .postAsync({
                  url: client.url('/purchase/remove'),
                  json: {token: token}
                })
                .spread(function(){
                  return client.postAsync({
                    url: client.url('/purchase/create'),
                    json: {purchase: purchase}
                  })
                })
                .catch(client.handleNetworkError)
                .catch(NetworkError,nullFunction)
            }
            var prismList = result
            var promises = []
            for(var i = 0; i < prismList.length; i++){
              promises.push(createPurchase(prismList[i]))
            }
            return P.all(promises)
          })
      }
    })
    .then(function(){
      res.json(purchase)
    })
    .catch(NetworkError,function(err){
      res.status(500)
      res.json({error: 'Failed to check existence: ' + err.message})
    })
    .catch(NotFoundError,function(err){
      res.status(404)
      res.json({error: err})
    })
    .catch(UserError,function(err){
      res.json({error: err})
    })
}


/**
 * Content delivery
 * @param {object} req
 * @param {object} res
 */
exports.deliver = function(req,res){
  var token = req.params.token
  var filename = req.params.filename
  var redisKey = redis.schema.purchase(token)
  var purchase
  redis.getAsync(redisKey)
    .then(function(result){
      if(!result) throw new NotFoundError('Purchase not found')
      purchase = JSON.parse(result)
      //if(purchase.ip !== req.ip) throw new UserError('Invalid request')
      var validReferrer = false
      var referrer = req.get('Referrer')
      for(var i = 0; i < purchase.referrer.length; i++){
        if(referrer.match(purchase.referrer[i])) validReferrer = true
      }
      if(!validReferrer) throw new UserError('Invalid request')
      //we have a purchase so now... we need to pick a store....
      return storeBalance.winnerFromExists(token,purchase.map)
    })
    .then(function(result){
      var url = 'http://' + result.name + '.' + config.domain +
        '/' + token + '/' + filename
      res.redirect(302,url)
    })
    .catch(SyntaxError,function(err){
      res.status(500)
      res.json({error: 'Failed to parse purchase: ' + err.message})
    })
    .catch(NotFoundError,function(err){
      res.status(404)
      res.json({error: err.message})
    })
    .catch(UserError,function(err){
      res.status(500)
      res.json({error: err.message})
    })
}


/**
 * Static content (no purchase required)
 * @param {object} req
 * @param {object} res
 */
exports.contentStatic = function(req,res){
  var sha1 = req.params.sha1
  var filename = req.params.filename
  var ext = path.extname(filename).replace('.','')
  prismBalance.contentExists(sha1)
    .then(function(result){
      if(!result.exists) throw new NotFoundError('Content doesnt exist')
      if(config.prism.denyStaticTypes.indexOf(ext) >= 0)
        throw new UserError('Invalid static file type')
      return storeBalance.winnerFromExists(sha1,result)
    })
    .then(function(result){
      var url = 'http://' + result.name + '.' + config.domain +
        '/static/' + sha1File.toRelativePath(sha1,ext)
      res.redirect(302,url)
    })
    .catch(NetworkError,function(err){
      res.status(500)
      res.json({
        error: 'Failed to check existence: ' + err.message
      })
    })
    .catch(NotFoundError,function(err){
      res.status(404)
      res.json({error: err.message})
    })
    .catch(UserError,function(err){
      res.status(500)
      res.json({error: err.message})
    })
}


/**
 * Remove purchase cluster wide
 * @param {object} req
 * @param {object} res
 */
exports.purchaseRemove = function(req,res){
  var token = req.body.token
  var redisKey = redis.schema.purchase(token)
  var prismList
  var purchase
  redis.getAsync(redisKey)
    .then(function(result){
      if(!result){
        res.json({token: token, count: 0, success: 'Purchase removed'})
      } else {
        purchase = JSON.parse(result)
        return storeBalance.populateStores(
          storeBalance.existsToArray(purchase.map)
        )
      }
    })
    .then(function(stores){
      var promises = []
      var client
      for(var i = 0; i < stores.length; i++){
        client = api.store(stores[i])
        promises.push(
          client.postAsync({
            url: client.url('/purchase/remove'),
            json: {token: token}
          })
        )
      }
      return P.all(promises)
    })
    .then(function(){
      return prismBalance.prismList()
    })
    .then(function(result){
      prismList = result
      var promises = []
      var client
      for(var i = 0; i < prismList.length; i++){
        client = api.prism(prismList[i])
        promises.push(
          client.postAsync({
            url: client.url('/purchase/remove'),
            json: {token: token, sessionToken: req.session.token}
          })
        )
      }
      return P.all(promises)
    })
    .then(function(){
      res.json({token: token, count: 1, success: 'Purchase removed'})
    })
}
