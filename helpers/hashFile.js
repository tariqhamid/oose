'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')
var globby = require('globby')
var path = require('path')

var config = require('../config')
var hasher = require('./hasher')

var basePath = path.resolve(config.root + '/content')


/**
 * Get a relative path from a hash
 * @param {string} hash
 * @param {string} ext
 * @return {string}
 */
exports.toRelativePath = function(hash,ext){
  var file = ''
  var type = hasher.identify(hash)
  var parts = hash.split('')
  for(var i = 1; i <= parts.length; i++){
    file = file + parts[i - 1]
    if(i % 2 === 0 && i !== hasher.hashLengths[type]){
      file = file + '/'
    }
  }
  if(ext)
    file = file + '.' + ext
  return file
}


/**
 * Convert a hash to an absolute path
 * @param {string} hash
 * @param {string} ext  File extension
 * @return {string}
 */
exports.toPath = function(hash,ext){
  return path.resolve(basePath,exports.toRelativePath(hash,ext))
}


/**
 * Convert a path back to a hash
 * @param {string} file
 * @return {string}
 */
exports.fromPath = function(file){
  //remove root
  file = file.replace(basePath,'')
  //strip extension
  file = file.replace(/\.\w+$/,'')
  //filter out to hash
  return file.replace(/[^a-f0-9]+/gi,'')
}


/**
 * Convert full path to fileName = <hash>.<ext>
 * @param {string} fullPath
 * @return {string}
 */
exports.fromPathToFile = function(fullPath){
  var file = '' + fullPath
  var ext = path.extname(file)
  //remove root
  file = file.replace(basePath,'')
  //filter out to hash
  file = file.replace(/[^a-f0-9]+/gi,'')
  return file + ext
}


/**
 * Validate hash
 * @param {string} hash
 * @return {boolean}
 */
exports.validate = function(hash){
  if(!hash) return false
  var type = hasher.identify(hash)
  return !!hash.match(hasher.hashExpressions[type])
}


/**
 * Since the node fs.existsAsync wont work this has to be done here
 * @param {string} file
 * @return {P}
 */
exports.fsExists = function(file){
  return new P(function(resolve){
    fs.exists(file,function(result){
      resolve(result)
    })
  })
}


/**
 * Extract hash and extension from filename
 * @param {string} file
 * @return {object}
 */
exports.hashFromFilename = function(file){
  var match = file.match(/^([a-f0-9]+)\.(\w+)$/i)
  if(3 !== match.length) throw new Error('Failed to parse file name')
  var hash = match[1]
  var type = hasher.identify(hash)
  var ext = match[2]
  return {
    hash: hash,
    type: type,
    ext: ext
  }
}


/**
 * Find a file based on hash
 * @param {string} hash
 * @return {P}
 */
exports.find = function(hash){
  var file = exports.toPath(hash)
  var folder = path.dirname(file)
  var basename = path.basename(file)
  return globby([basename + '.*'],{cwd: folder})
    .then(function(paths){
      if(paths && paths instanceof Array && paths.length){
        var filePath = path.join(folder,paths[0])
        var fileHash = exports.fromPath(filePath)
        return {
          exists: true,
          path: filePath,
          folder: path.dirname(filePath),
          basename: path.basename(filePath),
          fileName: exports.fromPathToFile(filePath),
          hash: fileHash,
          hashType: hasher.identify(fileHash),
          ext: path.extname(filePath).replace('.','')
        }
      } else {
        return {
          exists: false,
          path: file,
          folder: folder,
          basename: basename,
          fileName: '',
          hash: hash,
          hashType: hasher.identify(hash),
          ext: ''
        }
      }
    })
}


/**
 * Get details from a filename with extension
 * @param {string} hash
 * @return {P}
 */
exports.details = function(hash){
  var findDetail = {}
  var details = {}
  return exports.find(hash)
    .then(function(result){
      if(false === result.exists){
        throw new Error('File not found')
      }
      findDetail = result
      return fs.statAsync(findDetail.path)
        .then(function(stat){
          return stat
        })
        .catch(function(){
          return false
        })
    })
    .then(
      function(result){
        details = findDetail
        if(!result){
          details.stat = {}
          details.exists = false
        } else {
          details.stat = result
          details.exists = true
        }
        return details
      }
    )
    .catch(function(err){
      if('File not found' === err.message){
        return {
          hash: hash,
          ext: '',
          path: '',
          stat: {},
          exists: false,
          err: err
        }
      } else {
        console.log(err,err.stack)
        return false
      }
    })
}


/**
 * Remove a file and its accompanying link
 * @param {string} hash
 * @return {P}
 */
exports.remove = function(hash){
  //this function is so lame
  return P.try(function(){
    return exports.find(hash)
  })
    .then(function(result){
      if(false === result.exists){
        //not found no need to remove
        return true
      } else {
        try {
          fs.unlinkSync(result.path)
        } catch(e){
          //nothing
        }
        return true
      }
    })
}
