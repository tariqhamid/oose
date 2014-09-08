'use strict';
var async = require('async')
var axon = require('axon')
var debug = require('debug')('oose:mesh')

var child = require('../helpers/child').child
var logger = require('../helpers/logger').create('mesh')
var Multicast = require('../helpers/multicast')



var config = require('../config')
var mesh = {}
var multicast = new Multicast()
var server



/**
 * Start mesh and establish connections
 * @param {function} done
 */
mesh.start = function(done){
  async.series(
    [
      //start udp
      function(next){
        multicast.on('error',function(err){
          logger.warning('Multicast server error',err)
        })
        multicast.bind(
          config.mesh.port,
          config.mesh.host,
          config.mesh.multicast,
          next
        )
      },
      //start tcp
      function(next){
        server = axon.socket('rep')
        server.on('error',function(err){
          logger.warning('TCP server error',err)
        })
        server.bind(config.mesh.port,config.mesh.host,next)
      }
    ],
    function(err){
      if(err) return done(err)
      //setup handlers
      that.tcp.on('locate',function(message,socket){

      })
    }
  )



  async.series(
    [
      //routes
      function(next){
        async.eachSeries(
          ['locate'],
          function(r,next){
            logger.info('Mesh loaded handler for ' + r)
            that.udp.on(r,function(req,rinfo){
              if(that[r] && 'function' === typeof that[r]){
                req.rinfo = rinfo
                that[r](req)
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
  //this looks excessive but its the only way to
  // maintain the scope of the close functions
  async.series(
    [
      function(next){self.udp.close(next)},
      function(next){self.tcp.close(next)}
    ],
    function(err){
      if(err) logger.error('Mesh failed to stop: ' + err)
      debug('Stopped.')
    }
  )
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
  redis.hset('peer:db:' + config.hostname,'readyState',state,function(err){
    if(err) done(err)
    self.udp.send('readyState',{readyState: state},done)
  })
}


/**
 * Export mesh
 * @type {Mesh}
 */
module.exports = mesh


//if this is being spawned directly, startup and setup message handlers
if(require.main === module){
  child(
    'oose:mesh',
    function(done){
      async.series(
        [
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
        done
      )
    },
    function(done){
      async.series(
        [
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
        done
      )
    }
  )
}
