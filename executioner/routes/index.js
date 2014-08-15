'use strict';


/**
 * Peer routes
 * @type {exports}
 */
exports.peer = require('./peer')


/**
 * Main route
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  res.redirect('/peer')
}
