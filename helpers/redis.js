'use strict';
var redis = require('redis')
  , client = redis.createClient()

module.exports = client