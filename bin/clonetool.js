#!/usr/bin/node
'use strict';
var P = require('bluebird')
var clc = require('cli-color')
var cp = require('child_process')
var debug = require('debug')('clonetool')
var Table = require('cli-table')
var program = require('commander')
var fs = require('graceful-fs')
var MemoryStream = require('memory-stream')
var ObjectManage = require('object-manage')
var oose = require('oose-sdk')
var path = require('path')
var prettyBytes = require('pretty-bytes')
var ProgressBar = require('progress')
var promisePipe = require('promisepipe')
var random = require('random-js')()

var UserError = oose.UserError

var couchdb = require('../helpers/couchdb')
var hasher = require('../helpers/hasher')
var prismBalance = require('../helpers/prismBalance')
var redis = require('../helpers/redis')()
var FileOp = require('../helpers/fileOp')

var config = require('../config')

var cacheKeyTempFile = '/tmp/oosectkeycache'

//store our master peerList
var peerList = {}

//setup cli parsing
program
  .version(config.version)
  .option('-a, --above <n>','Files above this count will be analyzed')
  .option('-A, --at <n>','Files at this count will be analyzed')
  .option('-b, --below <n>','Files below this count will be analyzed')
  .option('-B, --block-size <n>','Number of files to analyze at once')
  .option('-d, --desired <n>','Desired clone count')
  .option('-D, --detail <s>','Hash of file to get details about')
  .option('-f, --force','Force the operation even on this hash')
  .option('-i, --input <s>','List of Hashes line separated ' +
    'to analyze, use - for stdin')
  .option('-p, --pretend','Don\'t actually make any clones just analyze')
  .option('-H, --hash <hash>','Hash of file to check')
  .option('-F, --folder <folder>','Folder to scan')
  .option('-S, --store <store>','Use file list from this store')
  .option('-P, --prism <prism>','Use file list from this prism')
  .option('-u, --verify','Verify file(s) by having stores verify integrity')
  .option('-v, --verbose','Be verbose and show hash list before processing')
  .option('-X, --allfiles','Use all files')
  .option('--clone <s>','Name of direct store for clones to be sent')
  .option('--drop <s>','Name of direct store to remove clones from')
  .parse(process.argv)

var selectPeer = function(type,peerName){
  if(!type) type = 'store'
  var result = {}
  peerList.forEach(function(peer){
    if(peer.type !== type || peer.name !== peerName) return
    result = peer
  })
  return result
}

var setupStore = function(store){
  var opts = new ObjectManage()
  opts.$load(config.store)
  opts.$load(store)
  opts = opts.$strip()
  return oose.api.store(opts)
}

var pluralize = function(a,b,c,d,e){
  var number,printNumber,string,appendSingular,appendMultiple
  if('function' === typeof a){
    //usage case: pluralize(printCb,number,string,appendSingular,appendMultiple)
    number = b
    string = c
    appendSingular = d
    appendMultiple = e
    printNumber = a(number)
  } else {
    //usage case: pluralize(number,string,appendSingular,appendMultiple)
    number = a
    string = b
    appendSingular = c
    appendMultiple = d
    printNumber = ''
  }
  appendSingular = ('string' === typeof appendSingular) ? appendSingular : ''
  appendMultiple = ('string' === typeof appendMultiple) ? appendMultiple : 's'
  return printNumber + string +
    ((1 === (+number)) ? appendSingular : appendMultiple)
}


