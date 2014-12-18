'use strict';
var P = require('bluebird')

var api = require('../helpers/api')


/**
 * Pick a winner from a prism list
 * @param {Array} prismList
 * @param {Array} skip
 * @return {P}
 */
exports.winner = function(prismList,skip){
  if(!(skip instanceof Array)) skip = []
  if(!(prismList instanceof Array)) prismList = []
  var winner = false
  var prism
  for(var i = 0; i < prismList.length; i++){
    prism = prismList[i]
    if(-1 !== skip.indexOf(prism.name)) continue
    if(!winner){
      winner = prism
      continue
    }
    if(winner.hits > prism.hits){
      winner = prism
    }
  }
  return P.try(function(){
    if(!winner) return false
    return api.master.post('/prism/increment-hits',{name: winner.name})
      .spread(function(){
        return winner
      })
  })
}
