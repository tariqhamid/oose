'use strict';
var oose = require('oose-sdk')

var config = require('../config')

//update the config
oose.api.updateConfig(config.$strip())


/**
 * Export the API
 * @type {Object}
 */
module.exports = oose.api
