/**
 * Created by george on 7/10/15.
 */

var P = require('bluebird')
var request = require('request')
var debug = require('debug')('oose:peer')
/*
node{
  name : ''   //The node name
  host : ''   //The host where the node is at
  port : 0    //The port
  type : ''   //Some data that describes its identity, we don't care, another layer might

}

 */

var instance = null
var message = function(msg, err){
  return {message:msg, error:err}
}

var peerHandler = function(express, config){
  var peers = {}
  var aliveSince = new Date().getTime() / 1000;
  var me = this
  var domain = config.domain
  var myDesc = {
    name:config.name,
    host:config.host,
    port:config.port,
    type:config.type
  }
  //Listen for a new peer connecting to this pod
  express.post('/peer/'+domain+'/downvote', function(req,res){
    if(req.body){
      debug("downvote",req.body)
      res.json(downvoteHandler(req.body))
    }else{
      res.json(new message("No info", true))
    }
  })

  //Listen for a ping request ... health check
  express.post('/peer/'+domain+'/ping', function(req,res){
    res.json(new message("Pong", false))
  })

  //Message from another node letting me know there is a new node in the pod
  express.post('/peer/'+domain+'/new_node', function(req,res){
    debug("New node",req.body)
    res.json(newNodeHandler(req.body, false))
  })

  //Some data is been sent to this nodes (and all the others, send this to the listener)
  express.post('/peer/'+domain+'/data', function(req,res){
    debug("Data",req.body)
  })

  //Message from a new node letting me know about its existence
  express.post('/peer/'+domain+'/im_new', function(req,res){
    if(req.body){
      debug("im new",req.body)
      res.json(newNodeHandler(req.body,true))
    }else{
      res.json(new message("No info", true))
    }
  })

  //Announce myself to the pod
  me.announce = function announce(node){
    return sendMessage(node,'im_new',myDesc)
  }

  function newNodeHandler(node, broadcast){
    var peer = null
    //Are we talking about myself?
    if(node.name == myDesc.name)return new message("Ok", false)
    //Was this node already in our list?
    if(peers[node.name]){
      peer = peers[node.name]
      //Check if it's in the same host, maybe it crashed, if not, maybe it's a node acknowledging my existence ,
      // or just a host that already exists
      if(peer.host == node.host && !peer.down) return new message("Host already exists", true)
      if(peer.down){
        peer.down = false       //Back online
        peer.downvote = 0
      }
      peer.aliveSince = node.aliveSince     //Update alive since
    }else{
      peer = peers[node.name] = node
    }
    peer.lastHeardOf = new Date().getTime() / 1000;
    if(broadcast)broadcastMessage('new_node', peer).then(function(){ return sendMessage(node,'new_node',myDesc)})
    else sendMessage(node,'new_node',myDesc)
    return new message("Ok", false)
  }

  function broadcastMessage(message,data){
    var nodes = []
    for(var name in peers){
      if(!peers[name].down)nodes.push(sendMessage(peers[name],message,data))
    }
    return P.all(nodes)
  }

  function sendMessage(node,message, data){
    return new P(function(resolve,reject){
      debug("Messaging : ", 'https://'+node.host+':'+node.port+'/peer/'+domain+'/'+message,data)
      request.post('https://'+node.host+':'+node.port+'/peer/'+domain+'/'+message, {form : data},function(err,res,body){
        if(!err && res.statusCode == 200){
          resolve(body)
        }else{
          reject({err:err,node:node,data:data})
        }
      })
    })
  }

  function downvoteHandler(node){
    if(peers[node.name]){
      var node=peers[node.name]
      if(node.down)return new message("Already down",true)
      if(!node.downvote)node.downvote=1
      else node.downvote++
      if((Object.keys(peers).length - 1) == node.downvote ){
        debug("Node "+node.name+" is down.")
        node.down=true
      }
    }else{
      return new message("Unknown node",true)
    }
  }

  var healthCheck = setInterval(function(){
    var nodes = []
    for(var name in peers){
      nodes.push(sendMessage(peers[name],'ping').catch(function(fault){
        debug("Broken node" + fault.node.name)
        peers[fault.node.name].down = true
        broadcastMessage('downvote', fault.node)
      }))
    }
    return P.all(nodes).then(function(){
      debug("Health check done")
    })
  },20*1000)
}

exports.getInstance = function(express, config){
  //Add our routes to handle stuff
  if(instance)return instance
  return new peerHandler(express, config)
}