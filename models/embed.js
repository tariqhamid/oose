'use strict';
var mongoose = require('mongoose')
var config = require('../config')
var schema

schema = new mongoose.Schema({
  handle: {
    type: String,
    unique: true,
    required: true
  },
  title: String,
  keywords: String,
  template: String,
  media: {
    image: [
      {
        offset: Number,
        sha1: String,
        filename: String
      }
    ],
    video: [
      {
        quality: String,
        sha1: String,
        filename: String
      }
    ]
  }
})


/**
 * Get the OOSE URL to the preview image
 * @this Document
 * @return {string}
 */
schema.methods.preview = function(){
  var image
  if(this.media.image[0]) image = this.media.image[0]
  if(!image) return config.gump.embed.defaultPreviewImageUrl
  return config.gump.embed.prismUrl + image.sha1 + '/' +
    (image.filename || 'image.png')
}


/**
 * Get an OOSE url for a particular video quality
 * @param {string} quality
 * @this Document
 * @return {string|boolean}
 */
schema.methods.video = function(quality){
  var video
  this.media.video.forEach(function(item){
    if(item.quality !== quality) return
    video = item
  })
  if(!video) video = this.media.video[0]
  if(!video) return false
  return config.gump.embed.prismUrl + video.sha1 + '/' +
    (video.filename || 'video.mp4')
}


/**
 * Mongoose schema
 * @type {exports.Schema}
 */
exports.schema = schema


/**
 * Mongoose model
 */
exports.model = mongoose.model('Embed',schema)
