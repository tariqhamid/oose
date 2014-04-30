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

**NOTE** Remember to change the secret for the embed API access

```js
'use strict';
module.exports = {
  mesh: {
    debug: 1
  },
  store: {
    enabled: true
  },
  supervisor: {
    enabled: true
  },
  prism: {
    enabled: true
  },
  mongoose: {
    enabled: true
  },
  embed: {
    enabled: true,
    secrets: ['ooseembedapikey'] //CHANGE THIS!!!
  },
  shredder: {
    enabled: true,
    transcode: {videos: {enabled: true}}
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

* peer:db:[hostname]
  * Description: Peer meta information acquired from the announce packet
  * Type: Hash
* peer:rank
  * Description: A ranking of peers based on their availableCapacity
  * Type: Sorted Set
* peer:next
  * Description: The meta information of the winner of the peerNext selection
  * Type: Hash
* peer:prism
  * Description: List of peers running the prism service
  * Type: Set
* peer:store
  * Description: List of peers running the store service
  * Type: Set

### Prism

* prism:[sha1]
  * Description: List of peers with a given hash
  * Type: Set

### Store

* inventory
  * Description: Peer inventory of sha1 hashes
  * Type: Set
* inventory:[sha1]
  * Description: Meta information about a file
  * Type: Hash

## Install Procedure

### Debian

Required packages

```
$ apt-get -y install gcc g++ make git redis-server
```

Optional packages

```
$ apt-get -y install dstat vim screen
```

Create an oose user

```
$ adduser oose
```

Checkout the repo

```
$ su - oose
$ git clone https://github.com/eSited/oose.git
```

Install dependencies

```
$ su - oose
$ cd oose
$ npm install
```

Start app inside a screen

```
$ screen -a -S oose
$ su - oose
$ cd oose
$ node app
```

## Changelog

### 0.1.0
* Initial release