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
var retry = require('bluebird-retry')
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
//var master = api.master()

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
      debug('new file winners',sha1,winners)
      var thenReturn = function(val){return val}
      var handleError = function(err){throw new UserError(err.message)}
      var readStream = fs.createReadStream(tmpfile)
      var promises = []
      var client
      for(var i = 0; i < winners.length; i++){
        client = api.prism(winners[i])
        promises.push(
          promisePipe(
            readStream,
            client.put(client.url('/content/put/' + sha1 + '.' + extension))
          )
            .then(thenReturn,handleError)
        )
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
  redis.incr(redis.schema.counter('prism','content:upload'))
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
    redis.incr(redis.schema.counter('prism','content:filesUploaded'))
    var tmpfile = temp.path({prefix: 'oose-' + config.prism.name + '-'})
    var sniff = sha1stream.createStream()
    sniff.on('data',function(chunk){
      redis.incrby(
        redis.schema.counter('prism','content:bytesUploaded'),chunk.length)
    })
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
          .then(
            function(val){return val},
            function(err){throw new UserError(err.message)}
          )
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
        redis.incr(redis.schema.counterError('prism','content:upload'))
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
  redis.incr(redis.schema.counter('prism','content:retrieve'))
  var retrieveRequest = req.body.request
  var extension = req.body.extension || 'bin'
  var tmpfile = temp.path({prefix: 'oose-' + config.prism.name + '-'})
  var sniff = sha1stream.createStream()
  sniff.on('data',function(chunk){
    redis.incrby(
      redis.schema.counter('prism','content:bytesUploaded'),chunk.length)
  })
  var sha1
  var writeStream = fs.createWriteStream(tmpfile)
  P.try(function(){
    return promisePipe(request(retrieveRequest),sniff,writeStream)
      .then(
        function(val){return val},
        function(err){throw new UserError(err.message)}
      )
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
      redis.incr(redis.schema.counter('prism','content:filesUploaded'))
      res.json({
        sha1: sha1,
        extension: extension
      })
    })
    .catch(UserError,NetworkError,function(err){
      redis.incr(redis.schema.counterError('prism','content:retrieve'))
      res.status(500)
      res.json({
        error: 'Failed to check content existence: ' + err.message
      })
    })
    .finally(function(){
      return fs.unlinkAsync(tmpfile)
        .catch(function(){})
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
  P.try(function(){
    var details = sha1File.sha1FromFilename(file)
    return P.all([
      prismBalance.contentExists(details.sha1),
      storeBalance.storeList(config.prism.name)
    ])
  })
    .then(function(result){
      var exists = result[0]
      storeList = result[1]
      return storeBalance.winner(storeList,storeBalance.existsToArray(exists))
    })
    .then(function(result){
      if(!result) throw new UserError('No suitable store instance found')
      var client = api.store(result)
      var dest = client.put(client.url('/content/put/' + file))
      return promisePipe(req,dest)
        .then(
          function(val){return val},
          function(err){throw new UserError(err.message)}
        )
    })
    .then(function(){
      res.status(201)
      res.json({success: 'File uploaded', file: file})
    })
    .catch(UserError,function(err){
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
  redis.incr(redis.schema.counter('prism','content:exists'))
  var prismList
  var sha1 = req.body.sha1
  var timeout = req.body.timeout || config.prism.existsTimeout || 2000
  var tryCount = req.body.tryCount || config.prism.existsTryCount || 1
  var singular = !(sha1 instanceof Array)
  if(singular) sha1 = [sha1]
  P.try(function(){
    debug(sha1,'got exist request, getting prism list')
    //get a list of prism instances we know
    return prismBalance.prismList()
  })
    .then(function(result){
      prismList = result
      var promises = []
      var prism
      var checkExistence = function(prism){
        var client = api.prism(prism)
        debug(sha1,'existence check sent to ' + prism.host)
        return retry(function(){
          return client.postAsync({
            url: client.url('/content/exists/local'),
            json: {
              sha1: sha1,
              timeout: timeout,
              tryCount: tryCount
            },
            timeout: timeout
          })
        },{max_tries: tryCount, backoff: 2, max_interval: 10000})
          .spread(function(res,body){
            debug(sha1,prism.host + ' responded')
            return {prism: prism.name, exists: body}
          })
          .catch(client.handleNetworkError)
          .catch(NetworkError,function(){
            console.log('exists',sha1,prism.host + ' timed out, marking false')
            var result = {prism: prism.name, exists: {}}
            for(var i = 0; i < sha1.length; i++){
              result.exists[sha1[i]] = {
                sha1: sha1[i],
                exists: false,
                count: 0,
                map: {}
              }
            }
            return result
          })
      }
      for(var i = 0; i < prismList.length; i++){
        prism = prismList[i]
        promises.push(checkExistence(prism))
      }
      return P.all(promises)
    })
    .then(function(results){
      debug(sha1,'existence lookup returned, compiling')
      var compileResult = function(sha1){
        var map = {}
        var exists = false
        var ext = ''
        var count = 0
        var row
        for(var i = 0; i < results.length; i++){
          row = results[i]
          if(row.exists[sha1].exists){
            if(!ext) ext = row.exists[sha1].ext
            exists = true
            count += row.exists[sha1].count
          }
          map[row.prism] = row.exists[sha1]
        }
        return {
          sha1: sha1,
          ext: ext,
          exists: exists,
          count: count,
          map: map
        }
      }
      var exists = {}
      for(var i = 0; i < sha1.length; i++){
        exists[sha1[i]] = compileResult(sha1[i])
      }
      debug(sha1,'existence lookup complete')
      if(singular){
        res.json(exists[sha1[0]])
      } else {
        res.json(exists)
      }
    })
    .catch(UserError,NetworkError,function(err){
      redis.incr(redis.schema.counterError('prism','content:retrieve'))
      debug(sha1,'existence resutled in error',err)
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
  var timeout = req.body.timeout || config.prism.existsTimeout || 2000
  var tryCount = req.body.tryCount || config.prism.existsTryCount || 1
  debug(sha1,'got local request')
  //get a list of store instances we own
  prismBalance.storeListByPrism(config.prism.name)
    .then(function(result){
      storeList = result
      var promises = []
      var store
      var checkExistence = function(store){
        var client = api.store(store)
        debug(sha1,store.host + ' sent existence request')
        return retry(function(){
          return client.postAsync({
            url: client.url('/content/exists'),
            json: {sha1: sha1},
            timeout: timeout
          })
        },{max_tries: tryCount, backoff: 2, max_interval: 10000})
          .spread(function(res,body){
            debug(sha1,store.host + ' existence complete')
            return {store: store.name, exists: body}
          })
          .catch(client.handleNetworkError)
          .catch(NetworkError,function(err){
            console.log('exists',sha1,store.host + ' existence failed',err)
            var result = {store: store.name, exists: {}}
            for(var i = 0; i < sha1.length; i++){
              result.exists[sha1[i]] = false
            }
            return result
          })
      }
      for(var i = 0; i < storeList.length; i++){
        store = storeList[i]
        promises.push(checkExistence(store))
      }
      return P.all(promises)
    })
    .then(function(results){
      debug(sha1,'local lookup returned, compiling')
      var compileResult = function(sha1){
        var map = {}
        var exists = false
        var ext = ''
        var count = 0
        var row
        for(var i = 0; i < results.length; i++){
          row = results[i]
          if(row.exists[sha1].exists){
            if(!ext) ext = row.exists[sha1].ext
            exists = true
            count++
          }
          map[row.store] = row.exists[sha1].exists
        }
        return {exists: exists, ext: ext, count: count, map: map}
      }
      var exists = {}
      for(var i = 0; i < sha1.length; i++){
        exists[sha1[i]] = compileResult(sha1[i])
      }
      debug(sha1,'existence lookup complete')
      res.json(exists)
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
  redis.incr(redis.schema.counter('prism','content:existsInvalidate'))
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
      redis.incr(redis.schema.counter('prism','content:existsInvalidate'))
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
  redis.incr(redis.schema.counter('prism','content:detail'))
  var sha1 = req.body.sha1
  var singular = !(sha1 instanceof Array)
  if(singular) sha1 = [sha1]
  var client = api.prism(config.prism)
  var found = {}
  var lost = []
  P.try(function(){
    //try to query the cache for all of the entries
    //however pass false so it doesnt do a hard lookup
    var promises = []
    for(var i = 0; i < sha1.length; i++){
      promises.push(prismBalance.contentExists(sha1[i],false))
    }
    return P.all(promises)
  })
    .then(function(results){
      //figure out which ones still need to query for
      for(var i = 0; i < sha1.length; i++){
        if(false !== results[i]){
          found[sha1[i]] = results[i]
        } else {
          lost.push(sha1[i])
        }
      }
      //ask for a bulk lookup on the rest
      return client.postAsync({
        url: client.url('/content/exists'),
        json: {
          sha1: lost
        }
      })
    })
    .spread(client.validateResponse())
    .spread(function(res,body){
      var keys = Object.keys(body)
      var promises = []
      //store the results in cache for quicker cache population
      keys.forEach(function(key){
        //store in our result
        found[key] = body[key]
        //add to cache
        promises.push(
          redis.setAsync(
            redis.schema.contentExists(key),
            JSON.stringify(body[key])
          )
        )
      })
      return P.all(promises)
    })
    .then(function(){
      //backwards compatability
      if(singular){
        res.json(found[sha1[0]])
      } else {
        res.json(found)
      }
    })
    .catch(NotFoundError,function(err){
      redis.incr(redis.schema.counterError('prism','content:detail:notFound'))
      res.status(404)
      res.json({error: err.message})
    })
    .catch(NetworkError,function(err){
      redis.incr(redis.schema.counterError('prism','content:detail:network'))
      res.status(502)
      res.json({error: err.message})
    })
    .catch(UserError,function(err){
      redis.incr(redis.schema.counterError('prism','content:detail'))
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
  redis.incr(redis.schema.counter('prism','content:download'))
  var sha1 = req.body.sha1
  var winner, exists
  prismBalance.contentExists(sha1)
    .then(function(result){
      exists = result
      if(!exists && !exists.exists)
        throw new NotFoundError('File not found')
      return storeBalance.winnerFromExists(sha1,exists,[],true)
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
          req.on('data',function(chunk){
            redis.incrby(
              redis.schema.counter('prism','content:bytesDownloaded'),
              chunk.length
            )
          })
          req.on('error',function(err){
            if(!(err instanceof Error)) err = new Error(err)
            store.handleNetworkError(err)
          })
          req.pipe(res)
        })
    })
    .catch(NetworkError,function(){
      return storeBalance.winnerFromExists(sha1,exists,[winner.name],true)
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
      redis.incr(redis.schema.counterError('prism','content:download:notFound'))
      res.status(404)
      res.json({error: err.message})
    })
    .catch(UserError,function(err){
      redis.incr(redis.schema.counterError('prism','content:download'))
      res.json({error: err.message})
    })
}


/**
 * Purchase content
 * @param {object} req
 * @param {object} res
 */
exports.purchase = function(req,res){
  redis.incr(redis.schema.counter('prism','content:purchase'))
  var ip = req.body.ip || req.ip || '127.0.0.1'
  //var start = +new Date()
  var sha1 = req.body.sha1
  var ext = req.body.ext
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
                      ext: ext,
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
          })
          .then(function(){
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
      //var duration = (+new Date()) - start
      //console.log('Purchase',purchase.token,purchase.sha1,purchase.ext,' +' + duration + ' ms',purchase.referrer.join(','))
      res.json(purchase)
    })
    .catch(NetworkError,function(err){
      redis.incr(redis.schema.counterError('prism','content:purchase:network'))
      res.status(500)
      res.json({error: 'Failed to check existence: ' + err.message})
    })
    .catch(NotFoundError,function(err){
      redis.incr(redis.schema.counterError('prism','content:purchase:notFound'))
      res.status(404)
      res.json({error: err})
    })
    .catch(UserError,function(err){
      redis.incr(redis.schema.counterError('prism','content:purchase'))
      res.json({error: err})
    })
}


/**
 * Content delivery
 * @param {object} req
 * @param {object} res
 */
exports.deliver = function(req,res){
  redis.incr(redis.schema.counter('prism','content:deliver'))
  var token = req.params.token
  //var filename = req.params.filename
  var redisKey = redis.schema.purchase(token)
  var purchase
  /**
   * Make a content URL
   * @param {object} req
   * @param {object} store
   * @return {string}
   */
  var makeUrl = function(req,store){
    var query = req.url.indexOf('?') >= 0 ?
      req.url.substr(req.url.indexOf('?')+1) : null
    var proto = 'https' === req.get('X-Forwarded-Protocol') ? 'https' : 'http'
    //add a start param regardless so nginx will act correctly on videos
    // which shouldnt hurt other queries
    if(!req.query.start){
      if('' === query) query = '?start=0'
      else query = query + '&start=0'
    }
    return proto + '://' + store.name + '.' + config.domain +
      '/' + token + '.' + purchase.ext + (query ? '?' + query : '')
  }
  redis.getAsync(redisKey)
    .then(function(result){
      if(!result) throw new NotFoundError('Purchase not found')
      purchase = JSON.parse(result)
      //if(purchase.ip !== req.ip) throw new UserError('Invalid request')
      var validReferrer = false
      var referrer = req.get('Referrer')
      if(!referrer || 'string' !== typeof referrer)
        throw new UserError('Invalid request')
      for(var i = 0; i < purchase.referrer.length; i++){
        if(referrer.match(purchase.referrer[i])){
          validReferrer = true
          break
        }
      }
      if(!validReferrer) throw new UserError('Invalid request')
      //we have a purchase so now... we need to pick a store....
      return storeBalance.winnerFromExists(token,purchase.map,[],true)
    })
    .then(function(result){
      res.redirect(302,makeUrl(req,result))
    })
    .catch(SyntaxError,function(err){
      redis.incr(redis.schema.counterError('prism','content:deliver:syntax'))
      res.status(500)
      res.json({error: 'Failed to parse purchase: ' + err.message})
    })
    .catch(NotFoundError,function(err){
      redis.incr(redis.schema.counterError('prism','content:deliver:notFound'))
      res.status(404)
      res.json({error: err.message})
    })
    .catch(UserError,function(err){
      redis.incr(redis.schema.counterError('prism','content:deliver'))
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
  redis.incr(redis.schema.counter('prism','content:static'))
  var sha1 = req.params.sha1
  var filename = req.params.filename
  var ext = path.extname(filename).replace('.','')
  prismBalance.contentExists(sha1)
    .then(function(result){
      if(!result.exists) throw new NotFoundError('Content doesnt exist')
      if(config.prism.denyStaticTypes.indexOf(ext) >= 0)
        throw new UserError('Invalid static file type')
      return storeBalance.winnerFromExists(sha1,result,[],true)
    })
    .then(function(result){
      var proto = 'https' === req.get('X-Forwarded-Protocol') ? 'https' : 'http'
      var url = proto + '://' + result.name + '.' + config.domain +
        '/static/' + sha1File.toRelativePath(sha1,ext)
      res.redirect(302,url)
    })
    .catch(NetworkError,function(err){
      redis.incr(redis.schema.counterError('prism','content:static:network'))
      res.status(500)
      res.json({
        error: 'Failed to check existence: ' + err.message
      })
    })
    .catch(NotFoundError,function(err){
      redis.incr(redis.schema.counterError('prism','content:static:notFound'))
      res.status(404)
      res.json({error: err.message})
    })
    .catch(UserError,function(err){
      redis.incr(redis.schema.counterError('prism','content:static'))
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
  redis.incr(redis.schema.counter('prism','content:purchaseRemove'))
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
