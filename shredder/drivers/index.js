'use strict';


/**
 * HTTP Resource Driver
 * @type {exports}
 */
exports.resource.http = require('./resource/http')


/**
 * FFMpeg driver
 * @type {exports}
 */
exports.encode.ffmpeg = require('./encode/ffmpeg')


/**
 * MP4Box driver
 * @type {exports}
 */
exports.encode.mp4box = require('./encode/mp4box')
