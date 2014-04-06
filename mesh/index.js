'use strict';
var communicator = require('../helpers/communicator')
  , logger = require('../helpers/logger')
  , redis = require('../helpers/redis')
  , config = require('../config')
  , async = require('async')
  , redis = require('redis')
  , shortId = require('shortid')

//connection handles
var mesh = {}


/**
 * Send ready state change
 * @param {number} state
 * @param {function} done
 */
mesh.readyState = function(state,done){
  if('function' !== typeof done) done = function(){}
//  redis.hset('peers:' + config.get('hostname'),'readyState',state,function(err){
//    if(err) done(err)
//    mesh.udp.send('readyState',{readyState: state})
    done()
//  })
}


/**
 * Start connections
 * @param {function} done
 */
mesh.start = function(done){
  //start udp
  mesh.udp = communicator.UDP({
    port: config.get('mesh.port'),
    address: config.get('mesh.address'),
    multicast: {
      address: config.get('mesh.multicast.address'),
      ttl: config.get('mesh.multicast.ttl'),
      interfaceAddress: config.get('mesh.multicast.interfaceAddress')
    }
  })
  //start tcp
  mesh.tcp = communicator.TCP({port: config.get('mesh.port')})
  //connection error handling
  mesh.udp.on('error',logger.error)
  mesh.tcp.on('error',logger.error)
  //routes
  async.eachSeries([
    'locate'
  ],function(r,next){
    logger.info('Mesh loaded handler for ' + r)
    mesh.udp.on(r,function(req,rinfo){
      if(mesh[r] && 'function' === typeof mesh[r]){
        req.rinfo = rinfo
        mesh[r](req)
      }
    })
    next()
  })
  done()
}


/**
 * Stop mesh
 * @param {function} done
 */
mesh.stop = function(done){
  async.series([mesh.udp.close,mesh.tcp.close],done)
}


/**
 * Locate peers with inventory containing SHA1
 * @param {string} sha1 SHA1 sum to locate (40 hex chars)
 * @param {function} done
 */
mesh.locate = function(sha1,done){
  if('object' === typeof sha1){
    //called from the main listener
    console.log(require('util').inspect(sha1))
  }
  //client
//  mesh.udp.on('pong',function(res,rinfo){
//    pingHosts[rinfo.address] = new Date().getTime() - start
//  })
/*
  async.series(
    [
      function(next){
        redis.sismember('inventory',sha1,next)
      },
      mesh.tcp.close
    ],
    done
  )
*/
  done()
}


/**
 * Export mesh object
 */
module.exports = mesh
