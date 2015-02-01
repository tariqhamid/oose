'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:migrate')
var fs = require('graceful-fs')
var mime = require('mime')
var oose = require('oose-sdk')
var path = require('path')

var file = require('../helpers/file')
var redis = require('../helpers/redis')

var NetworkError = oose.NetworkError
var UserError = oose.UserError

var config = require('../config')

var root = path.resolve(config.root)
var search = '??/**/??'

var ooseUsername = 'migration'
var oosePassword =
  'Df*7%a^V^$4u84_j02y@5X44H_#s*vD20=P=fn=x*)o26S$Ecy4J@$2xe3v_UyI*'
var ooseSession = {}

var files = []
var fileCount = 0
var fileCountComplete = 0

//make some promises
P.promisifyAll(redis)

//prism api
oose.api.updateConfig({
  prism: {
    host: '104.221.221.220',
    port: '5971'
  }
})


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

console.log('Starting migration to OOSE 1.0')
console.log('------------------------------')

//find all the data paths
debug('starting to find files to migrate')
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
    return files
  })
  .each(function(filePath){
    debug('starting on',filePath)
    //setup our client handle
    var client = oose.api.prism(selectPrismServer())
    client = oose.api.setSession(ooseSession,client)
    //get the sha1
    var sha1 = file.sha1FromPath(filePath)
    //store file info
    var fileInfo = {}
    //get the file info from the current OOSE db
    return redis.hgetallAsync('inventory:' + sha1)
      .then(function(result){
        debug('got inventory',result)
        if(!result) throw new UserError('Could not get local inventory')
        console.log(sha1,'Got file info from local database')
        fileInfo = result
        console.log(sha1,'Checking if exists')
        //ask if the file exists
        debug('sending detail request')
        return client.postAsync({
          url: client.url('/content/detail'),
          json: {
            sha1: sha1
          }
        })
      })
      .spread(function(res,body){
        debug('got detail response',body)
        if(body.exists){
          console.log(sha1,'Does exist, skipping')
        } else {
          console.log(sha1,'Does not exist, uploading....')
          return client.postAsync({
            url: client.url('/content/upload'),
            formData: {
              file: {
                value: fs.createReadStream(path.resolve(root,filePath)),
                options: {
                  filename: 'file.' + mime.extension(fileInfo.mimeType),
                  contentType: fileInfo.mimeType
                }
              }
            }
          })
            .spread(function(res,body){
              console.log(res.statusCode,body)
              if(!body.files) throw new UserError('Upload failed, no response body')
              if(!body.files.file) throw new UserError('Upload failed, no file returned')
              if(sha1 !== body.files.file.sha1)
                throw new UserError('Upload failed, sha1 mismatch got ' + sha1 + ' expected ' + body.files.file.sha1)
              //finished
              console.log(sha1,'Upload complete')
            })
        }
      })
      .then(function(){
        fileCountComplete++
        console.log('File ' + fileCountComplete + '/' + fileCount +
        ' [' + ((fileCountComplete / fileCount) * 100).toFixed(2) + '%]')
        console.log('----------------------------------')
      })
      .catch(client.handleNetworkError)
      .catch(UserError,NetworkError,function(err){
        debug('File error',err)
        console.log(sha1,'Error: ' + err.message)
        console.log('----------------------------------')
      })
  })
  .then(function(){
    console.log('Migration complete')
    process.exit()
  })
