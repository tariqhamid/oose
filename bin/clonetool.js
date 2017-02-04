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
var ProgressBar = require('progress')
var promisePipe = require('promisepipe')
var random = require('random-js')()

var UserError = oose.UserError

var couchdb = require('../helpers/couchdb')
var hasher = require('../helpers/hasher')
var prismBalance = require('../helpers/prismBalance')

var config = require('../config')

var cacheKeyTempFile = '/tmp/oosectkeycache'

//store our master peerList
var peerList = {}

//hashes in this list will never be modified without force action
var hashWhitelist = [
  'a03f181dc7dedcfb577511149b8844711efdb04f'
]

//setup cli parsing
program
  .version(config.version)
  .option('-a, --above <n>','Files above this count will be analyzed')
  .option('-A, --at <n>','Files at this count will be analyzed')
  .option('-b, --below <n>','Files below this count will be analyzed')
  .option('-B, --block-size <n>','Number of files to analyze at once')
  .option('-d, --desired <n>','Desired clone count')
  .option('-D, --detail <s>','Hash of file to get details about')
  .option('-f, --force','Force the operation even on protected hashes')
  .option('-i, --input <s>','List of Hashes line separated ' +
  'to analyze, use - for stdin')
  .option('-p, --pretend','Dont actually make and clones just analyze')
  .option('-r, --remove','Remove target files')
  .option('-H, --hash <hash>','Hash of file to check')
  .option('-f, --folder <folder>','Folder to scan')
  .option('-S, --store <store>','Use file list from this store')
  .option('-P, --prism <prism>','Use file list from this prism')
  .option('-V, --verify','Verify file(s) by having stores verify integrity')
  .option('-v, --verbose','Be verbose and show hash list before processing')
  .option('-X, --allfiles','Use all files')
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


var analyzeFiles = function(progress,fileList){
  var above = false !== program.above ? +program.above : null
  var at = false !== program.at ? +program.at : null
  var below = false !== program.below ? +program.below : null
  var desired = false !== program.desired ? + program.desired : 2
  var files = {}
  var fileCount = fileList.length
  var blockSize = program.blockSize || 250
  var blockCount = Math.ceil(fileCount / blockSize)
  var analyzeBlock = function(fileBlock){
    return P.try(function(){
      return fileBlock
    })
      .map(function(file){
        return prismBalance.contentExists(file)
          .then(function(record){
            //do clone math now
            record.add = 0
            record.remove = 0
            if(
              (null !== above && record.count > above) ||
              (null !== below && record.count < below) ||
              (null !== at && record.count === at)
            )
            {
              if(desired > record.count){
                record.add = desired - record.count
              }
              else if(desired < record.count){
                record.remove = record.count - desired
              }
            }
            //compile our record
            files[record.hash] = record
            return record
          })
      })
      .finally(function(){
        progress.tick(fileBlock.length)
      })
  }
  return P.try(function(){
    var blockList = []
    for(var i = 0; i < blockCount; i++){
      blockList.push(fileList.slice(i * blockSize,(i + 1) * blockSize))
    }
    return blockList
  })
    .each(function(block){
      return analyzeBlock(block)
    })
    .then(function(){
      return files
    })
}

var addClones = function(file){
  var promises = []
  var storeWinnerList = []
  var addClone = function(file){
    // so to create a clone we need to figure out a source store
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
      console.log(file.hash,
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
            console.log(file.hash,
              'Send to ' + storeToWinner.store + ' complete')
          }
        })
        .catch(function(err){
          console.log(file.hash,
            'Failed to send clone to ' + storeToWinner.store,err.message)
        })
    }
  }
  for(var i = 0; i < file.add; i++){
    promises.push(addClone(file))
  }
  return P.all(promises)
}

var removeClones = function(file){
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
      var peer = selectPeer('store',storeName)
      prismNameList.push(prismName)
      storeNameList.push(storeName)
      if(-1 === storeWinnerList.indexOf(storeName) && true === peer.available){
        storeRemoveList.push({prism: prismName,store: storeName})
      }
    })
    //make sure there is a possibility of a winner
    if(!storeRemoveList.length){
      console.log(file.hash,
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
    }
  }
  for(var i = 0; i < file.remove; i++){
    promises.push(removeClone(file))
  }
  return P.all(promises)
}

var verifyFile = function(file){
  //first grab a store to ask for info
  if(!file.count || !file.exists || !(file.map instanceof Array)){
    console.log(file.hash,'Doesnt exist, cant verify')
    return
  }
  return P.try(function(){
    return file.map
  })
    .each(function(storeKey){
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
            console.log(file.hash,'Verify failed',body.error,body)
          } else if(body && 'ok' === body.status){
            console.log(file.hash,
              'Inventory verification complete on ' + keyParts[1])
          } else if(body && 'fail' === body.status){
            console.log(file.hash,
              'Invalid content on ' + keyParts[1] + ' clone removed')
          } else {
            console.log(file.hash,'Unknown issue',body)
          }
        })
    })
}

var processFile = function(file){
  return P.try(function(){
    if(file.add > 0){
      return addClones(file)
    }
  })
    .then(function(){
      if(file.remove > 0){
        return removeClones(file)
      }
    })
    .then(function(){
      if(program.verify){
        return verifyFile(file)
      }
    })
    .then(function(){
      console.log(file.hash,'Processing complete')
    })
}

