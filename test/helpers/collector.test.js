'use strict';
var expect = require('chai').expect
var ObjectManage = require('object-manage')

var Collector = require('../../helpers/collector')


describe('helpers/collector',function(){
  var col
  beforeEach(function(done){
    col = new Collector()
    done()
  })
  it('should instantiate',function(done){
    expect(col).to.be.instanceof(Collector)
    done()
  })
  it('should allow add/exec of collectors',function(done){
    col.collect(function(basket,next){
      basket.foo = 'blah'
      next(null,basket)
    })
    col.run(function(err,basket){
      expect(basket.foo).to.equal('blah')
      done(err)
    })
  })
  it('should allow add/exec of processors',function(done){
    col.process(function(basket,next){
      basket.blah = 'foo'
      next(null,basket)
    })
    col.run(function(err,basket){
      expect(basket.blah).to.equal('foo')
      done(err)
    })
  })
  it('should use object-manage for the basket',function(done){
    col.collect(function(basket,next){
      expect(basket).to.be.instanceof(ObjectManage)
      next(null,basket)
    })
    col.run(function(err){
      done(err)
    })
  })
  it('should allow save handlers',function(done){
    col.collect(function(basket,next){
      basket.$set('foo','blah')
      next(null,basket)
    })
    col.save(function(basket,next){
      expect(basket.foo).to.equal('blah')
      next(null,basket)
    })
    col.run(function(err,basket){
      expect(basket).to.be.instanceof(ObjectManage)
      done(err)
    })
  })
  it('should fail gracefully when the basket isnt passed',function(done){
    col.collect(function(basket,next){
      next()
    })
    col.run(function(err){
      expect(err).to.equal('Failed to pass basket to next()')
      done()
    })
  })
  it('should start and stop',function(done){
    col.collect(function(basket,next){
      basket.blah = 'foo'
      next(null,basket)
    })
    col.once('start',function(){
      col.once('loopEnd',function(basket){
        expect(basket.blah).to.equal('foo')
        col.stop(function(err){
          done(err)
        })
      })
    })
    col.start(5,5,function(err){
      if(err) done(err)
    })
  })
})
