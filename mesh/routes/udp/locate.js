'use strict';
var debug = require('debug')('oose:mesh:multicast:locate')

var redis = require('../../../helpers/redis')


/**
 * Multicast locate client
 * @param {object} message
 * @param {dgram.rinfo} rinfo
 * @param {function} reply
 * @return {*}
 */
module.exports = function(message,rinfo,reply){
  //check if we have the file
  if(!message.sha1) return reply('no sha1 provided')
  if(40 !== message.sha1.length || 'string' !== typeof message.sha1)
    return reply('invalid sha1 provided')
  var sha1 = message.sha1
  debug(sha1,'[MCAST LOCATE] who has ' + sha1 + ' tell ' + rinfo.address +
    ' @ ' + sha1.token)
  redis.sismember('inventory',message.sha1,function(err,result){
    if(err){
      debug(sha1,'redis lookup error',err)
      return reply(err)
    }
    result = !!result
    debug((result ? 'exists' : 'doesnt exist'))
    reply(err,result)
  })
}
