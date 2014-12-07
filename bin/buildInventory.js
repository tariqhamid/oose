'use strict';
var once = require('infant').Child.fork

var redis = require('../helpers/redis')


/**
 * Inventory filesystem
 */
redis.removeKeysPattern('inventory:*')
  .then(function(){
    once('../tasks/inventory',function(err){
      if(err) console.error('Inventory failed',err)
      process.exit()
    })
  })

