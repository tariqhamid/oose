'use strict';
var ObjectManage = require('object-manage')
var EventEmitter = require('events').EventEmitter


var Resource = function(options){
  var that = this
  EventEmitter.call(that)
  //load options
  that.options = new ObjectManage()
  that.options.load(that.defaultOptions)
  that.options.load(options)
  //define our resource handler
  that.resources = {}
}
Resource.prototype = Object.create(EventEmitter.prototype)


/**
 * Define default options
 * @type {{}}
 */
Resource.prototype.defaultOptions = {}


/**
 * Add a resource
 * @param {string} name
 * @param {object} info
 */
Resource.prototype.add = function(name,info){
  this.emit('add',name,info)
  this.resources[name] = info
}


/**
 * Remove a resource
 * @param {string} name
 */
Resource.prototype.remove = function(name){
  this.emit('remove',name,this.resources[name])
  delete this.resources[name]
}


/**
 * Render a string and replace named resources with paths
 * @param {string} string
 * @return {string} The replaced string
 */
Resource.prototype.render = function(string){
  var originalString = string
  var regexp
  for(var i in this.resources){
    if(!this.resources.hasOwnProperty(i)) continue
    regexp = new RegExp('{' + i + '}','i')
    string = string.replace(regexp,this.resources[i].path)
  }
  this.emit('render',originalString,string)
  return string
}


/**
 * Export the Resource manager
 * @type {Resource}
 */
module.exports = Resource
