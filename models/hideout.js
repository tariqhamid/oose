'use strict';
var mongoose = require('mongoose')
var schema

schema = new mongoose.Schema({
  key: {
    type: String,
    unique: true,
    required: true
  },
  value: mongoose.Schema.Types.Mixed
})


/**
 * Mongoose schema
 * @type {exports.Schema}
 */
exports.schema = schema


/**
 * Mongoose model
 */
exports.model = mongoose.model('Hideout',schema)
