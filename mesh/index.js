'use strict';
var async = require('async')
var EventEmitter = require('events').EventEmitter

var communicator = require('../helpers/communicator')
var logger = require('../helpers/logger').create('mesh')
var redis = require('../helpers/redis')
var shortId = require('../helpers/shortid')
var config = require('../config')



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
    port: config.mesh.port,
    address: config.mesh.address,
    multicast: {
      address: config.mesh.multicast.address,
      ttl: config.mesh.multicast.ttl,
      interfaceAddress: config.mesh.multicast.interfaceAddress
    }
  })
  //start tcp
  self.tcp = communicator.TCP({port: config.mesh.port})
  //connection error handling
  self.udp.on('error',function(err){self.emit('error',err)})
  self.tcp.on('error',function(err){self.emit('error',err)})
  self.tcp.on('locate',function(message,socket){
    self.locate(message.sha1,function(err,result){
      var response
      if(err) response = {status: 'error', code: 1, message: err}
      else response = {status: 'ok', code: 1, peers: result}
      socket.end(
        communicator.util.withLength(
          communicator.util.build(message.sha1,response)
        )
      )
    })
  })
  async.series(
    [
      //routes
      function(next){
        async.eachSeries(
          ['locate'],
          function(r,next){
            logger.info('Mesh loaded handler for ' + r)
            self.udp.on(r,function(req,rinfo){
              if(self[r] && 'function' === typeof self[r]){
                req.rinfo = rinfo
                self[r](req)
              }
            })
            next()
          },
          next
        )
      }
    ],
    done
  )
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
 * @return {*}
 */
Mesh.prototype.readyState = function(state,done){
  if('function' !== typeof done) done = function(){}
  if(!config.mesh.enabled) return done()
  var self = this
  if('function' !== typeof done) done = function(){}
  redis.hset('peer:db:' + config.hostname,'readyState',state,function(err){
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

//init mesh
var mesh = new Mesh()


/**
 * Export mesh
 * @type {Mesh}
 */
module.exports = mesh


//if this is being spawned directly, startup and setup message handlers
if(require.main === module){
  //shutdown
  process.on('message',function(msg){
    if(msg.readyState){
      mesh.readyState(msg.readyState)
    }
    if('stop' === msg){
      async.series([
          //stop announce
          function(next){
            require('./announce').stop(next)
          },
          //stop ping
          function(next){
            require('./ping').stop(next)
          },
          //stop mesh
          function(next){
            mesh.stop(next)
          }
        ],
        function(err){
          if(err){
            process.send({status: 'error', message: err})
            process.exit(1)
          }
          process.exit()
        })
    }
  })


  var start = function(){
    async.series([
        //start mesh
        function(next){
          mesh.start(next)
        },
        //start ping
        function(next){
          require('./ping').start(next)
        },
        //start announce
        function(next){
          require('./announce').start(next)
        }
      ],
      function(err){
        if(err){
          process.send({status: 'error', message: err})
          process.exit(1)
        }
        process.send({status: 'ok'})
      })
  }
  start()
}






