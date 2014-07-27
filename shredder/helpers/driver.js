'use strict';


/**
 * Compile arguments from shredder API
 * @param {Resource} resource
 * @param {array} args
 * @return {string} parsed argument string
 */
exports.commandCompileArgs = function(resource,args){
  var string = ''
  args.forEach(function(v){
    string += v.key
    string += v.join || ' '
    if(v.value) string += resource.render(v.value)
  })
  return string
}
