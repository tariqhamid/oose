'use strict';


/**
 * Build packet
 * @param {string} command
 * @param {object} message
 * @return {Buffer}
 */
exports.build = function(command,message){
  return new Buffer(JSON.stringify({
    command: command,
    seq: new Date().getTime(),
    message: message
  }))
}


/**
 * Parse packet
 * @param {Buffer} packet
 * @return {object}
 */
exports.parse = function(packet){
  if(packet instanceof Buffer)
    packet = packet.toString()
  return JSON.parse(packet)
}


/**
 * Wrap the packet with the payload length and return a new buffer
 * @param {Buffer} payload
 * @return {Buffer}
 */
exports.withLength = function(payload){
  var length = new Buffer(2)
  length.writeUInt16BE(payload.length,0)
  return Buffer.concat([new Buffer('OOSE'),length,payload])
}


/**
 * TCP.send()
 * @param {string} command Command to send
 * @param {object} message Additional message/command parameters
 * @param {number} port Destination port
 * @param {string} address Destination address (or multicast address)
 * @param {Stream=} opt_readable Optional stream to deliver after command
 * @return {net.socket}
 */
exports.tcpSend = function(command,message,port,address,opt_readable){
  if(!port) throw new Error('Tried to send a TCP message without a port')
  var payload = util.withLength(util.build(command,message))
  var client = net.connect(port,address || '127.0.0.1')
  client.on('connect',function(){
    client.safeRead = util.safeRead.bind(client)
    client.write(payload)
    if(opt_readable instanceof stream.Readable){
      opt_readable.pipe(client)
    }
  })
  return client
}
