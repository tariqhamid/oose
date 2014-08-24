'use strict';
var config = require('../config')
  , redis = require('../helpers/redis')
  , logger = require('../helpers/logger').create('supervisor')

var runlevel = 'stopped'
var msg = {
  starting: function(){
    runlevel = 'starting'
    logger.info('Supervisor waiting for sync')
  },
  started: function(){
    runlevel = 'started'
    logger.info('Supervisor started')
  },
  demoted: function(){
    runlevel = 'demoted'
    logger.warn('Supervisor is on patrol duty')
  },
  promoted: function(){
    runlevel = 'promoted'
    logger.warn('Supervisor has become Commissioner')
  },
  stopped: function(){
    runlevel = 'stopped'
    logger.info('Supervisor stopped')
  }
}


var supervisorTimeout
var supervisorStartup = function(){
  redis.hgetall('peer:db:' + config.hostname,function(err,peer){
    if(err) logger.error(err)
    else if(!peer){
      msg.starting()
      supervisorTimeout = setTimeout(supervisorStartup,config.supervisor.retryInterval)
    } else {
      var message = {}
      message.sent = new Date().getTime()
      message.hostname = config.hostname
//      cmdBus.emit('patrolReq',message)
//      supervisorTimeout = setTimeout(supervisorPatrol,config.supervisor.patrolInterval)
    }
  })
}


/**
 * Start Supervisor
 * @param {function} done Completion callback
 */
exports.start = function(done){
/*
  redis.sscan('inventory',0,function(err,result){
    if(err){
      logger.warn('Could not load inventory: ',err)
    } else {
      logger.info(result)
    }
    supervisorTimeout = setTimeout(exports.start(),config.supervisor.retryInterval)
    done()
  })
 */
  done()
}


/**
 * Stop Supervisor
 */
exports.stop = function(){
  if(supervisorTimeout){
    clearTimeout(supervisorTimeout)
    msg.stopped()
  }
}

if(require.main === module){
  exports.start(function(){ msg.started() })
}
