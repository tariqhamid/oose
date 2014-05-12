'use strict';
var communicator = require('../helpers/communicator')
  , logger = require('../helpers/logger').create('mesh')
  , redis = require('../helpers/redis')
  , config = require('../config')
  , async = require('async')
  , shortId = require('shortid')
  , EventEmitter = require('events').EventEmitter



/**
 * Mesh constructor
 * @constructor
 */
var Mesh = function(){
  var self = this
  EventEmitter.call(self)
}
Mesh.prototype = Object.create(EventEmitter.prototype)


/**
 * Start mesh and establish connections
 * @param {function} done
 */
Mesh.prototype.start = function(done){
  var self = this
  //start udp
  self.udp = communicator.UDP({
    port: config.get('mesh.port'),
    address: config.get('mesh.address'),
    multicast: {
      address: config.get('mesh.multicast.address'),
      ttl: config.get('mesh.multicast.ttl'),
      interfaceAddress: config.get('mesh.multicast.interfaceAddress')
    }
  })
  //start tcp
  self.tcp = communicator.TCP({port: config.get('mesh.port')})
  //connection error handling
  self.udp.on('error',function(err){self.emit('error',err)})
  self.tcp.on('error',function(err){self.emit('error',err)})
  self.tcp.on('locate',function(message,socket){
    self.locate(message.sha1,function(err,result){
      var response
      if(err) response = {status: 'error', code: 1, message: err}
      else response = {status: 'ok', code: 1, peers: result}
      socket.end(communicator.util.withLength(communicator.util.build(message.sha1,response)))
    })
  })
  //routes
  async.eachSeries([
    'locate'
  ],function(r,next){
    logger.info('Mesh loaded handler for ' + r)
    self.udp.on(r,function(req,rinfo){
      if(self[r] && 'function' === typeof self[r]){
        req.rinfo = rinfo
        self[r](req)
      }
    })
    /*
    //NOTE THIS IS HERE AS A TEST INJECTION (7 second delay)
    setTimeout(function(){
      var sha1 = '65093ef4dbd6cfa1ad58dc4202abd9517f0d7838'
      logger.info('[TEST] calling mesh.locate(' + sha1 + ')')
      self.locate(sha1,function(err,result){
        logger.info('[TEST] mesh.locate(' + sha1 + ') reply: ',require('util').inspect(result))
      })
    },7000)
    */
    next()
  })
  done()
}


/**
 * Close connections
 * @param {function} done
 */
Mesh.prototype.stop = function(done){
  var self = this
  //this looks excessive but its the only way to maintain the scope of the close functions
  async.series([
    function(next){self.udp.close(next)},
    function(next){self.tcp.close(next)}
  ],function(err){
    if(err) logger.error('Mesh failed to stop: ' + err)
  })
  done()
}


/**
 * Send ready state change
 * @param {number} state
 * @param {function} done
 */
Mesh.prototype.readyState = function(state,done){
  var self = this
  if('function' !== typeof done) done = function(){}
  redis.hset('peer:db:' + config.get('hostname'),'readyState',state,function(err){
    if(err) done(err)
    self.udp.send('readyState',{readyState: state})
    done()
  })
}


/**
 * Locate peers with inventory containing SHA1
 * @param {multiple} sha1 SHA1 sum to locate (40 hex chars, or 20 byte Buffer)
 * @param {function} done Callback
 */
Mesh.prototype.locate = function(sha1,done){
  var self = this
  //check for Buffer first, because it false positives the typeof below
  if(sha1 instanceof Buffer && 20 === sha1.length){
    //called with a SHA1 binary Buffer, convert and fall thru
    sha1 = sha1.toString('hex')
  } else if('object' === typeof sha1){
    //called from the main listener
    logger.debug(
        '[MCAST LOCATE] who has ' + sha1.sha1 +
        ' tell ' + sha1.rinfo.address +
        ' @ ' + sha1.token
    )
    redis.sismember('inventory',sha1.sha1,function(err,result){
      self.udp.send(sha1.token,{sha1:sha1.sha1,exists:!!result})
    })
  }// intentionally no else
  if('string' === typeof sha1 && 40 === sha1.length){
    //called with a SHA1 hex string
    var token = shortId.generate()
    var basket = {}, locateTimeout
    var hostname = ''
    self.udp.on(token,function(req,rinfo){
      async.series(
        [
          //log the action
          function(next){
            logger.debug('[LOCATE@' + token + '] ' + rinfo.address + ' says ' +
                (req.exists ? 'YES' : 'NO') + ' for ' + sha1
            )
            next()
          },
          //resolve ip to peer hostname
          function(next){
            redis.hget('peer:ip',rinfo.address,function(err,result){
              if(err) return next(err)
              hostname = result
              next()
            })
          },
          //add to basket
          function(next){
            basket[hostname] = req.exists
            next()
          }
        ],
        //each recv packet resets the return timer to 1/4 sec
        function(err){
          if(err) logger.error('Failed to respond to locate: ' + err)
          clearTimeout(locateTimeout)
          locateTimeout = setTimeout(function(){
            self.udp.removeAllListeners(token)
            self.udp.send('locate:result',{sha1:sha1,resultSet:basket})
            done(null,basket)
          },250)
        }
      )
    })
    self.udp.send('locate',{token:token,sha1:sha1})
  }
}


/**
 * Export mesh instance
 * @type {Mesh}
 */
module.exports = new Mesh()
