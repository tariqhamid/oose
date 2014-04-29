'use strict';
var mongoose = require('mongoose')
  , config = require('../../config')
  , shortid = require('shortid')
  , schema

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
        image: String
      }
    ],
    video: [
      {
        quality: String,
        video: String
      }
    ]
  }
})


/**
 * Generate Embed Handle
 * @return {string}
 */
schema.statics.generateHandle = function(){
  shortid.seed(config.get('embed.seed'))
  return shortid.generate()
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
