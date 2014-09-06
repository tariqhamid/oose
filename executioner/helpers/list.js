'use strict';
var async = require('async')


/**
 * Remove list items by IDs
 * @param {mongoose.Model} Model
 * @param {Array} idList
 * @param {Function} done
 */
exports.remove = function(Model,idList,done){
  var count = 0
  async.each(
    idList,
    function(id,next){
      Model.findById(id,function(err,result){
        if(err) return next(err)
        if(!result) return next('Show not found ' + id)
        result.remove(function(err){
          if(err) return next(err)
          count++
          next()
        })
      })
    },
    function(err){
      if(err) return done(err,count)
      done(null,count)
    }
  )
}


/**
 * Calculate limits for page views
 * @param {number} start
 * @param {number} count
 * @param {number} limit
 * @return {{start: number, end: number, previous: number, next: number}}
 */
exports.pagination = function(start,count,limit){
  count = +count
  if(start > count) start = count - limit
  var page = {
    start: +start,
    end: start + limit,
    previous: start - limit,
    next: start + limit
  }
  if(page.previous < 0) page.previous = 0
  if(page.next > count) page.next = start
  if(page.end > count) page.end = count
  return page
}