var analyzeFiles = function(program,progress,fileList){
  var above = false !== program.above ? +program.above : null
  var at = false !== program.at ? +program.at : null
  var below = false !== program.below ? +program.below : null
  var desired = false !== program.desired ? + program.desired : 2
  var ops = {}
  var fileCount = fileList.length
  var blockSize = program.blockSize || 250
  var blockCount = Math.ceil(fileCount / blockSize)
  var analyzeBlock = function(fileBlock){
    return P.try(function(){
      return fileBlock
    })
      .map(function(file){
        if(program.force){
          redis.del(redis.schema.inventory(file))
        }
        return prismBalance.contentExists(file)
          .then(function(record){
            var op = new FileOp(record)
            //do clone math now
            var add = 0
            var remove = 0
            if(
              (null !== above && record.count > above) ||
              (null !== below && record.count < below) ||
              (null !== at && record.count === at)
            )
            {
              if(desired > record.count){
                add = desired - record.count
              }
              else if(desired < record.count){
                remove = record.count - desired
              }
            }
            if(program.clone){
              add = 1
              remove = 0
            }
            if(program.drop){
              add = 0
              remove = 1
            }
            if(0 === record.count && add){
              //can't clone/verify a file, when we don't have any copies
              add = 0
            }
            if(program.verify){
              op.action = op.fileActions.verify
              op.repeat = (add + remove) || 1
              add = 0
              remove = 0
            }
            if(0 < add){
              op.action = op.fileActions.copy
              op.repeat = add
            }
            if(0 < remove){
              op.action = op.fileActions.unlink
              op.repeat = remove
            }
            //compile our record
            ops[record.hash] = op
            progress.tick()
            return op
          })
      })
  }
  return P.try(function(){
    var blockList = []
    for(var i = 0; i < blockCount; i++){
      blockList.push(fileList.slice(i * blockSize,(i + 1) * blockSize))
    }
    progress.update(0)
    return blockList
  })
    .each(function(block){
      return analyzeBlock(block)
    })
    .then(function(){
      return ops
    })
}

var addClones = function(op){
  var promises = []
  var storeWinnerList = []
  var addClone = function(file){
    // so to create a clone we need to figure out a source store
    var startStamp = +new Date()
    var prismFromWinner
    var storeFromWinner
    var prismToWinner
    var storeToWinner
    var storeFromList =[]
    var storeToList = []
    //iteration vars
    var prismNameList = []
    var storeNameList = []
    file.map.forEach(function(entry){
      var parts = entry.split(':')
      var prismName = parts[0]
      var storeName = parts[1]
      prismNameList.push(prismName)
      storeNameList.push(storeName)
      storeFromList.push({prism: prismName, store: storeName})
    })
    // randomly select one source store
    storeFromWinner = storeFromList[
      random.integer(0,(storeFromList.length - 1))]
    prismFromWinner = storeFromWinner.prism
    // figure out a destination store
    peerList.forEach(function(peer){
      //skip prisms and whatever else
      if('store' !== peer.type) return
      if(
        peer.prism !== prismFromWinner &&
        -1 === storeWinnerList.indexOf(peer.name) &&
        -1 === file.map.indexOf(peer.prism + ':' + peer.name) &&
        true === peer.available &&
        true === peer.writable
      ){
        storeToList.push({prism: peer.prism, store: peer.name})
      }
    })
    //make sure there is a possibility of a winner
    if(!storeToList.length){
      console.error(file.hash,
        'Sorry! No more available stores to send this to :(')
    } else {
      //figure out a dest winner
      storeToWinner = storeToList[
        random.integer(0,(storeToList.length - 1))]
      storeWinnerList.push(storeToWinner.store)
      prismToWinner = storeToWinner.prism
      //inform of our decision
      console.log(file.hash,
        'Sending from ' + storeFromWinner.store +
        ' on prism ' + prismFromWinner +
        ' to ' + storeToWinner.store + ' on prism ' + prismToWinner)
      var storeFromInfo = selectPeer('store',storeFromWinner.store)
      var sendClient = setupStore(storeFromInfo)
      var sendOptions = {
        file: file.hash + '.' + file.mimeExtension.replace('.',''),
        store: storeToWinner.prism + ':' + storeToWinner.store
      }
      return sendClient.postAsync({
        url: sendClient.url('/content/send'),
        json: sendOptions
      })
        .spread(function(res,body){
          if(body.error){
            var err = new Error(body.error)
            err.stack = body.stack
            throw err
          } else {
            var endStamp = +new Date()
            var fileSize = 1024
            if(body && body.fileDetail &&
              body.fileDetail.stat && body.fileDetail.stat.size){
              fileSize = body.fileDetail.stat.size
            }
            var duration = (endStamp - startStamp) / 1000
            var rate = (((fileSize) / duration) / 1024).toFixed(2)
            console.log(file.hash,
              'Sent ' + prettyBytes(fileSize) + ' to ' + storeToWinner.store +
              ' taking ' + duration +
              ' seconds averaging ' + rate + '/KBs, success!')
          }
        })
        .catch(function(err){
          console.error(file.hash,
            'Failed to send clone to ' + storeToWinner.store,err.message)
        })
        .finally(function(){
          var existsKey = couchdb.schema.inventory(file.hash)
          redis.del(existsKey)
        })
    }
  }
  for(var i = 0; i < op.repeat; i++){
    promises.push(addClone(op.file))
  }
  return P.all(promises)
}

