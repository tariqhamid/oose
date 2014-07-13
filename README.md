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
  gump: {
    enabled: true,
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
$ apt-get -y install dstat vim screen mongodb
```

**Note** MongoDB must be installed to use Gump

Create a node user

```
$ adduser node
```

Checkout the repo

```
$ cd /opt
$ git clone https://github.com/eSited/oose.git
```

Install PM2 and setup logging

```
$ npm -g install pm2
$ mkdir /var/log/node
$ chown -R node:node /opt/oose
```

Install dependencies

```
$ cd /opt/oose
$ npm install
```

Start with PM2

```
$ cd /opt/oose
$ pm2 start processes.json
```

## Linux SNMP Notes

SNMP needs to be installed on debian as follows

```
$ aptitude -y install snmpd
```

To get the proper data through SNMP the config must be updated at this part

```
###############################################################################
#
#  ACCESS CONTROL
#

                                                 #  system + hrSystem groups only
view   systemonly  included   .1.3.6.1.2.1.1
view   systemonly  included   .1.3.6.1.2.1.2
view   systemonly  included   .1.3.6.1.2.1.4
view   systemonly  included   .1.3.6.1.2.1.25
view   systemonly  included   .1.3.6.1.2.1.31
```

After that simply restart snmpd before start oose.

## Changelog

### 0.1.0
* Initial release