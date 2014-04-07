# oose

Object Oriented Storage Engine

## Installation

```
$ git clone git@github.com:eSited/oose.git
$ cd oose
$ npm install
```

## Starting

First, setup a local config file like so.

```js
'use strict';
module.exports = {
  store: {
    enabled: true
  },
  supervisor: {
    enabled: true
  },
  prism: {
    enabled: true
  }
}
```

Of course any additional overrides can be added to the config here.

Second, start the system.

```
$ node app
```

## Redis Schema

### Peers

* peer:<hostname>
  * Description: Peer meta information acquired from the announce packet
  * Type: Hash
* peerRank
  * Description: A ranking of peers based on their availableCapacity
  * Type: Sorted Set
* peerNext
  * Description: The meta information of the winner of the peerNext selection
  * Type: Hash
* prismList
  * Description: List of peers running the prism service
  * Type: Set
* storeList
  * Description: List of peers running the store service
  * Type: Set

### Local

* inventory
  * Description: Peer inventory of sha1 hashes
  * Type: Set
* <sha1>
  * Description: Meta information about a file
  * Type: Hash