var removeClones = function(op){
  var promises = []
  var storeWinnerList = []
  var removeClone = function(file){
    // so to create a clone we need to figure out a source store
    var storeRemoveWinner
    var storeRemoveList = []
    //iteration vars
    var prismNameList = []
    var storeNameList = []
    file.map.forEach(function(entry){
      var parts = entry.split(':')
      var prismName = parts[0]
      var storeName = parts[1]
      if(-1 === config.clonetool.storeProtected.indexOf(storeName)){
        var peer = selectPeer('store',storeName)
        prismNameList.push(prismName)
        storeNameList.push(storeName)
        if((true === peer.available) &&
          (-1 === storeWinnerList.indexOf(storeName))
        ){
          storeRemoveList.push({prism: prismName,store: storeName})
        }
      }
    })
    //make sure there is a possibility of a winner
    if(!storeRemoveList.length){
      console.error(file.hash,
        'Sorry! No more available stores to remove this from, it is gone. :(')
    } else {
      // now we know possible source stores, randomly select one
      storeRemoveWinner = storeRemoveList[
        random.integer(0,(storeRemoveList.length - 1))]
      storeWinnerList.push(storeRemoveWinner.store)
      //inform of our decision
      console.log(file.hash,
        'Removing from ' + storeRemoveWinner.store +
        ' on prism ' + storeRemoveWinner.prism)
      var selectedStoreInfo = selectPeer('store',storeRemoveWinner.store)
      var storeClient = setupStore(selectedStoreInfo)
      return storeClient.postAsync({
        url: storeClient.url('/content/remove'),
        json: {
          hash: file.hash
        }
      })
        .spread(storeClient.validateResponse())
        .catch(function(err){
          console.error(file.hash,'Failed to remove clone',err.message)
        })
        .finally(function(){
          var existsKey = couchdb.schema.inventory(file.hash)
          redis.del(existsKey)
        })
    }
  }
  for(var i = 0; i < op.repeat; i++){
    promises.push(removeClone(op.file))
  }
  return P.all(promises)
}

var verifyFile = function(file){
  //first grab a store to ask for info
  if(!file.count || !file.exists || !(file.map instanceof Array)){
    console.error(file.hash,'Doesn\'t exist, can\'t verify')
    return
  }
  return P.try(function(){
    return file.map
  })
    .map(function(storeKey){
      var keyParts = storeKey.split(':')
      var storeInfo = selectPeer('store',keyParts[1])
      var storeClient = setupStore(storeInfo)
      return storeClient.postAsync({
        url: storeClient.url('/content/verify'),
        json: {
          file: file.hash + '.' + ('' + file.mimeExtension).replace('.','')
        }
      })
        .spread(function(res,body){
          if(body && body.error){
            console.error(file.hash,'Verify failed ' + body.error +
              ' on ' + keyParts[1] + ' inventory purged')
          } else if(body && 'ok' === body.status){
            console.log(file.hash,
              'Inventory verification complete on ' + keyParts[1])
          } else if(body && 'fail' === body.status){
            console.error(file.hash,
              'Invalid content on ' + keyParts[1] + ' clone removed')
          } else {
            console.error(file.hash,'Unknown issue',body)
          }
        })
        .catch(function(err){
          console.error(file.hash,'Failed to verify inventory',err.message)
        })
        .finally(function(){
          var existsKey = couchdb.schema.inventory(file.hash)
          redis.del(existsKey)
        })
    })
}

var printHeader = function(op){
  console.log('--------------------')
  console.log(op.file.hash + ' starting to process changes')
}

var printFooter = function(op){
  console.log(op.file.hash,'Processing complete')
}

