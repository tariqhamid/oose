#!/usr/bin/node
'use strict';
var P = require('bluebird')
var debug = require('debug')('clonetool')
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
// stats Object.keys are storeName with sub-Object.keys as section, then user-defined data
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
var procDisk = {}
var procFD   = {}
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
  var loadConfigs = []
  for(var x=0;x<resultCount;x++){
    loadConfigs.push(new Promise(function(resolve){resolve(require(result[sL[x]].env.OOSE_CONFIG))}))
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
  return new Promise(function(resolve){procfs.disk(function(a,b,c){resolve(b)})})
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
          ms_weighted_io: +r.ms_weighted_io,
      }
    }
  }
  return si.fsSize()
})
.then(function(result){
  console.log('FS: sizes obtained!')
  var statByMount = {}
  for(var x=0;x<result.length;x++){
    statByMount[result[x].mount] = result[x]
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
  for(var x=0;x<storeCount;x++){
    var s = storeList[x]
    lsofTargets.push(lsof.exec('-anc nginx '+stats[s].fs.mount))
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
        var hash = pathHit.input.replace(pathHit[0],'').replace(/\//g,'').replace(/\..*$/,'')
        hashUsage[hash] = (hashUsage[hash])?hashUsage[hash]+1:1
      }
    }
    statUpdate(s,'hashUsage',hashUsage)
  }
})
.then(function(){
  //jam shit in redis here
  var tstamp = ((+new Date())/1000) | 0
  return redis.selectAsync(('number' === typeof config.stats.redis.db)?config.stats.redis.db:15)
    .then(function(rv){
      //console.log('redis_select',('number' === typeof config.stats.redis.db)?config.stats.redis.db:15,rv)
      //console.log(stats)
      //FS section: stack the args for HMSET (convert hash to array)
      var fsData = {}
      for(var x=0;x<storeCount;x++){
        var s = storeList[x]
        var key = [s,'fs',tstamp].join(':')
        fsData[key] = []
        var fsKey = Object.keys(stats[s].fs)
        var fsKeyCount = fsKey.length
        for(var y=0;y<fsKeyCount;y++){
          var k = fsKey[y]
          fsData[key].push(k,stats[s].fs[k])
        }
      }
      //HASH section: stack the args for ZADD (convert hash to array)
      var hashData = {}
      for(var x=0;x<storeCount;x++){
        var s = storeList[x]
        var key = [s,'hU',tstamp].join(':')
        hashData[key] = []
        var hashKey = Object.keys(stats[s].hashUsage).sort()
        var hashKeyCount = hashKey.length
        for(var y=0;y<hashKeyCount;y++){
          var k = hashKey[y]
          hashData[key].push(stats[s].hashUsage[k],k) // ZADD takes things 'backwards'
        }
      }
      //build and run the actual batch of redis promises
      var batch = []
      var dKey = Object.keys(fsData).sort()
      var dKeyCount = dKey.length
      for(var x=0;x<dKeyCount;x++){
        batch.push(redis.hmsetAsync(dKey[x],fsData[dKey[x]]))
        batch.push(redis.expireAsync(dKey[x],86400))
      }
      var dKey = Object.keys(hashData).sort()
      var dKeyCount = dKey.length
      for(var x=0;x<dKeyCount;x++){
        batch.push(redis.zaddAsync(dKey[x],hashData[dKey[x]]))
        batch.push(redis.expireAsync(dKey[x],86400))
      }
      return P.all(batch)
    })
})
.then(function(result){
  //console.log(result)
  return redis.keysAsync('*')
})
.then(function(result){
  console.log(result.sort())
  console.log('Operations complete, bye!')
  process.exit()
})
.catch(UserError,function(err){
  console.error('Oh no! An error has occurred :(')
  console.error(err.message)
  console.log(stats)
  process.exit()
})
