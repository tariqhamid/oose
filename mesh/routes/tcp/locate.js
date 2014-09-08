'use strict';
var debug = require('debug')('oose:mesh:tcp:locate')

var Locate = require('../../../helpers/locate')


/**
 * TCP locate wrapper
 * @param {Multicast} multicast
 * @return {function}
 */
module.exports = function(multicast){
  return function(message,reply){
    debug('TCP locate received:',message)
    var locate = new Locate(multicast)
    locate.lookup(message.sha1,function(err,result){
      debug('TCP locate complete:',err,result)
      reply(err,result)
    })
  }
}