var relativePath = function(hash,ext){
  ext = ext.replace('.','')
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
      console.log('\n Total: ' + clc.yellow(result.count) + ' clone(s)\n')
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
          console.log('file process error',err)
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
  var progress = null
  var keyBlockSize = 250000
  var keyList = []
  var pointer = 0
  var totalRows = 0
  var inventoryKeyDownload = function(){
    return couchdb.inventory.allAsync({limit: keyBlockSize, skip: pointer})
      .then(function(result){
        if(!totalRows) totalRows = result.total_rows
        if(!progress){
          progress = new ProgressBar(
            ' downloading [:bar] :current/:total :percent :rate/ks :etas',
            {
              complete: '=',
              incomplete: ' ',
              width: 20,
              total: totalRows
            }
          )
        }
        progress.tick(keyBlockSize)
        result.rows.forEach(function(row){
          keyList.push(row.key)
        })
        pointer = pointer + keyBlockSize
        if(totalRows > pointer){
          return inventoryKeyDownload()
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
        return inventoryKeyDownload()
          .then(function(result){
            fs.writeFileSync(cacheKeyTempFile,JSON.stringify(result))
            resolve(result)
          })
      } else {
        console.log('Reading inventory keys from cache')
        var result = fs.readFileSync(cacheKeyTempFile)
        try {
          result = JSON.parse(result)
          resolve(result)
        } catch(e){
          reject(e)
        }
      }
    })

  }
  return cacheKeyDownload()
    .map(function(inventoryKey){
      var parts = inventoryKey.split(':')
      if(!parts || 3 !== parts.length) return
      if('allfiles' !== type && 'prism' === type && parts[1] !== key) return
      if('allfiles' !== type && 'store' === type && parts[2] !== key) return
      fileStream.write(parts[0] + '\n')
    })
}

var files = {}
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
    throw new UserError('No file list or file provided')
  }
  //set the desired to the default of 2 if not set
  if(!program.desired) program.desired = 2
  //if no other target information provided look for files below the default
  if(!program.below && !program.above){
    program.below = 2
    program.above = false
  }
  //print rule changes
  var changeVerb = 'below'
  if(program.above) changeVerb = 'above'
  if(program.at) changeVerb = 'at'
  console.log('You have asked for ' + program.desired +
    ' clone(s) of each file ' + changeVerb +
    ' ' + program[changeVerb] + ' clone(s)')
  console.log('--------------------')
  //obtain peer list
  console.log('Obtaining peer list')
  return prismBalance.peerList()
})
  .then(function(result){
    peerList = result
    console.log('Peer list obtained!')
    //get file list together
    if(program.hash){
      fileStream.write(program.hash)
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
    fileList = fileList.filter(function(a){
      return a.match(hasher.hashExpressions[hasher.identify(a)])
    })
    if(!program.force){
      fileList.forEach(function(file,i){
        if(hashWhitelist.indexOf(file) >= 0){
          console.log(file,
            'Is whitelisted and will not be analyzed, use -f to force')
          fileList.splice(i,1)
        }
      })
    }
    fileCount = fileList.length
    if(0 === fileCount){
      console.log('No files left to analyze, bye')
      process.exit()
    }
    var progress = new ProgressBar(
      '  analyzing [:bar] :current/:total :percent :rate/fs :etas',
      {
        total: fileCount,
        width: 20,
        complete: '=',
        incomplete: ' '
      }
    )
    console.log('Found ' + fileCount + ' file(s) to be analyzed')
    //console.log(fileList)
    return analyzeFiles(progress,fileList)
  })
  .then(function(result){
    files = result
    var keys = Object.keys(files)
    var file
    var doesntExist = 0
    var add = 0
    var addTotal = 0
    var remove = 0
    var removeTotal = 0
    var unchanged = 0
    keys.forEach(function(hash){
      file = files[hash]
      if(!file.exists) doesntExist++
      else if(file.add > 0){
        addTotal = addTotal + (+file.add)
        add++
        if(program.verbose){
          console.log(file.hash + ' has ' + file.count +
            ' clones and needs ' + file.add + ' more')
        }
      }
      else if(file.remove > 0){
        removeTotal = removeTotal + (+file.remove)
        remove++
        if(program.verbose){
          console.log(file.hash + ' has ' + file.count +
            ' clones and needs ' + file.remove + ' less')
        }
      }
      else unchanged++
    })
    console.log('Analysis complete...')
    console.log('--------------------')
    console.log(fileCount + ' total file(s)')
    console.log(add + ' file(s) want clones totalling ' +
      addTotal + ' new clone(s)')
    console.log(remove + ' file(s) dont need as many clones totalling ' +
      removeTotal + ' fewer clones')
    console.log(unchanged + ' file(s) will not be changed')
    console.log(doesntExist + ' file(s) dont exist')
    console.log('--------------------')
    if(program.pretend){
      console.log('Pretend mode selected, taking no action, bye!')
      process.exit()
    }
    return Object.keys(files)
  })
  .each(function(hash){
    var file = files[hash]
    if(file.add > 0 || file.remove > 0 || program.verify){
      console.log('--------------------')
      console.log(file.hash + ' starting to process changes')
      return processFile(file)
    }
  })
  .then(function(){
    console.log('Operations complete, bye!')
    process.exit()
  })
  .catch(UserError,function(err){
    console.log('Oh no! An error has occurred :(')
    console.log(err.stack)
  })
