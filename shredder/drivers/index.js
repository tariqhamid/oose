'use strict';


/**
 * Resource drivers
 * @type {{}}
 */
exports.resource = {
  http: require('./resource/http')
}


/**
 * Encode drivers
 * @type {{}}
 */
exports.encode = {
  ffmpeg: require('./encode/ffmpeg'),
  mp4box: require('./encode/mp4box')
}


/**
 * Callback driver
 * @type {exports}
 */
exports.callback = {
  http: require('./callback/http')
}
