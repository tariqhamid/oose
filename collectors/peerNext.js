'use strict';
var async = require('async')

var Collector = require('../helpers/collector')
var logger = require('../helpers/logger').create('collector:peerNext')
var redis = require('../helpers/redis')

var config = require('../config')

var publicParams = [
  'hostname',
  'ip',
  'portMesh',
  'portExport',
  'portImport',
  'portPrism',
  'portShredder',
  'services',
  'diskFree',
  'availableCapacity',
  'hits'
]

var selectPeer = function(basket,done){
  var peerInfo = {}
  var peerList = []
  async.series(
    [
      //get peers ordered by rank
      function(next){
        redis.zrevrangebyscore('peer:rank',100,0,function(err,results){
          if(err) return next(err)
          if(!results || !results.length) return next('No peers exist')
          peerList = results
          next()
        })
      },
      //collect info for all the peers in parallel
      function(next){
        async.each(
          peerList,
          function(hostname,next){
            redis.hgetall('peer:db:' + hostname,function(err,result){
              var info = {}
              if(err) return next(err)
              if(!result)
                return next('Peer ' + hostname + ' doesnt exist in database')
              if(!result.hostname || !result.ip)
                return next('Cant use ' + hostname + ': missing IP or hostname')
              publicParams.forEach(function(k){
                info[k] = result[k] || 'none'
              })
              info.ip = result.ip || result.netIp
              info.domain = config.domain
              peerInfo[hostname] = JSON.stringify(info)
              next()
            })
          },
          next
        )
      }
    ],
    function(err){
      if(err){
        logger.error(err)
        return done(err)
      }
      basket = peerInfo
      done(null,basket)
    }
  )
}

var save = function(basket,done){
  if(Object.keys(basket).length > 0){
    redis.hmset('peer:next',basket,function(err){
      if(err) done('Couldn\'t save next peer:' + err)
      else done(null,basket)
    })
  } else done(null,basket)
}

var peerNext = new Collector()
peerNext.collect(selectPeer)
peerNext.save(save)
peerNext.on('error',function(err){
  logger.error(err)
})


if(require.main === module){
  process.on('message',function(msg){
    if('stop' === msg){
      peerNext.stop(function(err){
        if(err){
          process.send({status: 'error', message: msg})
          process.exit(1)
        }
        process.exit()
      })
    }
  })
  var start = function(){
    peerNext.start(config.mesh.peerNext.interval,500,function(err){
      if(err){
        process.send({status: 'error', message: err})
        process.exit(1)
      }
      process.send({status: 'ok'})
    })
  }
  start()
}
