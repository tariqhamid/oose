'use strict';
var api = require('../helpers/api')

var config = require('../config')

var prism = api.prism(config.prism)

prism.postAsync({
  url: prism.url('/cache/flush/exists')
})
  .spread(function(res,body){
    console.log(body)
    process.exit()
  })

