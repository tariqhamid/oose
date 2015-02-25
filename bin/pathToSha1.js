'use strict';

var filePath = process.argv[2]
console.log(filePath)
var match = filePath.match(/([0-9a-f\/]{60})/i)
console.log(match[0].replace(/\//g,''))
process.exit()
