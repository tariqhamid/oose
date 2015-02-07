OOSE [![Build Status](https://magnum.travis-ci.com/eSited/oose.svg?token=EgNQpuNvio2L8rSzcEkz&branch=master)](https://magnum.travis-ci.com/eSited/oose)
========

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
  prism: {
    enabled: true
  },
  master: {
    enabled: true
  }
}
```

Of course any additional overrides can be added to the config here.

Second, start the system.

```
$ node app
```

## Testing

The default test suite can be ran using npm

```
$ npm test
```

For development a more interactive test method might be best

```
$ mocha -R spec --watch
```

## Debugging

All debug logging now uses the [https://github.com/visionmedia/debug](debug)
package.

The following can be used to see all messages (typically used in dev)
```
$ DEBUG=oose* node app
```

From there follow the debug filtering rules defined
[https://github.com/visionmedia/debug#wildcards](here)

## NGINX Configuration

There is a folder `nginx` in the main root it contains some samples to get
OOSE up and running.

`nginx/nginx.conf`

This is what is recommended to use as the main configuration file for the
OOSE host. This file can be used as a reference to build into a more complex
system.

`nginx/nginx.store.conf`

This file is an example of what each OOSE storeinstance needs to operate
properly on the server. It is recommended that each OOSE instance uses its
own IP address to make access more reliable.

`nginx/nginx.prism.conf`
An example prism configuration.

`nginx/html`

This folder contains what should live in the root folder (aka the data folder)

## Changelog

### 1.1.0
* Many bug fixes from initial production deployment
* Exists now takes bulk requests with an array of sha1's and is still
backward compatible with singular requests.
* Upgrade to oose-sdk 1.1.0 which implements the Prism helper
* Introduce `/user/session/renew` to extend session life
* Sessions are now expired from prisms based on their expiration date it is
important that API consumers proactively renew their sessions.

### 1.0.0
* Ground up rewrite
* Major restructure of cluster mentality
* Cluster hierarchy upgraded for global CDNs
* No longer exports data, should use existing tools (such as nginx)
* Multicast is no longer used
* SNMP is no longer used
* Announcement and ping have been removed
* Unicast network style
* RESTful HTTP API's for public/private interaction
* Code is implemented using promises
* `infant` is used for process control
* 100% test coverage

### 0.6.0
* Implemenation of infant for worker control
* Promisifcation of some of the base code
* Bug fixes

### 0.5.6
 [Closed Issues](https://github.com/eSited/oose/issues?q=milestone%3A0.5.6+is%3Aclosed)
* Fix inventory handling of stream for builds
* Shredder workers now implement the helpers/child system
* Fixes #134 related to hash update fails
* Completely removed all occurrences of streams1 and upgraded everything to
streams2
* Fixes #135 where callbacks would be called multiple times during sending
of files to peers using peer.sendFromReadble
* Fixes #132 by increasing the default timeout for locates and making the
setting configurable
* Closes #136 child helper will now kill all children on exit
* Closes #131 prism only uses a single locate connection now and all of the
one off connections now close properly once the transaction is finished
* Fixes #129 which prevented shredder from properly load balancing jobs
* Fixes #128 now reports file size of clones
* Closes #122 executioner now makes a backup of the config file before replacing
it
* Fixes #130 removes prism redirect loops, reduces failed locates, better
logic handling to prevent failures under load and unstable network conditions

### 0.5.2
* Fixes #130 related to prism hangs

### 0.5.1
* Fixed issue with failing to complete locate
* Fixed bug with prism not throwing 404's on empty locate
* Fixed bug with export not throwing 404's on non existent files
* Inventory now runs in parallel with configurable concurrence

### 0.5.0
[Closed Issues](https://github.com/eSited/oose/issues?q=milestone%3A0.5.0+is%3Aclosed)
* Removed mesh in favor of more exposed communications
* Implemented multicast helper
* Implemented axon for TCP p2p communication
* Exposed announce as its own subsystem
* Exposed ping as its own subsystem
* Exposed locate as its own subsystem
* Exposed clone as its own subsystem
* Major overhaul of SNMP collection system
* Addition of Child helper for controlling sub processes
* All sub systems now run in their own sub process
* Fixed several crashes related to inter-peer communication
* Better error handling and watchdog ability through sub processes
* Introduction of unit testing, more test coverage to follow

### 0.4.0
[Closed Issues](https://github.com/eSited/oose/issues?q=milestone%3A0.4.0+is%3Aclosed)
* Upgraded to Express 4 system wide
* Upgraded to object-manage 0.8 system wide
* Dropped restler in favor of request
* Work in progress...

### 0.3.0
[Closed Issues](https://github.com/eSited/oose/issues?q=milestone%3A0.3.0+is%3Aclosed)
* Fix next peer selection to be a list
* Added start param support to export (MP4 pseudo streaming)
* Added looking glass (lg) for cluster status
* Added gump, for user file management interface
* Added shredder transcoding system
* Usage of SNMP for peer stat collection

### 0.2.0
* Never released

### 0.1.0
* Initial release
