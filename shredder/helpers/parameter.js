'use strict';
var ObjectManage = require('object-manage')
var parameterExp = /#\{([^}]+?)\}/ig



/**
 * Resource manager
 * @constructor
 */
var Parameter = function(){
  ObjectManage.apply(this)
}
Parameter.prototype = Object.create(ObjectManage.prototype)


/**
 * Render a string and replace named Parameters with values
 * @param {string} string
 * @return {string} parsed string
 */
Parameter.prototype.render = function(string){
  var that = this
  //match any template variables
  var match, matches = []
  while((match = parameterExp.exec(string))){
    if(!match[1]) continue
    matches.push(match[1])
  }
  if(!(matches instanceof Array) || !matches.length) return string
  //replace any template variables
  matches.forEach(function(v){
    if(!that.$exists(v)) return
    string = string.replace(new RegExp('#{' + v + '}','ig'),that.$get(v))
  })
  return string
}


/**
 * Export the Parameters manager
 * @type {Parameter}
 */
module.exports = Parameter