var cloneFile = function(file){
  //first grab a store to ask for info
  if(!file.count || !file.exists || !(file.map instanceof Array)){
    console.error(file.hash,'Doesn\'t exist, cannot clone')
    return
  }
  return P.try(function(){
    return file.map[random.integer(0,file.map.length - 1)]
  })
    .then(function(storeKey){
      var keyParts = storeKey.split(':')
      var storeFromInfo = selectPeer('store',keyParts[1])
      var storeToInfo = selectPeer('store',program.clone)
      var storeFromClient = setupStore(storeFromInfo)
      var sendOptions = {
        file: file.hash + '.' + file.mimeExtension.replace('.',''),
        store: storeToInfo.prism + ':' + storeToInfo.name
      }
      return storeFromClient.postAsync({
        url: storeFromClient.url('/content/send'),
        json: sendOptions
      })
        .spread(function(res,body){
          if(body.error){
            var err = new Error(body.error)
            err.stack = body.stack
            throw err
          } else {
            console.log(file.hash,
              'Send from ' + storeFromInfo.name +
              ' to ' + storeToInfo.name + ' complete')
          }
        })
        .catch(function(err){
          console.error(file.hash,
            'Failed to send clone to ' + storeToInfo.store,err.message)
        })
        .finally(function(){
          var existsKey = couchdb.schema.inventory(file.hash)
          redis.del(existsKey)
        })
    })
}

var removeFile = function(file){
  //first grab a store to ask for info
  if(!file.count || !file.exists || !(file.map instanceof Array)){
    console.error(file.hash,'Doesn\'t exist, cannot remove')
    return
  }
  return P.try(function(){
    var storeInfo = selectPeer('store',program.drop)
    var storeClient = setupStore(storeInfo)
    return storeClient.postAsync({
      url: storeClient.url('/content/remove'),
      json: {
        hash: file.hash
      }
    })
      .spread(function(res,body){
        if(body.error){
          var err = new Error(body.error)
          err.stack = body.stack
          throw err
        } else {
          console.log(file.hash,'Remove from ' + storeInfo.name + ' complete')
        }
      })
      .catch(function(err){
        console.error(file.hash,
          'Failed to remove clone from ' + storeInfo.store,err.message)
      })
      .finally(function(){
        var existsKey = couchdb.schema.inventory(file.hash)
        redis.del(existsKey)
      })
  })
}

var processOp = function(op){
  return P.try(function(){
    if(program.clone || program.drop || op.fileActions.nop < op.action)
      printHeader(op)
    //manual processing
    if(program.clone){
      return cloneFile(op.file)
        .then(function(){printFooter(op)})
    } else if(program.drop){
      return removeFile(op.file)
        .then(function(){printFooter(op)})
    } else if(0 < op.repeat &&
      -1 < [
        op.fileActions.copy,
        op.fileActions.unlink,
        op.fileActions.verify
      ].indexOf(op.action)
    ){
      //normal processing
      switch(op.action){
      case op.fileActions.copy:
        return addClones(op)
          .then(function(){printFooter(op)})
        break
      case op.fileActions.unlink:
        return removeClones(op)
          .then(function(){printFooter(op)})
        break
      case op.fileActions.verify:
        return verifyFile(op.file)
          .then(function(){printFooter(op)})
        break
      default:
        return P.try(function(){console.log('processOp hit default case??',op)})
      }
    }
  })
}

var relativePath = function(hash,ext){
  ext = ('' + ext).replace('.','')
  var result = ''
  for(var i = 0; i < hash.length; i++){
    if(0 === i % 2) result = result + '/'
    result = result + hash.charAt(i)
  }
  result = result + '.' + ext
  return result
}

