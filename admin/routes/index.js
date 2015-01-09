'use strict';


/**
 * Pages
 * @type {exports}
 */
exports.page = require('./page')


/**
 * Staff
 * @type {exports}
 */
exports.staff = require('./staff')


/**
 * Shows
 * @type {exports}
 */
exports.show = require('./show')


/**
 * Episodes
 * @type {exports}
 */
exports.episode = require('./episode')


/**
 * Video
 * @type {exports}
 */
exports.video = require('./video')


/**
 * Media
 * @type {exports}
 */
exports.media = require('./media')


/**
 * Video report
 * @type {exports}
 */
exports.videoReport = require('./videoReport')


/**
 * Episode Maintenance
 * @type {exports}
 */
exports.episodeMaintenance = require('./episodeMaintenance')


/**
 * Site Maintenance
 * @type {exports}
 */
exports.siteMaintenance = require('./siteMaintenance')


/**
 * Users
 * @type {exports}
 */
exports.user = require('./user')


/**
 * Blog
 * @type {exports}
 */
exports.blog = require('./blog')


/**
 * OOSE Imports
 * @type {exports}
 */
exports.oose = require('./oose')


/**
 * Shredder
 * @type {exports}
 */
exports.shredder = require('./shredder')


/**
 * Index
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  res.redirect('/show/list')
}
