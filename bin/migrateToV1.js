'use strict';
var P = require('bluebird')
var program = require('commander')
var debug = require('debug')('oose:migrate')
var fs = require('graceful-fs')
var mime = require('mime')
var oose = require('oose-sdk')
var path = require('path')
var ProgressBar = require('progress')

var file = require('../helpers/file')
var redis = require('../helpers/redis')

var NetworkError = oose.NetworkError
var UserError = oose.UserError

var config = require('../config')

var root = path.resolve(config.root)

var ooseUsername = 'migration'
var oosePassword =
  'Df*7%a^V^$4u84_j02y@5X44H_#s*vD20=P=fn=x*)o26S$Ecy4J@$2xe3v_UyI*'
var ooseSession = {}

var files = []
var fileCount = 0
var fileErrorCount = 0
var fileInfo = {}
var fileDetail = {}
var fileMap = {}
var fileUpload = []
var fileCountComplete = 0
var progress = {}

//make some promises
P.promisifyAll(redis)

//prism api
oose.api.updateConfig({
  prism: {
    host: '104.221.221.220',
    port: '5971'
  }
})

//cli parsing
program
  .version(config.version)
  .option('-B, --block-size <n>','Block size to bulk lookup, default: 1000')
  .parse(process.argv)

var blockSize = process.blockSize || 1000


/**
 * Login to a prism
 * @param {object} prism
 * @return {Function}
 */
var prismLogin = function(prism){
  var client = oose.api.prism(prism)
  return client.postAsync({
    url: client.url('/user/login'),
    json: {
      username: ooseUsername,
      password: oosePassword
    }
  })
    .spread(function(res,body){
      return body.session
    })
}

var prismServers = [
  {
    host: '104.221.221.220',
    port: '5971'
  },
  {
    host: '104.221.221.221',
    port: '5971'
  }
]

var prismSelectCount = 0

var selectPrismServer = function(){
  var server = ++prismSelectCount % 2 === 0 ? prismServers[0] : prismServers[1]
  debug('selected prism server ' + server.host)
  return server
}

var analyzeBlock = function(progress,block){
  //setup our client handle
  var client = oose.api.prism(selectPrismServer())
  client = oose.api.setSession(ooseSession,client)
  //convert the file list to a list of usable sha1s
  var sha1Dirty = []
  var sha1 = []
  for(var i = 0; i < block.length; i++){
    sha1Dirty.push(file.sha1FromPath(block[i]))
    fileMap[sha1] = block[i]
  }
  //look up the block in inventory
  return P.try(function(){
    var promises = []
    for(var i = 0; i < sha1Dirty.length; i++){
      promises.push(redis.hgetallAsync('inventory:' + sha1Dirty[i]))
    }
    return P.all(promises)
  })
    .then(function(result){
      for(var i = 0; i < result.length; i++){
        if(!result[i]) continue
        sha1.push(sha1Dirty[i])
        fileInfo[sha1Dirty[i]] = result[i]
      }
      //now make a bulk query to oose
      //ask if the file exists
      debug('sending detail request')
      return client.postAsync({
        url: client.url('/content/detail'),
        json: {
          sha1: sha1
        }
      })
    })
    .spread(client.validateResponse())
    .spread(function(res,body){
      var keys = Object.keys(body)
      for(var i = 0; i < keys.length; i++){
        if(body[i].exists) continue
        fileDetail[keys[i]] = body[i]
        fileUpload.push(keys[i])
      }
      progress.tick(block.length)
    })
    .catch(client.handleNetworkError)
}

console.log('Starting migration to OOSE 1.0')
console.log('------------------------------')
console.log('Beginning analysis...')

//find all the data paths
var migrateListFile = process.argv[2]
if(!fs.existsSync(migrateListFile))
  throw new Error('No valid file given for migrate inventory list')
fs.readFileAsync(migrateListFile)
  .then(function(result){
    files = result.toString().split('\n')
    debug('found files to migrate',files.length)
    fileCount = files.length
    console.log('Found ' + fileCount + ' files to be migrated')
    return prismLogin(selectPrismServer())
  })
  .then(function(result){
    debug('got session response',result)
    ooseSession = result
    console.log('Successfully logged into OOSE v1!')
    var blocks = []
    var blockCount = Math.ceil(fileCount / blockSize)
    for(var i = 0; i < blockCount; i++){
      blocks.push(files.slice(i * blockSize,blockSize))
    }
    progress = new ProgressBar(
      '  analyzing [:bar] :current/:total :percent :etas',
      {
        total: fileCount,
        width: 50,
        complete: '=',
        incomplete: '-'
      }
    )
    return blocks
  })
  .each(function(block){
    return analyzeBlock(progress,block)
  })
  .then(function(){
    console.log('------------------------------')
    console.log('Analysis complete...')
    console.log('About to upload ' + fileUpload.length + ' files')
    progress = new ProgressBar(
      '  uploading [:bar] :current/:total :percent :etas',
      {
        total: fileUpload.length,
        width: 50,
        complete: '=',
        incomplete: '-'
      }
    )
    return fileUpload
  })
  .each(function(sha1){
    //setup our client handle
    var client = oose.api.prism(selectPrismServer())
    client = oose.api.setSession(ooseSession,client)
    console.log(sha1,'Uploading....')
    return client.postAsync({
      url: client.url('/content/upload'),
      formData: {
        file: {
          value: fs.createReadStream(path.resolve(root,fileMap[sha1])),
          options: {
            filename: 'file.' + mime.extension(fileInfo[sha1].mimeType),
            contentType: fileInfo[sha1].mimeType
          }
        }
      }
    })
      .spread(function(res,body){
        if(!body.files) throw new UserError('Upload failed, no response body')
        if(!body.files.file)
          throw new UserError('Upload failed, no file returned')
        if(sha1 !== body.files.file.sha1)
          throw new UserError('Upload failed, sha1 mismatch got ' +
            sha1 + ' expected ' + body.files.file.sha1)
        //finished
        console.log(sha1,'Upload complete')
      })
      .then(function(){
        fileCountComplete++
      })
      .catch(client.handleNetworkError)
      .catch(UserError,NetworkError,function(err){
        debug('File error',err)
        fileErrorCount++
        console.log(sha1,'Error: ' + err.message)
      })
      .finally(function(){
        progress.tick()
      })
  })
  .then(function(){
    console.log('----------------------------------')
    console.log('Migration complete, ' + fileCountComplete + ' uploaded, ' +
      fileErrorCount + ' errors.')
    process.exit()
  })
