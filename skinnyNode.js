var P = require('bluebird')
var express = require('express')
var app = express()
var bodyParser = require('body-parser')

app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));

var https = require('https')
var fs = require('graceful-fs')
var config = require('./config.js')
var myHost = 'localhost'

if(process.argv.length < 3)
{
  console.log("Usage : node " + process.argv[1] + " <name> <port> <peer_port>")
  process.exit(1)
}

var peer = require('./helpers/peer.js').getInstance(app,{
  name:process.argv[2],
  host:myHost,
  port:process.argv[3],
  type:"test",
  domain:"test"
})

var sslOptions = {
  key: fs.readFileSync(config.ssl.pem),
  cert: fs.readFileSync(config.ssl.pem)
}
var server = https.createServer(sslOptions,app)
P.promisifyAll(server)

server.listenAsync(+process.argv[3],myHost)
.then(function(){
    console.log("Listening started")
  })

if(process.argv[4]){
  console.log("Announcing to node at port " + process.argv[4])
  peer.announce({
    name: '',host: myHost,port: process.argv[4],type: "test",domain: "test"
  })
}