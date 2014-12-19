'use strict';
var P = require('bluebird')


/**
 * Promise While
 * @param {function} condition
 * @param {function} action
 * @return {P}
 */
var promiseWhile = function(condition,action){
  return new P(function(resolve,reject){
    var loop = function(){
      if(!condition()) return resolve()
      return action().then(loop).catch(reject)
    }
    process.nextTick(loop)
  })
}


/**
 * Export function
 * @type {Function}
 */
module.exports = promiseWhile
