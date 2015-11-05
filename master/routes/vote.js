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
  if(!downVote.host || !downVote.caster)res.json({error: 'Missing info'})
  var model = (downVote.host.type == 'store')?Store:Prism
  model.findById(downVote.host.id)
    .then(function(result){
      if(!result) return res.json({error: 'Missing info'})
      //Inactive already?
      if(!result.active)return res.json({success: 'Ok, it\'s down already'})

      var hostKey = downVote.host.type+":"+downVote.host.id
      if(!voteLog[hostKey])voteLog[hostKey]={}
      if(voteLog[hostKey][downVote.caster])return res.json({success: 'Ok, you told me already'})

      voteLog[hostKey][downVote.caster] = true

      var promises = [Prism.count({where: {active: true}}), Store.count({where: {active: true}})]
      P.all(promises).then(function(counts){
        //How many active hosts do we have?
        var count = counts[0] + counts[1]
        //Votes
        var votes = Object.keys(voteLog[hostKey]).length
        //Half of the hosts have voted this host down
        if(votes < (count/2))return res.json({success: 'Ok, got it'})
        result.active = false
        result.save().then(function(){
          //Remove voting log, it has served is purpose.
          delete(voteLog[hostKey])
          return res.json({success: 'Ok, taken it down'})
        })
      })

    })
}