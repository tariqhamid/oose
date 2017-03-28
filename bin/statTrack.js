#!/usr/bin/node
'use strict';
var P = require('bluebird')
var debug = require('debug')('statTrack')
var program = require('commander')
var ObjectManage = require('object-manage')
var oose = require('oose-sdk')
var path = require('path')
var si = require('systeminformation')
var procfs = require('procfs-stats')

var UserError = oose.UserError

var config = require('../config')

var stats = require('../helpers/stats')()
var lsof = require('../helpers/lsof')
var redisHelper = require('../helpers/redis')
var redis = {
  'local': redisHelper(config.redis),
  'remote': redisHelper(stats.config.redis)
}

//setup cli parsing
program
  .version(config.version)
  .option('-f, --force','Force the operation even on this hash')
  .option('-p, --pretend','Dont actually make and clones just analyze')
  .option('-S, --store <store>','Use file list from this store')
  .option('-v, --verbose','Be verbose and show hash list before processing')
  .parse(process.argv)

var buildBatch = function(datas){
  debug('buildBatch:datas',datas)
  var stats = new ObjectManage()
  datas.forEach(function(i){stats.$load(i)})
  stats = stats.$strip()
  debug('buildBatch:stats',stats)
  //build batch of redis promises
  var batch = []
  Object.keys(stats).sort().forEach(function(fKey){
    var p = fKey.split(':')
    switch(p[1]){
    case 'fs':
    case 'oD':
      batch.push(redis.remote.hmsetAsync(fKey,stats[fKey]))
      batch.push(redis.remote.expireAsync(fKey,86400))
      break
    case 'hU':
      batch.push(redis.remote.zaddAsync(fKey,stats[fKey]))
      batch.push(redis.remote.expireAsync(fKey,86400))
      break
    default:
      console.error('buildBatch: stats contained unhandled section:',fKey,p)
    }
  })
  return batch
}

