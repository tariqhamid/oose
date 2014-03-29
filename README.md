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
    enabled: true
  }
}
```

Of course any additional overrides can be added to the config here.

Second, start the system.

```
$ node app
```


