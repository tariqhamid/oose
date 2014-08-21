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
* 3006 - Hideout, key value store for caching
* 3007 - Executioner, local scripting and peer management system

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

SNMP needs to be installed on Debian as follows

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

After that simply restart SNMPD before starting OOSE.

## Shredder

In short, Shredder is the transcoding system provided by OOSE nodes.
It relies on a simple API format and the use of JSONP callbacks.

### The API

Shredder exposes itself through an HTTP JSONP API.

### Queue a Job

**Method:** JSONP

**URL:** `/api/shredderJob`

**Options**
```js
{
  //optional scheduling (defaults to asap)
  schedule: {
    //now is the default and is specially handled and injected directly into the job queue
    start: 'now'
    // +<integer> will schedule the job in <integer> seconds from now and is handled specially
    //start: '+1', //1 second from now
    //anything else will fall through and be passed to moment() see http://momentjs.com/docs/#/parsing/
    //start: new Date().getTime(), //unix timestamp in milliseconds
  },
  //options that are used to receive job updates
  callback: [
    //register a callback handler
    {
      //make an http JSON post request to a callback
      driver: 'http',
      //throttle messages
      throttle: '250', //ms between messages (default is all messages)
      //define types of messages to receive
      level: ['error','completion'],
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
    //sometimes its useful for many parties to get updates
    {
      //define types of messages to receive
      level: ['progress'],
      //use udp to send job updates
      driver: 'udp',
      host: 'localhost',
      port: '3010'
    }
    //maybe tcp connections for firewall reasons (this will use a the same socket for the life of the job)
    //the tcp driver sends line separated stanzas of JSON
    {
      driver: 'tcp',
      level: 'error'
      host: 'localhost',
      port: '3011'
    }
  ],
  //options pertaining to the source file
  resource: [
    {
      //the name is used to reference resource later
      name: 'video',
      //optional mimetype if its already known (skips the detection process)
      mimetype: 'video/mp4',
      //set the driver (by default it is http)
      driver: 'http',
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
    //if we want to watermark our video lets grab that image
    {
      name: 'watermark',
      driver: 'ftp',
      host: 'localhost',
      path: '/watermark.png',
      auth: {
        username: 'foo',
        password: 'bar'
      }
    },
    //to make a dubbed version we want to download our dubbed audio track
    {
      name: 'dubbing',
      driver: 'scp',
      host: 'localhost',
      path: '/myfiles/dubbed.mp3',
      auth: {
        username: 'blah',
        password: 'bar'
      }
    }
    //maybe we need to get another video from rtmp
    {
      name: 'hdvideo',
      driver: 'rtmpdump',
      args: [
        {key: '-r', value: 'localhost'},
        {key: '--swfVfy', value: 'swf url'},
        {key: '-y', value: 'stream file'},
        {key: '-p', value: 'page url'},
        {key: '-T', value: 'token'},
        {key: '-t', value: 'localhost'}
      ]
    },
    //maybe we need to send a chain of requests to setup cookies
    {
      name: 'protectedvideo',
      driver: 'http',
      //the special chain parameter takes an array of requests that are fired in order
      //the last request is assumed to be the request that delivers the resource
      //NOTE: when using chain, cookies are enabled and the jar is available to all
      //the members of the chain
      chain: [
        //login to the system
        {
          method: 'post',
          url: 'http://foo/login',
          form: {
            username: 'foo',
            password: 'bar'
          }
        },
        //make an intermediate request
        {
          url: 'http://foo/page2'
        },
        //make the final request (this will save the result to
        //the 'protectedvideo' resource
        {
          url: 'http://foo/video'
        }
      ]
    } 
  ],
  //options that are used to control the encoding
  encoding: {
    [
      {
        //define a template, or omit this or title it none for a custom chain
        template: 'none',
        //define a job chain
        jobs: [
          {
            //set the position of the job (this is important for injecting jobs in templates)
            position: 0,
            //select the program to use
            driver: 'ffmpeg',
            //arguments for the program
            //key = the programs raw argument name, value; resources can be used with their name eg {watermark}
            args: [
              //input
              {key: '-i', value: '{hdvideo}'},
              //meta data
              {key: '-metadata', value:'title="Video 1"'},
              //video options
              {key: '-s', value: 'hd1080'},
              {key: '-vf', value: '[in] movie={watermark},lutyuv=a=va1/2 [logo]; [logo] overlay=W-w:0 [out]'}
              {key: '-vcodec', value: 'libx264'},
              {key: '-vpre', value: 'medium'},
              //encoder specific options
              {key: '-tune', value: 'animation'},
              {key: '-movflags', value: '+faststart'},
              {key: '-pix_fmt', value: 'yuv420p'},
              {key: '-crf', value: '23'},
              //audio options
              {key: '-acodec', value: 'copy'},
              //mux options
              {key: '-f', value: 'mp4'},
              //output
              {key: '-y', value: '{hdvideoAsMP4}'
            ]
          },
        ]
      },
      //this is an example of using a utility chain
      {
        jobs: [
          {
            position: 10,
            //select the program to use
            driver: 'ffmpeg',
            //arguments for the program
            //key = the programs raw argument name, value; resources can be used with their name eg {watermark}
            args: [
              //input
              {key: '-i', value: '{video}'},
              //metadata
              {key: '-metadata', value:'title="Video 1"'},
              //video options
              {key: '-s', value: 'hd1080'},
              {key: '-vf', value: '[in] movie={watermark},lutyuv=a=va1/2 [logo]; [logo] overlay=W-w:0 [out]'}
              {key: '-vcodec', value: 'libx264'},
              {key: '-vpre', value: 'medium'},
              //encoder specific options
              {key: '-tune', value: 'animation'},
              {key: '-movflags', value: '+faststart'},
              {key: '-pix_fmt', value: 'yuv420p'},
              {key: '-crf', value: '23'},
              //audio options
              {key: '-acodec', value: 'copy'},
              //mux options
              {key: '-f', value: 'mp4'},
              //output
              {key: '-y', value: '{videoAsMP4}'
            ]
          },
          {
            position: 20,
            driver: 'mp4box',
            args: [
              {key: 'inter', value: '1250'},
              {key: 'hint'},
              {key: 'isma'},
              {key: 'noprog'},
              {value: '{videoAsMP4}'}
            ]
          }
        ]
      },
      //templates can be used to populate defaults
      {template: 'ffmpegToMp4'}
      //output a thumbnail
      {
        template: 'thumbnail',
        //skip to 30 seconds from the beginning or last frame when shorter
        args: [
          {key: '-ss', value: '30'}
        ]
      },
      //eg: output a thumbnail set
      {
        driver: 'thumbnailSet',
        input: '{hdvideoAsMP4}',
        output: '{thumbnailSet}', //save the resulting files to the thumbnailSet resource
        //snap a thumbnail every 15 seconds
        interval: 15
      }
    ],
    //tell the system what resources to save, any resources not named here will be discarded
    save: ['hdVideoAsMP4','videoAsMP4','thumbnailSet','thumbnail']
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