var procDisk = {}
var counterKeys = []
var redisKeys = []
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
    debug(sL)
    var _loadAppCfg = function(sLx){
      return new Promise(function(r){
        r(require(result[sLx].env.OOSE_CONFIG))
      })
    }
    var loadConfigs = []
    sL.forEach(function(sLx){
      loadConfigs.push(_loadAppCfg(sLx))
    })
    return P.all(loadConfigs)
  })
  .then(function(result){
    console.log('Loaded instance config files')
    debug(result)
    result.forEach(function(r){
      if(r.store && r.store.name) stats.set(r.store.name,'cfg',r)
    })
    if(!stats.refList.length)
      throw new UserError('No stores configured here?')
    return new Promise(function(r){
      procfs.disk(function(a,b){r(b)})
    })
  })
  .then(function(result){
    console.log('fs: procfs disk data obtained!')
    debug(result)
    result.forEach(function(r){
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
    })
    return si.fsSize()
  })
  .then(function(result){
    console.log('fs: sizes obtained!')
    var statByMount = {}
    result.forEach(function(r){
      statByMount[r.mount] = r
    })
    var sortReversed = function(a,b){if(a>b)return -1;if(a<b)return 1;return 0}
    var mounts = Object.keys(statByMount).sort(sortReversed)
    mounts.forEach(function(m){
      stats.refList.forEach(function(s){
        var pathHit = path.dirname(stats.get(s,'cfg').root).match('^'+m)
        if(pathHit && (!stats.get(s,'fs'))){
          var r = statByMount[m]
          var devName = r.fs.match(/^\/dev\/(.+)$/)
          var data = procDisk[devName[1]]
          data.dev = devName[1]
          data.mount = m
          data.size = r.size
          data.used = r.used
          stats.set(s,'fs',data)
        }
      })
    })
    var lsofTargets = []
    stats.refList.forEach(function(ref){
      debug('Executing lsof -anc nginx '+stats.get(ref,'fs').mount)
      lsofTargets.push(
        lsof.exec('-anc nginx '+stats.get(ref,'fs').mount)
      )
    })
    return P.all(lsofTargets)
  })
  .then(function(result){
    console.log('hashUsage: lsof data obtained!')
    debug(result)
    stats.refList.forEach(function(s){
      var contentDir = stats.get(s,'cfg').root+'/content/'
      var hashUsage = {}
      result.shift().forEach(function(r){
        var pathHit = r.name.match('^'+contentDir)
        if(pathHit){
          var hash = pathHit.input
            .replace(pathHit[0],'')
            .replace(/\//g,'')
            .replace(/\..*$/,'')
          hashUsage[hash] = (hashUsage[hash])?hashUsage[hash]+1:1
        }
      })
      stats.set(s,'hashUsage',hashUsage)
    })
    return redis.local.keysAsync('oose:counter:*')
  })
  .then(function(result){
    debug(result)
    var batch = []
    result.forEach(function(i){
      counterKeys.push(i)
      batch.push(redis.local.getAsync(i))
    })
    return P.all(batch)
  })
  .then(function(result){
    console.log('API: Polled local OOSE counters')
    debug(counterKeys,result)
    var ooseData = {}
    var i = 0
    counterKeys.sort().forEach(function(k){
      ooseData[k]=result[i++]
    })
    stats.set('API','ooseData',ooseData)
  })
  .then(function(){
    //jam shit in redis here
    return P.try(function(){
      var statData = {}
      stats.refList.forEach(function(sLa){
        if('API' === sLa){ //API Global stat
          //OOSE section: stack the args for HMSET (convert hash to array)
          var ooseDataKey = stats.keyGen(sLa,'oD')
          statData[ooseDataKey] = []
          var ooseData = stats.get(sLa,'ooseData')
          Object.keys(ooseData).sort().forEach(function(oKc){
            statData[ooseDataKey].push(oKc,ooseData[oKc])
          })
        } else { //Store Specific stat
          //FS section: stack the args for HMSET (convert hash to array)
          var fsDataKey = stats.keyGen(sLa,'fs')
          statData[fsDataKey] = []
          var fs = stats.get(sLa,'fs')
          Object.keys(fs).forEach(function(fKb){
            statData[fsDataKey].push(fKb,fs[fKb])
          })
          //HASH section: stack the args for ZADD (convert hash to array)
          var hashUsageKey = stats.keyGen(sLa,'hU')
          statData[hashUsageKey] = []
          var hashUsage = stats.get(sLa,'hashUsage')
          Object.keys(hashUsage).sort().forEach(function(hKd){
            // ZADD takes things 'backwards', below uses val,key
            statData[hashUsageKey].push(hashUsage[hKd],hKd)
          })
        }
      })
      //build and run the actual batch of redis promises
      return P.all(buildBatch([statData]))
    })
  })
  .then(function(result){
    debug(result)
    console.log('Redis content sent to remote')
    return redis.remote.keysAsync(stats.keyGen('*','*'))
  })
  .then(function(result){
    var batch = []
    result.sort().forEach(function(i){
      var p = i.split(':')
      switch(p[1]){
      case 'fs':
      case 'oD':
        batch.push(redis.remote.hscanAsync(i,0))
        redisKeys.push(i)
        break
      case 'hU':
        batch.push(redis.remote.zscanAsync(i,0))
        redisKeys.push(i)
        break
      default:
        console.error('redisDump: stats contained unhandled section:',p)
      }
    })
    return P.all(batch)
  })
  .then(function(result){
    console.log('Redis content readback:')
    redisKeys.forEach(function(k){
      var v = result.shift()
      var kk = ''
      var vv = ''
      var sync = false
      v[1].forEach(function(j){
        switch(sync){
        case false:
          kk = j
          break
        case true:
          vv = j
          console.log([k,kk].join('.'),'=',vv)
          break
        default:
          console.error('Hit switch default in binary case?')
        }
        sync = !sync
      })
    })
    console.log('Operations complete, bye!')
    process.exit()
  })
  .catch(UserError,function(err){
    console.error('Oh no! An error has occurred :(')
    console.error(err.message)
    debug.log(stats)
    process.exit()
  })
