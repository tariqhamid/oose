'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:master:votePrune')
var infant = require('infant')

var sequelize = require('../helpers/sequelize')()

var Prism = sequelize.models.Prism
var Store = sequelize.models.Store
var VoteLog = sequelize.models.VoteLog


var pruneVotes = function(){
  debug('starting to prune votes')
  var expireTime = ((+new Date()) / 1000) - 60
  var hostCount = 0
  return P.all([
    Prism.count({where: {active: true}}),
    Store.count({where: {active: true}}),
    VoteLog.findAll({where: {createdStamp: {$lt: expireTime}}})
  ])
    .then(function(result){
      hostCount = result[0] + result[1]
      debug('current host count',hostCount)
      return result[2]
    })
    .each(function(vote){
      var model = vote.hostType === 'store' ? Store : Prism
      debug('clearing vote from ' + vote.caster + ' for ' +
        vote.hostType + ':' + vote.hostId)
      return vote.remove()
        .then(function(){
          //try to reactivate the host
          return VoteLog.count({where: {
            hostId: vote.hostId,
            hostType: vote.hostType
          }})
        })
        .then(function(result){
          debug('current downvote count for ' +
            vote.hostType + ':' + vote.hostId,result)
          if(result < (hostCount / 2)){
            debug('issue resolved activating potentially downed host ' +
              vote.hostType + ':' + vote.hostId)
            return model.update({active: true},{where: {id: vote.hostId}})
          }
        })
    })
    .then(function(){
      debug('prune complete')
    })
    .catch(function(err){
      console.log(err)
      console.log('Vote Prune Error: ' + err.message)
    })
}


var interval = null
var createInterval = function(){
  debug('registering votePrune interval')
  interval = setInterval(pruneVotes,30000)
}
var removeInterval = function(){
  debug('removing votePrune interval')
  clearInterval(interval)
  interval = null
}


if(require.main === module){
  infant.child(
    'oose:master:votePrune',
    function(done){
      //setup the interval for collection from master
      createInterval()
      process.nextTick(done)
    },
    function(done){
      removeInterval()
      process.nextTick(done)
    }
  )
}
