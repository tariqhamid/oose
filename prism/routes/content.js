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
var hashStream = require('sha1-stream')
var temp = require('temp')

var api = require('../../helpers/api')
var cradle = require('../../helpers/couchdb')
var NetworkError = oose.NetworkError
var NotFoundError = oose.NotFoundError
var prismBalance = require('../../helpers/prismBalance')
var promiseWhile = require('../../helpers/promiseWhile')
var purchasePath = require('../../helpers/purchasePath')
var redis = require('../../helpers/redis')
var hasher = require('../../helpers/hasher')
var hashFile = require('../../helpers/hashFile')
var storeBalance = require('../../helpers/storeBalance')
var UserError = oose.UserError

var config = require('../../config')

//make some promises
P.promisifyAll(temp)

var nullFunction = function(){}


/**
 * Send a file to prism
 * @param {string} tmpfile
 * @param {string} hash
 * @param {string} extension
 * @return {P}
 */
var sendToPrism = function(tmpfile,hash,extension){
  var prismList
  var winners = []
  //actually stream the file to new peers
  return prismBalance.prismList()//pick first winner
    .then(function(result){
      debug(hash,'sendToPrism prismList',result)
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
      debug(hash,'2nd winner result',result)
      if(result) winners.push(result)
      debug('new file winners',hash,winners)
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
            client.put(client.url('/content/put/' + hash + '.' + extension))
          )
            .then(thenReturn,handleError)
        )
      }
      return P.all(promises)
    })
}


/**
 * Upload file
 * @param {object} req
 * @param {object} res
 */