var contentDetail = function(hash){
  return prismBalance.contentExists(hash,false)
    .then(function(result){
      var table = new Table()
      table.push(
        {HASH: clc.yellow(result.hash)},
        {'File Extension': clc.cyan(result.mimeExtension)},
        {'Size': clc.cyan(prettyBytes(+(result.size || 0)))},
        {'Relative Path': clc.yellow(
          relativePath(result.hash,result.mimeExtension))},
        {Exists: result.exists ? clc.green('Yes') : clc.red('No')},
        {'Clone Count': clc.green(result.count)}
      )
      console.log(table.toString())
      console.log('Storage Map')
      console.log('--------------------')
      result.map.forEach(function(entry){
        var parts = entry.split(':')
        var prismName = parts[0]
        var storeName = parts[1]
        console.log('    ' + clc.cyan(prismName) + ':' + clc.green(storeName))
      })
      console.log('\n Total: ' +
        pluralize(clc.yellow,result.count,' clone') + '\n'
      )
      process.exit()
    })
}


/**
 * Scan folder for files to check
 * @param {string} folderPath
 * @param {Stream} fileStream
 * @return {P}
 */
var folderScan = function(folderPath,fileStream){
  var root = path.resolve(folderPath)
  var contentFolder = root
  var hashList = []
  if(!fs.existsSync(root))
    throw new Error('Scan folder does not exist')


  /**
   * Stat counters
   * @type {object}
   */
  var counter = {
    warning: 0,
    error: 0,
    invalid: 0,
    valid: 0,
    bytes: 0,
    bytesReceived: 0
  }

  debug('starting to scan',contentFolder)
  return new P(function(resolve,reject){
    var buffer = ''
    var cmd = cp.spawn(
      'find',
      [contentFolder,'-type','f'],
      {
        cwd: '/',
        maxBuffer: 4294967296,
        stdio: ['pipe','pipe',process.stderr]
      }
    )
    cmd.stdout.on('data',function(chunk){
      counter.bytesReceived = counter.bytesReceived + chunk.length
      process.stdout.write('Receiving from find ' +
        (counter.bytesReceived / 1024).toFixed(0) + 'kb\r')
      buffer = buffer + '' + chunk.toString()
    })
    cmd.on('close',function(code){
      //clear to a new line now that the data print is done
      process.stdout.write('\n')
      if(code > 0) return reject(new Error('Find failed with code ' + code))
      debug('finished find, splitting and starting processing')
      var fileCount = 0
      var progress
      P.try(function(){
        var lines = buffer
          .split('\n')
          .filter(function(item){return '' !== item})
          .map(function(val){
            return path.resolve(val)
          })
        fileCount = lines.length
        console.log('Parsed find result into ' + fileCount + ' files')
        progress = new ProgressBar(
          '  scanning [:bar] :current/:total :percent :rate/fps :etas',
          {
            renderThrottle: 1000,
            total: fileCount,
            width: 50,
            complete: '=',
            incomplete: '-'
          }
        )
        return lines
      })
        .map(function(filePath){
          filePath = path.posix.resolve(filePath)
          debug('got a hit',filePath)
          var relativePath = path.posix.relative(contentFolder,filePath)
          var stat = fs.statSync(filePath)
          counter.bytes += stat.size
          var ext = relativePath.match(/\.(.+)$/)[0]
          var hash = relativePath.replace(/[\\\/]/g,'').replace(/\..+$/,'')
          var hashType = hasher.identify(hash)
          //skip invalid inventory entries
          progress.tick()
          if(!hash.match(hasher.hashExpressions[hashType])){
            counter.invalid++
            debug(hash,hashType,'invalid hash')
          }
          //otherwise try and insert them into inventory if they are not already
          //there
          else {
            counter.valid++
            debug(hash,'inventory scan found',ext,relativePath)
            fileStream.write(hash + '\n')
            hashList.push({
              hashType: hashType,
              hash: hash,
              ext: ext,
              relativePath: relativePath
            })
          }
        },{concurrency: config.store.inventoryConcurrency})
        .then(function(){
          debug('folder scan complete',counter,hashList)
          resolve(counter,hashList)
        })
        .catch(function(err){
          console.error('file process error',err)
          reject(err)
        })
    })
  })
}


/**
 * Scan inventory keys and return filtered hashes to the file stream
 * @param {string} type type of key either prism or store
 * @param {string} key the key itself such as om101
 * @param {object} fileStream the file stream to write results to
 * @return {P}
 */
