'use strict';


/**
 * Compile arguments from shredder API
 * @param {Resource} resource
 * @param {array} args
 */
exports.commandCompileArgs = function(resource,args){
  var string = ''
  args.forEach(function(v){
    string += v.key + ' '
    if(v.value) string += resource.render(v.value)
  })
  return string
}
