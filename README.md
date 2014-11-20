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
  prism: {
    enabled: true,
    master: true
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

## Logging

Console logging is cotrolled by pass one or more `-v` to the app

eg
```
$ node app
```

* Defaults to `-vv` if you want no console logging use `-q`
* `v` - Only high level process messages are logged
* `vv` - Normal logging for interactive shells
* `vvv` - Debug logging with call traces
* `vvvv` - Debug logging without call traces

## Debug Logging

All debug logging now uses the [https://github.com/visionmedia/debug](debug)
package.

The following can be used to see all messages (typically used in dev)
```
$ DEBUG=oose* node app
```

From there follow the debug filtering rules defined
[https://github.com/visionmedia/debug#wildcards](here)


## Changelog

### 1.0.0
* Major restructure of cluster mentality
* Cluster hierarchy upgraded for global CDNs
* No longer exports data, should use existing tools (such as nginx)
* Multicast is no longer used
* SNMP is no longer used
* Announcement and ping have been removed
* Unicast network style
* Axon for inter process communication and RESTful HTTP API's for public interaction
* Code is implemented using promises
* `infant` is used for process control

### 0.6.0
* (Skipped)

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
