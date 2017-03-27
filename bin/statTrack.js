#!/usr/bin/node
'use strict';
var P = require('bluebird')
var debug = require('debug')('stats')
var program = require('commander')
var oose = require('oose-sdk')
var path = require('path')
var si = require('systeminformation')
var procfs = require('procfs-stats')

var UserError = oose.UserError

var config = require('../config')

var redis = require('../helpers/redis')(config.stats.redis)
var lsof = require('../helpers/lsof')

//setup cli parsing
program
  .version(config.version)
  .option('-f, --force','Force the operation even on this hash')
  .option('-p, --pretend','Dont actually make and clones just analyze')
  .option('-S, --store <store>','Use file list from this store')
  .option('-v, --verbose','Be verbose and show hash list before processing')
  .parse(process.argv)

var storeList = []
var storeCount = +(storeList.length)
// stats Object.keys are storeName
//  with sub-Object.keys as section, then user-defined data
var stats = {}
var statUpdate = function(store,section,data){
  if(!(store in stats)){
    stats[store] = {}
    storeList = (Object.keys(stats)).sort()
    storeCount = +(storeList.length)
  }
  if(!(section in stats[store])){
    stats[store][section] = null
  }
  stats[store][section] = data
}
var buildBatch = function(fsData,hashData){
  //build batch of redis promises
  var batch = []
  var fKey = Object.keys(fsData).sort()
  var fKeyCount = fKey.length
  for(var e=0;e<fKeyCount;e++){
    batch.push(redis.hmsetAsync(fKey[e],fsData[fKey[e]]))
    batch.push(redis.expireAsync(fKey[e],86400))
  }
  var hKey = Object.keys(hashData).sort()
  var hKeyCount = hKey.length
  for(var f=0;f<hKeyCount;f++){
    batch.push(redis.zaddAsync(hKey[f],hashData[hKey[f]]))
    batch.push(redis.expireAsync(hKey[f],86400))
  }
}
var procDisk = {}
P.try(function(){
  console.log('Welcome to the OOSE v' + config.version + ' statTrack!')
  console.log('--------------------')
  if(!procfs.works) { throw new UserError('procfs does not exist?') }
  var ndt = require('/etc/ndt/ndt.json')
  return ndt.apps
})
.then(function(result){
  var sL = Object.keys(result)
  var resultCount = +(sL.length)
  console.log('Loaded '+resultCount+' apps from NDT database')
  var _loadAppCfg = function(x){
    return new Promise(function(r){r(require(result[sL[x]].env.OOSE_CONFIG))})
  }
  var loadConfigs = []
  for(var x=0;x<resultCount;x++){
    loadConfigs.push(_loadAppCfg(x))
  }
  return P.all(loadConfigs)
})
.then(function(result){
  console.log('Loaded instance config files')
  for(var x=0;x<result.length;x++){
    var r = result[x]
    if(r.store && r.store.name) statUpdate(r.store.name,'cfg',r)
  }
  if(!storeList.length) throw new UserError('No stores configured here?')
  return new Promise(function(r){
    procfs.disk(function(a,b){r(b)})
  })
})
.then(function(result){
  console.log('FS: procfs disk data obtained!')
  for(var x=0;x<result.length;x++){
    var r = result[x]
    if(r.device){
      procDisk[r.device] = {
          reads_completed: +r.reads_completed,
          reads_merged: +r.reads_merged,
          sectors_read: +r.sectors_read,
          ms_reading: +r.ms_reading,
          writes_completed: +r.writes_completed,
          writes_merged: +r.writes_merged,
          sectors_written: +r.sectors_written,
          ms_writing: +r.ms_writing,
          ios_pending: +r.ios_pending,
          ms_io: +r.ms_io,
          ms_weighted_io: +r.ms_weighted_io
      }
    }
  }
  return si.fsSize()
})
.then(function(result){
  console.log('FS: sizes obtained!')
  var statByMount = {}
  for(var i=0;i<result.length;i++){
    statByMount[result[i].mount] = result[i]
  }
  var sortReversed = function(a,b){if(a>b)return -1;if(a<b)return 1;return 0}
  var mounts = Object.keys(statByMount).sort(sortReversed)
  var mountCount = +(mounts.length)
  for(var x=0;x<mountCount;x++){
    var m = mounts[x]
    for(var y=0;y<storeCount;y++){
      var s = storeList[y]
      var pathHit = path.dirname(stats[s].cfg.root).match('^'+m)
      if(pathHit && (!stats[s].fs)){
        var r = statByMount[m]
        var devName = r.fs.match(/^\/dev\/(.+)$/)
        var data = procDisk[devName[1]]
        data.dev = devName[1]
        data.mount = m
        data.size = r.size
        data.used = r.used
        statUpdate(s,'fs',data)
      }
    }
  }
  var lsofTargets = []
  for(var z=0;z<storeCount;z++){
    lsofTargets.push(lsof.exec('-anc nginx '+stats[storeList[z]].fs.mount))
  }
  return P.all(lsofTargets)
})
.then(function(result){
  console.log('FS: lsof data obtained!')
  for(var x=0;x<storeCount;x++){
    var s = storeList[x]
    var r = result.shift()
    var contentDir = stats[s].cfg.root+'/content/'
    var hashUsage = {}
    for(var y=0;y<r.length;y++){
      var pathHit = r[y].name.match('^'+contentDir)
      if(pathHit){
        var hash = pathHit.input
          .replace(pathHit[0],'')
          .replace(/\//g,'')
          .replace(/\..*$/,'')
        hashUsage[hash] = (hashUsage[hash])?hashUsage[hash]+1:1
      }
    }
    statUpdate(s,'hashUsage',hashUsage)
  }
})
.then(function(){
  //jam shit in redis here
  var timeStamp = ((+new Date())/1000) | 0
  return redis.selectAsync(
    ('number' === typeof config.stats.redis.db)?config.stats.redis.db:15
  )
    .then(function(rv){
      debug('redis_select',
       ('number' === typeof config.stats.redis.db)?config.stats.redis.db:15,
       rv)
      //debug(stats)
      var fsData = {}
      var hashData = {}
      for(var a=0;a<storeCount;a++){
        var sLa = storeList[a]
        //FS section: stack the args for HMSET (convert hash to array)
        var fsDataKey = [sLa,'fs',timeStamp].join(':')
        fsData[fsDataKey] = []
        var fsKey = Object.keys(stats[sLa].fs)
        var fsKeyCount = fsKey.length
        for(var b=0;b<fsKeyCount;b++){
          var fKb = fsKey[b]
          fsData[fsDataKey].push(fKb,stats[sLa].fs[fKb])
        }
        //HASH section: stack the args for ZADD (convert hash to array)
        var hashDataKey = [sLa,'hU',timeStamp].join(':')
        hashData[hashDataKey] = []
        var hashKey = Object.keys(stats[sLa].hashUsage).sort()
        var hashKeyCount = hashKey.length
        for(var d=0;d<hashKeyCount;d++){
          var hKd = hashKey[d]
          // ZADD takes things 'backwards', below uses val,key
          hashData[hashDataKey].push(stats[sLa].hashUsage[hKd],hKd)
        }
      }
      //build and run the actual batch of redis promises
      return P.all(buildBatch(fsData,hashData))
    })
})
.then(function(result){
  debug(result)
  return redis.keysAsync('*')
})
.then(function(result){
  debug(result.sort())
  console.log('Operations complete, bye!')
  process.exit()
})
.catch(UserError,function(err){
  console.error('Oh no! An error has occurred :(')
  console.error(err.message)
  debug.log(stats)
  process.exit()
})
