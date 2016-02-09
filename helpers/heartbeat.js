'use strict';
var debug = require('debug')('oose:hb')
var random = require('random-js')()

var api = require('../helpers/api')
var cradle = require('../helpers/couchdb')
var prismBalance = require('../helpers/prismBalance')

var config = require('../config')

/**
 Some notes about this heartbeat rework before we get started. I think the specs
 I provided to George were sketchy at best.

 The system itself has also changed during the development process of the
 heartbeat system.

 This system is going to operate as a service that can be added on to any main
 process.

 It will start and stop and during operational status is will conduct a parallel
 TCP ping to each member of the cluster on a sliding interval to prevent
 dos-beat.
*/

var heartbeatTimeout = null
var pruneTimeout = null
var voteLog = {}


/**
 * Get Peer Key
 * @param {object} peer
 * @return {string}
 */
var getPeerKey = function(peer){
  var prismKey = cradle.schema.prism(peer.name)
  var storeKey = cradle.schema.store(peer.prism,peer.name)
  return (peer.type === 'prism') ? prismKey : storeKey
}


/**
 * Down vote a peer
 * @param {object} peer
 * @param {string} systemKey
 * @param {integer} peerCount
 * @return {P}
 */
var downVote = function(peer,systemKey,peerCount){
  //setup keys
  var key = getPeerKey(peer)
  var downKey = cradle.schema.downVote(peer.name)
  var myDownKey = cradle.schema.downVote(peer.name, systemKey)
  var currentVoteLog = null
  debug('DOWN VOTE: ' + key)
  var createDownVote = function(){
    return cradle.db.saveAsync(myDownKey,{
      peer: peer,
      systemKey: systemKey,
      timestamp: +(new Date())
    })
  }
  //get down votes that have already been set for this host
  return cradle.db.allAsync({startkey: downKey, endkey: downKey + '\uffff'})
    .then(
      function(log){
        currentVoteLog = log
        for(var i = 0; i < log.length; i++){
          if(log[i].key === myDownKey) {
            debug('Already recorded')
            return false
          }
        }
        return createDownVote()
      },
      function(err){
        if(!err.headers) throw err
        if(404 !== err.headers.status) throw err
        currentVoteLog = []
        return createDownVote()
      }
    )
    .then(function(myVote){
      if(myVote !== false)
        currentVoteLog.push(myVote)
      var count = peerCount
      var votes = currentVoteLog.length
      if(count === 0 || votes < (count/2))
        throw new Error('Ok, got it')
      peer.available = false
      return cradle.db.saveAsync(key,peer._rev,peer)
    })
    .catch(function(err){
      console.log(err)
    })
}


/**
 * Run the heartbeat from this peer
 * @param {string} systemKey
 */
var runHeartbeat = function(systemKey){
  //steps to a successful heartbeat run
  // 1) collect list of peers to ping (including ourselves)
  // 2) ping all of those peers
  // 3) collect failures to calculate loss
  // 4) check loss against triggers
  // 5) expire down votes from this peer
  var startTime = +(new Date())
  var peerCount = 0
  prismBalance.peerList()
    .then(function(result){
      peerCount = result.length
      return result
    })
    .map(function(peer){
      //setup the ping handler
      peer.request = api[peer.type](peer)
      //make the ping request
      return peer.request.postAsync(peer.request.url('/ping') + '')
        .spread(function(res,body){
          if(body && body.pong && 'pong' === body.pong){
            //success, so do nothing i think or check if its down
            //and file an up vote
            voteLog[peer.name] = 0
          } else {
            voteLog[peer.name] = (voteLog[peer.name] !== undefined) ?
              voteLog[peer.name] + 1 : 1
            if(voteLog[peer.name] > config.heartbeat.retries)
              return downVote(peer,systemKey,peerCount)
          }
        })
        .catch(function(err){
          console.log('Ping Error: ',err)
          return downVote(peer,systemKey,peerCount)
        })
    })
    .catch(function(err){
      console.log(err)
    })
    .finally(function(){
      var duration = startTime - +(new Date())
      var delay = duration +
        (random.integer(0,5) * 1000) +
        config.heartbeat.frequency
      heartbeatTimeout = setTimeout(function(){
        runHeartbeat()
      },delay)
    })
}


/**
 * Prune votes cast by this system
 * @param {string} systemKey
 * @return {P}
 */
var runVotePrune = function(systemKey){
  //get votes we cast
  var downVoteKey = cradle.schema.downVote()
  var currentTimestamp = +(new Date())
  return cradle.db.allAsync({
    startkey: downVoteKey,
    endkey: downVoteKey + '\uffff'
  })
    .filter(function(vote){
      return (
        vote.systemKey === systemKey &&
        ((vote.timestamp + config.heartbeat.voteLife) <= currentTimestamp)
      )
    })
    .map(function(vote){
      return cradle.db.removeAsync(vote._id,vote._rev)
    })
    .catch(function(err){
      console.log('vote prune error: ',err)
    })
    .finally(function(){
      pruneTimeout = setTimeout(function(){
        runVotePrune(systemKey)
      },+config.heartbeat.votePruneFrequency || 60000)
    })
}


/**
 * Mark this system up
 * @param {string} systemKey
 * @return {P}
 */
var markMeUp = function(systemKey){
  debug('Marking myself up')
  var key = getPeerKey()
  var downKey = cradle.schema.downVote(systemKey)
  return cradle.db.getAsync(key)
    .then(function(peer){
      peer.available = true
      peer.active = true
      return cradle.db.saveAsync(key,peer._rev,peer)
    })
    .then(function(){
      //Time to delete the downvote log
      return cradle.db.allAsync({startkey: downKey, endkey: downKey + '\uffff'})
    })
    .map(function(log){
      return cradle.db.removeAsync(log.key,log._rev)
    })
    .catch(function(err){
      console.log('markMeUp error: ',err)
    })
}


/**
 * Start Heartbeat
 * @param {string} systemKey
 * @param {function} done
 */
exports.start = function(systemKey,done){
  heartbeatTimeout = setTimeout(function(){
    markMeUp(systemKey)
    runHeartbeat(systemKey)
    runVotePrune(systemKey)
  },1000)
  process.nextTick(done)
}


/**
 * Stop Heartbeat
 * @param {function} done
 */
exports.stop = function(done){
  clearTimeout(heartbeatTimeout)
  clearTimeout(pruneTimeout)
  process.nextTick(done)
}
