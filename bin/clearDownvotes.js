'use strict';
var debug = require('debug')('oose:clearDownvotes')
var infant = require('infant')

//var config = require('../config')
var cradle = require('../helpers/couchdb')


/**
 * Run the interval
 * @param {function} done
 */
var runInterval = function(done){
  console.log('Starting to clear downvotes')
  //first lets get all the downvotes
  var downvoteKey = cradle.schema.downVote()
  var downvotes = []
  debug('requesting downvotes',downvoteKey)
  cradle.db.allAsync({
    startkey: downvoteKey,
    endkey: downvoteKey + '\uffff'
  })
    .then(function(result){
      debug('downvote result; downvotes: ',result.length)
      //this gives us the downvote keys and to my understanding we just have
      //to update these to deleted now
      var downvote = {}
      for(var i = 0; i < result.length; i++){
        downvote = result[i]
        downvotes.push({
          _id: downvote.id,
          _rev: downvote.value.rev,
          _deleted: true
        })
      }
      debug('saving deletion of downvotes',downvotes.length,downvotes[0])
      //now we just use cradle to save the downvotes
      return cradle.db.saveAsync(downvotes)
    })
    .then(function(result){
      console.log(result)
      var deleted = 0
      result.forEach(function(row){
        if(row.ok) deleted++
      })
      console.log('Deletion complete, ' + deleted + ' records removed')
      done()
    })
    .catch(function(err){
      console.log(err.stack)
      done(err)
    })
    .finally(function(){
      console.log('Downvote clearing complete')
      process.exit()
    })
}

if(require.main === module){
  infant.child(
    'oose:clearDownvotes',
    function(done){
      //setup the interval for collection from master
      runInterval(done)
    },
    function(done){
      process.nextTick(done)
    }
  )
}