exports.upload = function(req,res){
  redis.incr(redis.schema.counter('prism','content:upload'))
  debug('upload request received')
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
    debug('upload got field',key,value)
    data[key] = value
  })
  busboy.on('file',function(key,file,name,encoding,mimetype){
    redis.incr(redis.schema.counter('prism','content:filesUploaded'))
    debug('upload, got file')
    var tmpfile = temp.path({prefix: 'oose-' + config.prism.name + '-'})
    if(!data.hashType) data.hashType = config.defaultHashType || 'sha1'
    var sniff = hashStream.createStream(data.hashType)
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
      hash: null,
      hashType: data.hashType
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
          var hashType = hasher.identify(sniff.hash)
          files[key].hash = sniff.hash
          files[key][hashType] = sniff.hash
          files[key].hashType = hasher.identify(sniff.hash)
          debug(sniff.hash,'upload received')
          //do a content lookup and see if this exists yet
          debug(sniff.hash,'asking if exists')
          return prismBalance.contentExists(sniff.hash)
        })
        .then(function(result){
          debug(files[key],'exists result',result)
          if(!result.exists && 0 === result.count){
            return sendToPrism(tmpfile,sniff.hash,files[key].ext)
          }
          //got here? file already exists on cluster so we are done
        })
    )
  })
  busboy.on('finish',function(){
    P.all(filePromises)
      .then(function(){
        debug('upload complete',data,files)
        res.json({success: 'File(s) uploaded',data: data,files: files})
      })
      .catch(function(err){
        redis.incr(redis.schema.counterError('prism','content:upload'))
        debug('upload error',err.message,err,err.stack)
        res.json({error: err.message})
      })
      //destroy all the temp files from uploading
      .finally(function(){
        debug('upload cleaning up',files)
        var keys = Object.keys(files)
        var promises = []
        var file
        for(var i = 0; i < keys.length; i++){
          file = files[keys[i]]
          if(fs.existsSync(file.tmpfile))
            promises.push(fs.unlinkAsync(file.tmpfile))
        }
        return P.all(promises)
          .then(function(){
            debug('cleanup complete')
          })
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
  var hashType = req.body.hashType || config.defaultHashType || 'sha1'
  var extension = req.body.extension || 'bin'
  var tmpfile = temp.path({prefix: 'oose-' + config.prism.name + '-'})
  var sniff = hashStream.createStream(hashType)
  sniff.on('data',function(chunk){
    redis.incrby(
      redis.schema.counter('prism','content:bytesUploaded'),chunk.length)
  })
  var hash
  var writeStream = fs.createWriteStream(tmpfile)
  promisePipe(request(retrieveRequest),sniff,writeStream)
    .then(
      function(val){return val},
      function(err){throw new UserError(err.message)}
    )
    .then(function(){
      hash = sniff.hash
      //do a content lookup and see if this exists yet
      return prismBalance.contentExists(hash)
    })
    .then(function(result){
      if(!result.exists && 0 === result.count){
        return sendToPrism(tmpfile,hash,extension)
      }
      //got here? file already exists on cluster so we are done
    })
    .then(function(){
      redis.incr(redis.schema.counter('prism','content:filesUploaded'))
      var response = {
        hash: hash,
        extension: extension
      }
      response[hashType] = hash
      res.json(response)
    })
    .catch(UserError,NetworkError,function(err){
      redis.incr(redis.schema.counterError('prism','content:retrieve'))
      res.status(500)
      res.json({
        error: 'Failed to check content existence: ' + err.message
      })
    })
    .catch(function(err){
      console.log(err.stack)
      console.log('Unhandled error on content retrieve ' + err.message,err)
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
  var details = hashFile.hashFromFilename(file)
  debug(details.hash,'put request received, checking existence and store list')
  P.all([
    prismBalance.contentExists(details.hash),
    storeBalance.storeList(config.prism.name)
  ])
    .then(function(result){
      var exists = result[0]
      storeList = result[1]
      debug(details.hash,'got exists',exists)
      debug(details.hash,'got store list',storeList)
      debug(details.hash,'picking store winner')
      return storeBalance.winner(storeList,storeBalance.existsToArray(exists))
    })
    .then(function(result){
      debug(details.hash,'winner',result)
      if(!result) throw new UserError('No suitable store instance found')
      var client = api.store(result)
      var destination = client.put(client.url('/content/put/' + file))
      debug(details.hash,'streaming file to',result.name)
      return promisePipe(req,destination)
        .then(
          function(val){
            debug(details.hash,'finished streaming file')
            return val
          },
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
    .catch(function(err){
      console.log('Unhandled error on content put ' + err.message)
    })
}


/**
 * Get content detail
 * @param {object} req
 * @param {object} res
 */
exports.detail = function(req,res){
  redis.incr(redis.schema.counter('prism','content:detail'))
  var hash = req.body.hash || req.body.sha1 || ''
  var record = {}
  var singular = !(hash instanceof Array)
  if(singular) hash = [hash]
  //try to query the cache for all of the entries
  //however pass false so it does not do a hard lookup
  P.try(function(){
    return hash
  })
    .map(function(hash){
      return prismBalance.contentExists(hash)
    })
    .each(function(row){
      record[row.hash] = row
    })
    .then(function(){
      //backwards compatability
      if(singular){
        res.json(record[hash[0]])
      } else {
        res.json(record)
      }
    })
    .catch(UserError,function(err){
      redis.incr(redis.schema.counterError('prism','content:detail'))
      res.status(500)
      res.json({error: err.message})
    })
    .catch(function(err){
      console.log('Unhandled error on content detail ' + err.message)
    })
}


/**
 * Check for existence across the platform
 * @param {object} req
 * @param {object} res
 */
exports.exists = function(req,res){
  redis.incr(redis.schema.counter('prism','content:exists'))
  exports.detail(req,res)
}


/**
 * Download purchased content
 * @param {object} req
 * @param {object} res
 */
exports.download = function(req,res){
  redis.incr(redis.schema.counter('prism','content:download'))
  var hash = req.body.hash || req.body.sha1 || ''
  var winner, inventory
  prismBalance.contentExists(hash)
    .then(function(result){
      inventory = result
      if(!inventory && !inventory.exists)
        throw new NotFoundError('File not found')
      return storeBalance.winnerFromExists(hash,inventory,[],true)
    })
    .then(function(result){
      winner = result
      var store = api.store(winner)
      return store.postAsync(store.url('/ping'))
        .then(function(){
          var req = store.post({
            url: store.url('/content/download'),
            json: {hash: hash}
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
      return storeBalance.winnerFromExists(hash,inventory,[winner.name],true)
        .then(function(result){
          winner = result
          var store = api.store(winner)
          return store.postAsync(store.url('/ping'))
            .then(function(){
              store.post({
                url: store.url('/content/download'),
                json: {hash: hash}
              }).pipe(res)
            })
        })
        .catch(NetworkError,function(){
          throw new NotFoundError('File not available')
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
    .catch(function(err){
      console.log('Unhandled error on content download ' + err.message)
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
  var hash = (req.body.hash || req.body.sha1 || '').trim()
  var hashType = hasher.identify(hash)
  var ext = req.body.ext
  var referrer = req.body.referrer
  var life = req.body.life || config.purchase.life
  var token, inventory, purchase
  P.try(function(){
    if(!hashFile.validate(hash))
      throw new UserError('Invalid HASH passed for purchase')
    return prismBalance.contentExists(hash)
  })
    .then(function(result){
      inventory = result
      if(!inventory.exists) throw new NotFoundError('File not found')
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
          return cradle.purchase.getAsync(cradle.schema.purchase(token))
            .then(
              function(result){
                tokenExists = result
              },
              function(err){
                if(404 !== err.headers.status) throw err
                tokenExists = false
              }
            )
        }
      )
    })
    .then(function(){
      //now we know our token so register it on the store instances
      //this means iterating the existence map
      return storeBalance.populateStores(inventory.map)
    })
    .each(function(store){
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
              hash: hash,
              hashType: hashType,
              ext: ext,
              token: token,
              life: life
            }
          })
        })
        .catch(client.handleNetworkError)
        .catch(NetworkError,nullFunction)
    })
    .then(function(){
      //now create our purchase object
      purchase = {
        hash: hash,
        hashType: hashType,
        life: life,
        expirationDate: +(+new Date() + life),
        token: token,
        sessionToken: req.session.token,
        inventory: inventory,
        ext: ext,
        ip: ip,
        referrer: referrer
      }
      return cradle.purchase.saveAsync(cradle.schema.purchase(token),purchase)
    })
    .then(function(){
      //var duration = (+new Date()) - start
      /*console.log(
        'Purchase',
        purchase.token,
        purchase.hash,
        purchase.ext,
        ' + ' + duration + ' ms',
        purchase.referrer.join(',')
      )*/
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
    .catch(function(err){
      console.log('Unhandled error on content purchase ' + err.message)
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
  var tokenPath = purchasePath.tokenToRelativePath(token)
  //var filename = req.params.filename
  var cacheValid = false
  var purchaseKey = cradle.schema.purchase(token)
  /**
   * Make a content URL
   * @param {object} req
   * @param {object} store
   * @param {object} purchase
   * @return {string}
   */
  var makeUrl = function(req,store,purchase){
    var query = req.url.indexOf('?') >= 0 ?
      req.url.substr(req.url.indexOf('?')+1) : null
    var proto = 'https' === req.get('X-Forwarded-Protocol') ? 'https' : 'http'
    //add a start param regardless so nginx will act correctly on videos
    // which should not hurt other queries
    //instead of just adding this param whenever we want lets use the mime
    //type of the file to figure this out
    if(
      mime.lookup(purchase.ext).match('video') &&
      !req.query.start &&
      !req.query.html5
    ){
      if('' === query) query = '?start=0'
      else query = query + '&start=0'
    }
    return proto + '://' + store.name + '.' + config.domain +
      '/' + tokenPath + '.' + purchase.ext + (query ? '?' + query : '')
  }
  /**
   * Validate request
   * @param {object} purchase
   * @return {object}
   */
  var validateRequest = function(purchase){
    var result = {
      valid: true,
      reason: null
    }
    //if(purchase.ip !== req.ip){
    //  result.valid = false
    //  result.reason = 'Invalid request'
    //}
    var validReferrer = false
    var referrer = req.get('Referrer')
    if(!referrer || 'string' !== typeof referrer){
      result.valid = false
      result.reason = 'Invalid request'
    }
    if(!result.valid) return result
    for(var i = 0; i < purchase.referrer.length; i++){
      if(referrer.match(purchase.referrer[i])){
        validReferrer = true
        break
      }
    }
    if(!validReferrer){
      result.valid = false
      result.reason = 'Invalid request'
    }
    return result
  }
  //try to get our purchase record from cache
  redis.getAsync(purchaseKey)
    .then(function(result){
      if(result){
        try {
          result = JSON.parse(result)
          cacheValid = true
        } catch(e){
          cacheValid = false
        }
      }
      if(result && cacheValid){
        return result
      }
      else{
        //hard look up of purchase
        return cradle.purchase.getAsync(purchaseKey)
          .then(
            function(result){
              if(!result) throw new NotFoundError('Purchase not found')
              //store new cache here
              return redis.setAsync(purchaseKey,JSON.stringify(result))
                .then(function(){
                  return redis.expireAsync(
                    purchaseKey,
                    (+config.prism.purchaseCacheLife || 30)
                  )
                })
                .then(function(){
                  return result
                })
            },
            function(){
              throw new NotFoundError('Purchase not found')
            }
          )
      }
    })
    .then(function(purchase){
      //okay so now we have the purchase record and reading it from cache like
      //we wanted, now we do validation and winner selection like normal
      var validation = validateRequest(purchase)
      if(!validation.valid) throw new UserError(validation.reason)
      //we have a purchase so now... we need to pick a store....
      return storeBalance.winnerFromExists(token,purchase.inventory,[],true)
        .then(function(winner){
          res.redirect(302,makeUrl(req,winner,purchase))
        })
    })
    .catch(SyntaxError,function(err){
      redis.incr(
        redis.schema.counterError('prism','content:deliver:syntax'))
      res.status(500)
      res.json({error: 'Failed to parse purchase: ' + err.message})
    })
    .catch(NotFoundError,function(err){
      redis.incr(
        redis.schema.counterError('prism','content:deliver:notFound'))
      res.status(404)
      res.json({error: err.message})
    })
    .catch(UserError,function(err){
      redis.incr(redis.schema.counterError('prism','content:deliver'))
      res.status(500)
      res.json({error: err.message})
    })
    .catch(function(err){
      console.log(err.stack)
      console.log('Unhandled error on content deliver ' + err.message)
    })
}


/**
 * Static content (no purchase required)
 * @param {object} req
 * @param {object} res
 */
exports.contentStatic = function(req,res){
  redis.incr(redis.schema.counter('prism','content:static'))
  var hash = req.params.hash || req.params.sha1 || 'sha1'
  var filename = req.params.filename
  //default based on the request
  var ext = path.extname(filename).replace(/^\./,'')
  prismBalance.contentExists(hash)
    .then(function(result){
      if(!result.exists) throw new NotFoundError('Content does not exist')
      if(config.prism.denyStaticTypes.indexOf(ext) >= 0)
        throw new UserError('Invalid static file type')
      return storeBalance.winnerFromExists(hash,result,[],true)
    })
    .then(function(result){
      //set the extension based on the chosen winners relative path, this will
      //actually be accurate
      ext = path.extname(result.relativePath).replace(/^\./,'')
      var proto = 'https' === req.get('X-Forwarded-Protocol') ? 'https' : 'http'
      var url = proto + '://' + result.name +
        '.' + config.domain + '/static/' + hashFile.toRelativePath(hash,ext)
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
  var purchaseKey = cradle.schema.purchase(token)
  var purchase
  cradle.purchase.getAsync(purchaseKey)
    .then(
      function(result){
        purchase = result
        return storeBalance.populateStores(purchase.inventory.map)
      },
      function(err){
        if(404 !== err.headers.status) throw err
        res.json({token: token, count: 0, success: 'Purchase removed'})
      }
    )
    .each(function(store){
      var client = api.store(store)
      return client.postAsync({
        url: client.url('/purchase/remove'),
        json: {token: token}
      })
    })
    .then(function(){
      return cradle.purchase.removeAsync(purchaseKey)
    })
    .then(function(){
      res.json({token: token, count: 1, success: 'Purchase removed'})
    })
}
