'use strict';
var purchasedb = require('../../helpers/purchasedb')


/**
 * Map a purchase token to a usable URI
 * @param {object} req
 * @param {object} res
 */
exports.uri = function(req,res){
  var token = req.query.token
  purchasedb.get(token)
    .then(function(result){
      if(result)
        res.send('/purchased/' + result.hash + '.' + result.ext)
      else
        res.status(404).send('/404')
    })
}
