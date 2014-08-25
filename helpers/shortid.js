'use strict';
var shortid = require('shortid')

var config = require('../config')

//setup the alphabet
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_')

//set the seed
shortid.seed(config.shortid.seed)


/**
 * Export the modified shortid object
 * @type {shortid}
 */
module.exports = shortid
