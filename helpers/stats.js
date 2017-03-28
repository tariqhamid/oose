'use strict';
var P = require('bluebird')
var debug = require('debug')('helper:stat')

var config = require('../config')


/**
 * Export client constructor
 * @param {object} options
 * @return {function} constructor
 */
module.exports = function(options){
  var s = {}
  s.config = ('object' === typeof options) ? options : config.stats
  s.timeStamp = ((+new Date())/1000) | 0
  s.refList = []
  s.refCount = 0

  // stats Object.keys are storeName
  //  with sub-Object.keys as section, then user-defined data
  s.stats = {}

  s.keyGen = function(ref,section){
    var rv = [ref,section,s.timeStamp].join(':')
    debug('_keyGen(',ref,',',section,')=',rv)
    return rv
  }

  s.set = function(ref,section,data){
    debug('set(',ref,',',section,',',data,')')
    if(!(ref in s.stats)){
      s.stats[ref] = {}
      s.refList = (Object.keys(s.stats)).sort()
      s.refCount = +(s.refList.length)
    }
    if(!(section in s.stats[ref])){
      s.stats[ref][section] = null
    }
    s.stats[ref][section] = data
  }

  s.get = function(ref,section){
    var rv = undefined
    debug('get(',ref,',',section,')')
    if((ref in s.stats) && (section in s.stats[ref])){
      rv = s.stats[ref][section]
    }
    return rv
  }

  return s
}
