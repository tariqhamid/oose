'use strict';
var purchasedb = require('../../helpers/purchasedb')
var hashFile = require('../../helpers/hashFile.js')

var config = require('../../config')


/**
 * Map a purchase token to a usable URI
 * @param {object} req
 * @param {object} res
 */
exports.uri = function(req,res){
  //if(config.store.host !== req.ip && '127.0.0.1' !== req.ip){
  //  res.status(403).send('/403')
  //} else {
  var token = req.params.token
  purchasedb.get(token)
    .then(function(result){
      if(result && result.expirationDate >= (+new Date())){
        res.send(
          '/../content/' + hashFile.toRelativePath(result.hash,result.ext)
        )
      } else{
        res.status(404).send('/404')
      }
    })
  //}
}
