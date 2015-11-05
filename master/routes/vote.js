'use strict';
var oose = require('oose-sdk')
var sequelize = require('../../helpers/sequelize')()

var P = require('bluebird')
var Prism = sequelize.models.Prism
var Store = sequelize.models.Store
var UserError = oose.UserError
var voteLog=[]

exports.downvote = function(req,res){

  var downVote = req.body
  var host = null
  var hostKey
  if(!downVote.host || !downVote.caster)throw new UserError('Missing info')
  var model = (downVote.host.type === 'store')?Store:Prism
  model.findById(downVote.host.id)
    .then(function(result){
      if(!result) throw new UserError('Missing info')
      //Inactive already?
      if(!result.active)throw new UserError ('Ok, it\'s down already')
      host=result
      hostKey = downVote.host.type+':'+downVote.host.id
      if(!voteLog[hostKey])voteLog[hostKey]={}
      if(voteLog[hostKey][downVote.caster])throw new UserError('Ok, you told me already')

      voteLog[hostKey][downVote.caster] = true

      var promises = [Prism.count({where: {active: true}}), Store.count({where: {active: true}})]
      return P.all(promises)

    }).then(function(counts){
      //How many active hosts do we have?
      var count = counts[0] + counts[1]
      //Votes
      var votes = Object.keys(voteLog[hostKey]).length
      //Half of the hosts have voted this host down
      if(votes < (count/2))throw new UserError('Ok, got it')
      host.active = false
      return host.save()
    }).then(function(){
      //Remove voting log, it has served is purpose.
      delete(voteLog[hostKey])
      return res.json({success: 'Ok, taken it down'})
    }).catch(UserError,function(err){
      res.json({success: err.message})
    })
}