'use strict';

var UserError = function(){
  Error.call(this)
}
UserError.prototype = Object.create(Error)


/**
 * Export the Error
 * @type {Function}
 */
module.exports = UserError
