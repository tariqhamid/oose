'use strict';
var P = require('bluebird')
var cradle = require('cradle')

var CouchSchema = require('./CouchSchema')

var config = require('../config')

//make some promises
P.promisifyAll(cradle)

//setup our client
var client = new (cradle.Connection)(
  config.couchdb.host,
  config.couchdb.port,
  config.couchdb.options
)

//make some promises
P.promisifyAll(client)


/**
 * Setup the DB access
 * @type {object}
 */
client.db = P.promisifyAll(client.database(config.couchdb.database))


/**
 * Add schema to helper
 * @type {CouchShema}
 */
client.schema = new CouchSchema(config.couchdb.prefix)


/**
 * Export client
 * @return {object} client
 */
module.exports = client