var keyScan = function(type,key,fileStream){
  var keyBlockSize = 250000
  var keyList = []
  var totalRows = 1
  var inventoryKeyDownload = function(progress){
    // use a view to only transfer _id (no data since we don't use it here)
    // _design/keyList/all: { map: function(doc){emit(null,'')} }
    return couchdb.inventory.viewAsync('keyList/all',
      {limit: keyBlockSize, skip: keyList.length}
    )
      .then(function(result){
        totalRows = result.total_rows
        if(totalRows !== progress.total){
          progress.total = totalRows
        }
        result.rows.forEach(function(row){
          keyList.push(row.id)
          progress.tick()
        })
        if(!progress.complete){
          return inventoryKeyDownload(progress)
        } else {
          return keyList
        }
      })
  }
  var cacheKeyDownload = function(){
    return new P(function(resolve,reject){
      if(!fs.existsSync(cacheKeyTempFile)){
        console.log('Starting to download a fresh copy ' +
          'of inventory keys, stand by.')
        var progress = new ProgressBar(
          ' downloading [:bar] :current/:total :percent :rate/ks :etas',
          {
            renderThrottle: 1000,
            complete: '=',
            incomplete: ' ',
            width: 20,
            total: totalRows
          }
        )
        progress.update(0)
        return inventoryKeyDownload(progress)
          .then(function(result){
            result = result.sort()
            fs.writeFileSync(cacheKeyTempFile,JSON.stringify(result))
            resolve(result)
          })
      } else {
        console.log('Reading inventory keys from cache')
        try {
          var result = JSON.parse(fs.readFileSync(cacheKeyTempFile))
          resolve(result.sort())
        } catch(e){
          reject(e)
        }
      }
    })
  }
  var prevHash = 8675309
  return cacheKeyDownload()
    .map(function(inventoryKey){
      var parts = inventoryKey.split(':')
      if(!parts || 3 !== parts.length) return;
      if(prevHash === parts[0]) return; // skip dupes of previous winners
      if('allfiles' !== type && 'prism' === type && parts[1] !== key) return;
      if('allfiles' !== type && 'store' === type && parts[2] !== key) return;
      if(8675309 !== prevHash) fileStream.write('\n')
      fileStream.write(prevHash = parts[0])
    })
}

