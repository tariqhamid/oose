'use strict';
var communicator = require('../helpers/communicator')
  , logger = require('../helpers/logger')
  , redis = require('../helpers/redis')
  , config = require('../config')
  , async = require('async')
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
  redis.hset('peers:' + config.get('hostname'),'readyState',state,function(err){
    if(err) done(err)
    mesh.udp.send('readyState',{readyState: state})
    done()
  })
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
   //NOTE THIS IS HERE AS A TEST INJECTION (7 second delay)
    setTimeout(function(){
      var sha1 = '65093ef4dbd6cfa1ad58dc4202abd9517f0d7838'
      logger.info('[TEST] calling mesh.locate(' + sha1 + ')')
      mesh.locate(sha1,function(err,result){
        logger.info('[TEST] mesh.locate(' + sha1 + ') reply: ',require('util').inspect(result))
      })
    },7000)
    next()
  })
  done()
}


/**
 * Stop mesh
 * @param {function} done
 */
mesh.stop = function(done){
  //this looks excessive but its the only way to maintain the scope of the close functions
  async.series([
    function(next){mesh.udp.close(next)},
    function(next){mesh.tcp.close(next)}
  ],done)
}


/**
 * Locate peers with inventory containing SHA1
 * @param {multiple} sha1 SHA1 sum to locate (40 hex chars, or 20 byte Buffer)
 * @param {function} done Callback
 */
mesh.locate = function(sha1,done){
  //check for Buffer first, because it false positives the typeof below
  if(sha1 instanceof Buffer && 20 === sha1.length){
    //called with a SHA1 binary Buffer, convert and fall thru
    sha1 = sha1.toString('hex')
  } else if('object' === typeof sha1){
    //called from the main listener
    if(config.get('mesh.debug') > 0){
      logger.info(
        '[MCAST LOCATE] who has ' + sha1.sha1 +
        ' tell ' + sha1.rinfo.address +
        ' @ ' + sha1.token
      )
    }
    redis.sismember('inventory',sha1.sha1,function(err,result){
      mesh.udp.send(sha1.token,{sha1:sha1.sha1,exists:!!result})
    })
  }// intentionally no else
  if('string' === typeof sha1 && 40 === sha1.length){
    //called with a SHA1 hex string
    var token = shortId.generate()
    var basket = {}, locateTimeout
    mesh.udp.on(token,function(req,rinfo){
      if(config.get('mesh.debug') > 0){
        logger.info('[LOCATE@' + token + '] ' + rinfo.address + ' says ' +
          (req.exists ? 'YES' : 'NO') + ' for ' + sha1
        )
      }
      basket[rinfo.address] = req.exists
      //each recv packet resets the return timer to 1/4 sec
      clearTimeout(locateTimeout)
      locateTimeout = setTimeout(function(){
        mesh.udp.removeAllListeners(token)
        done(null,basket)
      },250)
    })
    mesh.udp.send('locate',{token:token,sha1:sha1})
  }
}


/**
 * Export mesh object
 */
module.exports = mesh
