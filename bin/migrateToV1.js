'use strict';
var P = require('bluebird')
var glob = P.promisify(require('glob'))
var fs = require('graceful-fs')
var mime = require('mime')
var oose = require('oose-sdk')
var path = require('path')

var file = require('../helpers/file')
var redis = require('../helpers/redis')
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
  return ++prismSelectCount % 2 === 0 ? prismServers[0] : prismServers[1]
}

console.log('Starting migration to OOSE 1.0')
console.log('------------------------------')

//find all the data paths
glob(search,{cwd: root})
  .then(function(results){
    //get files only
    results = results.filter(function(a){
      return !fs.lstatSync(path.resolve(root,a)).isDirectory()
    })
    files = results
    fileCount = files.length
    console.log('Found ' + fileCount + ' files to be migrated')
    return prismLogin(selectPrismServer())
  })
  .then(function(result){
    ooseSession = result
    console.log('Successfully logged into OOSE v1!')
    return files
  })
  .each(function(filePath){
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
        console.log(sha1,'Got file info from local database')
        fileInfo = result
        console.log(sha1,'Checking if exists')
        //ask if the file exists
        return client.postAsync({
          url: client.url('/content/detail'),
          json: {
            sha1: sha1
          }
        })
      })
      .spread(function(res,body){
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
              if(!(
                body.files && body.files.file && body.files.file.sha1 === sha1))
                throw new UserError('File was not uploaded correctly')
              //finished
              console.log(sha1,'Upload complete')
            })
            .catch(UserError,function(err){
              console.log(sha1,'Error: ' + err.message)
            })
        }
      })
      .then(function(){
        fileCountComplete++
        console.log('File ' + fileCountComplete + '/' + fileCount +
        ' [' + ((fileCountComplete / fileCount) * 100).toFixed(2) + '%]')
        console.log('----------------------------------')
      })
  })
  .then(function(){
    console.log('Migration complete')
    process.exit()
  })
