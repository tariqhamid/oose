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

## Port Layout

By default OOSE starts several services, all of which run on different ports and listen on all interfaces.

Here is a map of what services are on each port.

* 3000 - MESH, the announcement and heartbeat system
* 3001 - Export, the file retrieval system
* 3002 - Import, accepts new files in a raw TCP stream
* 3003 - Prism, the reflector and load balancer
* 3004 - Gump, user interface for managing files
* 3005 - LG, the cluster looking glass

## Redis Schema

### Peers

* peer:db:[hostname]
  * Description: Peer meta information acquired from the announce packet
  * Type: Hash
* peer:rank
  * Description: A ranking of peers based on their availableCapacity
  * Type: Sorted Set
* peer:next
  * Description: The meta information of the list for the peerNext selection, stored in a hash of JSON objects
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

## Shredder

In short, Shredder is the transcoding system provided by OOSE nodes.
It relies on a simple API format and the use of JSONP callbacks.

### The API

Shredder exposes itself through Prism, so it will always be important to know
how to access the OOSE Prism to queue the job. This is done so that Prism
can balance the jobs across the available nodes.

### Queue a Job

**Method:** JSONP

**URL:** `/api/shredderJob`

**Options**
```js
{
  //options pertaining to the source file
  source: {
    filename: 'foo.mp4',
    mimetype: 'video/mp4',
    sha1: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33',
    //the url used to download the source file, http and https are supported
    url: 'http://localhost/tmp/24zsf',
    //any additional headers that should be sent with the request
    headers: ['User-Agent: Node'],
    //if http basic auth is required enter that here
    auth: {
      username: 'foo',
      password: 'bar'
    }
  },
  //options that are used to receive job updates
  callback: {
    //url that OOSE will JSONP to send job updates to
    url: 'http://localhost/myapp/jobUpdate'
    //any additional headers that should be sent
    headers: [],
    //basic auth if needed
    auth: {
      username: 'foo',
      password: 'bar'
    }
  },
  //options that are used to formulate the output
  output: {
    [
      //output a video transcoded to mp4
      {
        //the custom profile takes raw ffmpeg options with no defaults
        profile: 'custom',
        //ffmpeg preset
        preset: 'fast'
        //ffmpeg crf
        crf: 24,
        //offset to start from (in seconds)
        start: 0,
        //length to capture (in seconds)
        length: 0,
        //video encoding options
        video: {
          codec: 'h264',
          width: '600',
          height: '400',
          bitrate: 'something',
          filters: []
        },
        //audio encoding options
        audio: {
          codec: 'libfaac',
          bitrate: 'something'
        },
        mux: {
          type: 'mp4'
        }
      },
      //output a file using the oose default mp4 presets
      {
        profile: 'mp4',
      },
      //output a file using the oose default mp4 preset with a custom filter on the video
      {
        profile: 'mp4',
        video: {
          filters: ['my custom filter']
        }
      },
      //output a thumbnail
      {
        profile: 'thumbnail',
        //skip to 30 seconds from the beginning or last frame when shorter
        skip: 30
      },
      //output a thumbnail set
      {
        profile: 'thumbnailSet',
        //snap a thumbnail every 15 seconds
        interval: 15
      }
    ]
  }
```

## Changelog

### 0.3.0
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