var ops = {}
var fileStream = new MemoryStream()
var fileList = []
var fileCount = 0
P.try(function(){
  var welcomeMessage = 'Welcome to the OOSE v' + config.version + ' clonetool!'
  console.log(welcomeMessage)
  console.log('--------------------')
  if(program.detail){
    return contentDetail(program.detail)
  }
  //do some validation
  if(!program.hash && !program.input && !program.folder &&
    !program.store && !program.prism && !program.allfiles){
    throw new UserError('No hash list or hash provided')
  }
  if(program.drop && !program.force){
    throw new UserError('Clone removal operation called without -f, bye.')
  }
  //set the desired to the default from config if not set
  if(!program.desired) program.desired = config.clonetool.desired
  //validate some logic states into booleans once, here
  program.at = parseInt(program.at,10)
  program.above = parseInt(program.above,10)
  program.below = parseInt(program.below,10)
  var validAt = function(){
    return (('number' === typeof program.at) && (-1<program.at))
  }
  var validAbove = function(){
    return (('number' === typeof program.above) && (0<program.above))
  }
  var validBelow = function(){
    return (('number' === typeof program.below) && (0<program.below))
  }
  //if no other target information provided look for files below the default
  if(!validBelow() && !validAbove() && !validAt()){
    program.below = +program.desired
  }
  if(validBelow()){
    program.at = false
    program.above = false
  }
  if(validAt()){
    program.above = false
    program.below = false
  }
  //print rule changes
  var changeVerb = 'somewhat near'
  if(validBelow()) changeVerb = 'below'
  if(validAbove()) changeVerb = 'above'
  if(validAt()) changeVerb = 'at'
  console.log('You have asked for ' + program.desired +
    pluralize(program.desired,' clone') +
    ' of each file ' + changeVerb +
    ' ' + program[changeVerb] +
    pluralize(program[changeVerb],' clone')
  )
  console.log('--------------------')

  //get file list together
  if(program.hash){
    fileStream.write(program.hash)
  } else if(program.force){
    fileStream.write(program.force)
  } else if(program.store){
    return keyScan('store',program.store,fileStream)
  } else if(program.prism){
    return keyScan('prism',program.prism,fileStream)
  } else if(program.allfiles){
    return keyScan('allfiles',null,fileStream)
  } else if(program.folder){
    return folderScan(program.folder,fileStream)
  } else if('-' === program.input){
    return promisePipe(process.stdin,fileStream)
  } else {
    return promisePipe(fs.createReadStream(program.input),fileStream)
  }
})
  .then(function(){
    fileList = fileStream.toString().split('\n')
    console.log('Input ' + fileList.length +
      pluralize(fileList.length,' entr','y','ies') + ', filtering'
    )
    var pruned = {}
    fileList = fileList.filter(function(a){
      var rv = !!(a.match(hasher.hashExpressions[hasher.identify(a)]))
      if(rv && (!program.force) &&
        (-1 !== config.clonetool.hashWhitelist.indexOf(a))
      ){
        pruned[a] = true
        rv = false
      }
      return rv
    })
    Object.keys(pruned).forEach(function(k){
      console.log(k,'is whitelisted and will not be analyzed, use -f to force')
    })
    fileCount = fileList.length
    if(0 === fileCount){
      console.log('No files left to analyze, bye')
      process.exit()
    }
    console.log('Found ' + fileCount +
      pluralize(fileCount,' file') +
      ' to be analyzed'
    )
    //console.log(fileList)

    var progress = new ProgressBar(
      '  analyzing [:bar] :current/:total :percent :rate/fs :etas',
      {
        renderThrottle: 1000,
        total: fileCount,
        width: 20,
        complete: '=',
        incomplete: ' '
      }
    )
    return analyzeFiles(program,progress,fileList)
  })
  .then(function(result){
    ops = result
    var keys = Object.keys(ops)
    var op,file
    var doesntExist = 0
    var add = 0
    var addTotal = 0
    var remove = 0
    var removeTotal = 0
    var unchanged = 0
    keys.forEach(function(hash){
      op = ops[hash]
      file = op.file
      if(!op.file.exists){
        doesntExist++
        if(program.verbose){
          console.log(op.file.hash + ' doesn\'t exist. :(')
        }
      }
      else if(op.fileActions.copy === op.action && op.repeat > 0){
        addTotal = addTotal + (+op.repeat)
        add++
        if(program.verbose){
          console.log(op.file.hash + ' has ' + op.file.count +
            ' clones and needs ' + op.repeat + ' more')
        }
      }
      else if(op.fileActions.unlink === op.action && op.repeat > 0){
        removeTotal = removeTotal + (+op.repeat)
        remove++
        if(program.verbose){
          console.log(op.file.hash + ' has ' + op.file.count +
            ' clones and needs ' + op.remove + ' less')
        }
      }
      else unchanged++
    })
    console.log('Analysis complete...')
    console.log('--------------------')
    console.log(fileCount + ' total ' + pluralize(fileCount,'file'))
    console.log(add + pluralize(add,' file') +
      pluralize(add,' want','s','') + ' clones' +
      ' totalling ' + addTotal + ' new ' + pluralize(addTotal,'clone')
    )
    console.log(remove + pluralize(remove,' file') +
      pluralize(remove,' want','s','') + ' less clones' +
      ' totalling ' + removeTotal + ' fewer ' + pluralize(removeTotal,'clone')
    )
    console.log(unchanged + pluralize(unchanged,' file') +
      ' will not be changed'
    )
    console.log(doesntExist + pluralize(doesntExist,' file') + ' don\'t exist')
    console.log('--------------------')
    if(program.pretend){
      console.log('Pretend mode selected, taking no action, bye!')
      process.exit()
    }

    //obtain peer list
    console.log('Obtaining peer list')
    return prismBalance.peerList()
  })
  .then(function(result){
    peerList = result
    console.log('Peer list obtained!')

    //process the files
    return Object.keys(ops)
  })
  .each(function(hash){
    return processOp(ops[hash])
  })
  .then(function(){
    console.log('Operations complete, bye!')
    process.exit()
  })
  .catch(UserError,function(err){
    console.error('Oh no! An error has occurred :(')
    console.error(err.message)
    process.exit()
  })
