'use strict';


/**
 * TCP helper
 * @type {communicator.TCP}
 */
exports.tcp = require('./tcp')


/**
 * UDP helper
 * @type {communicator.UDP}
 */
exports.UDP = require('./udp')


/**
 * Packet Tracker (de-duplicator)
 * @type {communicator.PacketTracker}
 */
exports.PacketTracker = require('./packetTracker')


/**
 * Utilities and encoders / decoders
 * @type {communicator.util}
 */
exports.util = require('./util')
