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
 * Setup the Peer DB
 * @type {object}
 */
client.peer = P.promisifyAll(
  client.database(config.couchdb.database + '-peer'))


/**
 * Setup the Inventory DB
 * @type {object}
 */
client.inventory = P.promisifyAll(
  client.database(config.couchdb.database + '-inventory'))


/**
 * Setup the Purchase DB
 * @type {object}
 */
client.purchase = P.promisifyAll(
  client.database(config.couchdb.database + '-purchase'))


/**
 * Setup the Heartbeat DB
 * @type {object}
 */
client.heartbeat = P.promisifyAll(
  client.database(config.couchdb.database + '-heartbeat'))


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
