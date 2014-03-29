# Communicator helper

## USAGE EXAMPLE

```js
var announce = new Communicator({proto: 'mcast'})
announce.use('send',function(req,next){
  req.set('Powered-By','..l..')
  next()
})
announce.use('receive',function(res,next){
  if(res.exists('Powered-By')){
    console.log('Powered by ' + res.get('Powered-By'))
  }
  next()
})
announce.on('receive',function(res){
  util.inspect(res.get())
})
announce.on('error',function(err){
  console.log('Something failed ' + err)
})
```
