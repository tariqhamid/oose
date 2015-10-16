'use strict';
/**
 * Created by george on 7/10/15.
 */

var P = require('bluebird')
var request = require('request')
var debug = require('debug')('oose:peer')

//make some promises
P.promisifyAll(request)

/*
node{
  name : ''   //The node name
  host : ''   //The host where the node is at
  port : 0    //The port
  type : ''   //Some data that describes its identity, we don't care, another layer might

}

 */

var instance = null
var Message = function(msg, err){
  return {message:msg, error:err}
}

var myHandler = function(){
  var that = this
  var handlers = {}

  this.subscribe = function(name,handler){
    if(typeof handler == "function"){
      handlers[name] = handler
    }
  }

  this.unsubscribe = function(name){
    if(handlers[name]){
      delete handlers[name]
    }
  }

  this.fire = function(data){
    for(var name in handlers){
      handlers[name](data)
    }
  }
}

var peerHandler = function(app,config){
  var peers = {}
  //var aliveSince = new Date().getTime() / 1000
  var that = this
  var domain = config.domain
  var myDesc = {
    name: config.name,
    host: config.host,
    port: config.port,
    type: config.type
  }

  //Handlers

  var myNodeDownHandler = new myHandler();
  var myNewNodeHandler = new myHandler();
  var myDataHandler = new myHandler();

  //Listen for a new peer connecting to this pod
  app.post('/peer/' + domain + '/downvote',function(req,res){
    if(req.body){
      debug('downvote',req.body)
      res.json(downvoteHandler(req.body))
    } else {
      res.json(new Message('No info',true))
    }
  })

  //Listen for a ping request ... health check
  app.post('/peer/' + domain + '/ping',function(req,res){
    res.json(new Message('Pong',false))
  })

  //Message from another node letting me know there is a new node in the pod
  app.post('/peer/' + domain + '/newNode', function(req,res){
    debug('New node',req.body)
    res.json(newNodeHandler(req.body, false))
  })

  //Some data is been sent to this nodes
  // (and all the others, send this to the listener)
  app.post('/peer/' + domain + '/data', function(req,res){
    if(req.body && req.body.node && req.body.data){
      debug('Data',req.body)
      myDataHandler.fire(req.body)
      res.json(new Message('ACK',false))
    }else{
      res.json(new Message('No info',true))
    }
  })

  //Message from a new node letting me know about its existence
  app.post('/peer/' + domain + '/imNew', function(req,res){
    if(req.body){
      debug('im new',req.body)
      res.json(newNodeHandler(req.body,true))
    }else{
      res.json(new Message('No info', true))
    }
  })


  //Message from a node asking about my identity
  app.post('/peer/' + domain + '/whoAreYou', function(req,res){
    if(req.body){
      debug('who are you' , req.body)
      res.json(whoAreYouHandler(req.body))
    }else{
      res.json(new Message('No info for you rude node', true))
    }
  })

  //Public interface
  //Announce myself to the pod
  that.announce = function announce(node){
    return sendMessage(node,'imNew',myDesc)
  }

  that.onNodeDown = function(namespace,handler){
    return myNodeDownHandler.subscribe(namespace,handler)
  }

  that.onNewNode = function(namespace,handler){
    return myNewNodeHandler.subscribe(namespace,handler)
  }

  that.onData = function(namespace,handler){
    return myDataHandler.subscribe(namespace,handler)
  }

  //Send data to the other nodes
  that.sendData = function(data){
    broadcastMessage('data',{node:myDesc,data:data})
  }

  //This function just handles a possible new node that might not have introduced himself to me
  function nodeChecker(node){
    if(!peers[node.name])sendMessage(node,'whoAreYou',myDesc)
  }

  //Private Handlers
  function newNodeHandler(node, broadcast){
    var peer = null
    //Are we talking about myself?
    if(node.name === myDesc.name) return new Message('Ok',false)
    //Was this node already in our list?
    if(peers[node.name]){
      peer = peers[node.name]
      //Check if it's in the same host, maybe it crashed, if not, maybe it's a node acknowledging my existence ,
      // or just a host that already exists
      if(peer.host === node.host && !peer.down)
        return new Message('Host already exists',true)
      if(peer.down){
        peer.down = false       //Back online
        peer.downvote = 0
      }
      peer.aliveSince = node.aliveSince     //Update alive since
    } else {
      peer = peers[node.name] = node
      myNewNodeHandler.fire({node:node})
    }
    peer.lastHeardOf = new Date().getTime() / 1000;
    if(broadcast){
      broadcastMessage('newNode',peer)
        .then(function(){
          return sendMessage(node,'newNode',myDesc)
        })
    } else{
      sendMessage(node,'newNode',myDesc)
    }
    return new Message('Ok',false)
  }


  /**
   * Broadcast Message
   * @param {Message} message
   * @param {object} data
   * @return {P}
   */
  var broadcastMessage = function(message,data){
    var nodes = []
    for(var name in peers){
      if(!peers[name].down)
        nodes.push(sendMessage(peers[name],message,data)
          .catch(function(err){
            debug("Failed to broadcast message to"+err.node.name)
          }))
    }
    return P.all(nodes)
  }


  /**
   * Send message to a peer
   * @param {object} node
   * @param {Message} message
   * @param {object} data
   * @return {P}
   */
  var sendMessage = function(node,message,data){
    debug('Messaging: https://' + node.host + ':' +
      node.port + '/peer/' + domain + '/' + message,data)
    return request.postAsync(
      'https://' + node.host + ':' + node.port + '/peer/' +
        domain +'/' + message,
      {form : data}
    )
      .then(function(res,body){
        return body
      })
      .catch(function(err){
        throw {err: err, node: node, data: data}
      })
  }


  /**
   * Process downvote
   * @param {object} node
   * @return {Message}
   */
  function downvoteHandler(node){
    if(peers[node.name]){
      node = peers[node.name]
      if(node.down)
        return new Message('Already down',true)
      if(!node.downvote)
        node.downvote=1
      else
        node.downvote++
      if((Object.keys(peers).length - 1) === node.downvote){
        debug('Node ' + node.name + ' is down.')
        myNodeDownHandler.fire({node:node})
        node.down=true
      }
      return new Message('ACK',true)
    } else {
      return new Message('Unknown node',true)
    }
  }

  function whoAreYouHandler(node){
    return {node:myDesc}
  }



  var healthCheck = setInterval(function(){
    var nodes = []
    for(var name in peers){
      nodes.push(sendMessage(peers[name],'ping').catch(function(fault){
        debug('Broken node' + fault.node.name)
        //peers[fault.node.name].down = true
        broadcastMessage('downvote', fault.node)
      }))
    }
    return P.all(nodes).then(function(){
      debug('Health check done')
    })
  },30*1000)

}


/**
 * Return instance of peer handler, singleton
 * @param {object} express
 * @param {object} config
 * @return {instance}
 */
exports.getInstance = function(express,config){
  //Add our routes to handle stuff
  if(instance)return instance
  return new peerHandler(express,config)
}
