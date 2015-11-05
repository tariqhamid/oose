'use strict';
var P = require('bluebird')
var oose = require('oose-sdk')

var sequelize = require('../../helpers/sequelize')()

var Prism = sequelize.models.Prism
var Store = sequelize.models.Store
var VoteLog = sequelize.models.VoteLog

var UserError = oose.UserError


/**
 * Submit a down vote
 * @param {object} req
 * @param {object} res
 */
exports.down = function(req,res){
  var downVote = req.body
  var host = null
  var vote = null
  var hostKey
  if(!downVote.host || !downVote.caster)
    throw new UserError('Missing info')
  var model = downVote.host.type === 'store' ? Store : Prism
  model.findById(downVote.host.id)
    .then(function(result){
      if(!result) throw new UserError('Missing info')
      //Inactive already?
      if(!result.active)
        throw new UserError('Ok, it\'s down already')
      host = result
      hostKey = downVote.host.type+':'+downVote.host.id
      //create the vote record
      return VoteLog.create({
        hostId: downVote.host.id,
        hostType: downVote.host.type,
        caster: downVote.caster,
        createdStamp: ((+new Date()) / 1000)
      })
        .then(function(result){
          vote = result
          return P.all([
            Prism.count({where: {active: true}}),
            Store.count({where: {active: true}}),
            VoteLog.count({
              where: {
                hostId: downVote.host.id,
                hostType: downVote.host.type,
                caster: downVote.caster
              }
            })
          ])
        })
        .catch(sequelize.UniqueConstraintError,function(){
          throw new UserError('Ok, you told me already')
        })
    })
    .then(function(counts){
      //How many active hosts do we have?
      var count = counts[0] + counts[1]
      //Votes
      var votes = counts[2]
      //Half of the hosts have voted this host down
      if(votes < (count / 2))
        throw new UserError('Ok, got it')
      //if we got here go ahead and mark the host inactive
      host.active = false
      return host.save()
    })
    .then(function(){
      return res.json({success: 'Ok, taken down'})
    })
    .catch(UserError,function(err){
      res.json({success: err.message})
    })
}
