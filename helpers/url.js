var config = require('../config')

exports.prism = function(command){
  return 'http://' + config.get('prism.host') + ':' + config.get('prism.port') + '/api/' + command
}
