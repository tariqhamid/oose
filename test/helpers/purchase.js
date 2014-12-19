'use strict';
var content = require('./content')


/**
 * Mock purchase
 * @type {object}
 */
module.exports = {
  sha1: content.sha1,
  ext: content.ext,
  token: '27p5Ujk4xNRqdj1anKb4128GWu7b8n30p8FN3wJk1VS4aMD7Bf5Ad21DU67U11Cl',
  life: 21600,
  map: {
    exists: true,
    count: 2,
    map: {
      prism1: {exists: true, count: 1, map: {store1: true, store2: false}},
      prism2: {exists: true, count: 1, map: {store3: true, store4: false}}
    }
  }
}
