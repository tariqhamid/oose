'use strict';
var P = require('bluebird')
var numeral = require('numeral')

var e2e = require('./helpers/e2e')


/**
 * Iteration counts of tests
 * @type {object}
 */
var itn = {
  login: 150,
  contentUpload: 2000000,
  contentExists: 2000000,
  contentDetail: 2000000,
  contentExistsInvalidate: 2000000,
  contentDownload: 2000000,
  contentPurchase: 2000000,
  contentDeliver: 2000000
}


/**
 * Repeat a test for benchmarking
 * @param {object} prism
 * @param {number} times
 * @param {string} test
 * @return {function}
 */
var repeatTest = function(prism,times,test){
  return function(){
    var promises = []
    for(var i = 0; i < times; i++){
      promises.push(e2e[test](prism))
    }
    return P.all(promises)
  }
}

describe('benchmark',function(){
  describe('benchmark:prism',function(){
    //spin up an entire cluster here
    this.timeout(30000)
    //start servers and create a user
    before(function(){
      var that = this
      return e2e.before(that)
    })
    //remove user and stop services
    after(function(){
      var that = this
      return e2e.after(that)
    })
    it('master should be up',e2e.checkUp('master',e2e.clconf.master))
    it('prism1 should be up',e2e.checkUp('prism',e2e.clconf.prism1))
    it('prism2 should be up',e2e.checkUp('prism',e2e.clconf.prism2))
    it('store1 should be up',e2e.checkUp('store',e2e.clconf.store1))
    it('store2 should be up',e2e.checkUp('store',e2e.clconf.store2))
    it('store3 should be up',e2e.checkUp('store',e2e.clconf.store3))
    it('store4 should be up',e2e.checkUp('store',e2e.clconf.store4))
    it('login initially',function(){
      return e2e.prismLogin(e2e.clconf.prism1)()
        .then(function(session){
          e2e.user.session = session
        })
    })
    it('login and logout ' + numeral(itn.login).format('0,0') + 'x',function(){
      var logout = function(prism){
        return function(session){
          return e2e.prismLogout(session,prism)
        }
      }
      var prism = e2e.clconf.prism2
      var promises = []
      for(var i = 0; i < itn.login; i++){
        promises.push(e2e.prismLogin(prism)().then(logout(prism)))
      }
      return P.all(promises)
    })

    it('content upload ' + numeral(itn.contentUpload).format('0,0') + 'x',
      repeatTest(e2e.clconf.prism1,itn.contentUpload,'contentUpload'))

    it('content exists ' + numeral(itn.contentExists).format('0,0') + 'x',
      repeatTest(e2e.clconf.prism1,itn.contentExists,'contentExists'))

    it('content details ' + numeral(itn.contentDetail).format('0,0') + 'x',
      repeatTest(e2e.clconf.prism1,itn.contentDetail,'contentDetail'))

    it('content exists invalidate ' +
      numeral(itn.contentExistsInvalidate).format('0,0') + 'x',
      repeatTest(e2e.clconf.prism1,
        itn.contentExistsInvalidate,'contentExistsInvalidate'))

    it('content download ' + numeral(itn.contentDownload).format('0,0') + 'x',
      repeatTest(e2e.clconf.prism1,itn.contentDownload,'contentDownload'))

    it('should purchase content initially',function(){
      return e2e.contentPurchase(e2e.clconf.prism1)()
        .then(function(result){
          e2e.purchase = result
        })
    })

    it('content purchase ' + numeral(itn.contentPurchase).format('0,0') + 'x',
      repeatTest(e2e.clconf.prism1,itn.contentPurchase,'contentPurchase'))

    it('content deliver ' + numeral(itn.contentDeliver).format('0,0') + 'x',
      repeatTest(e2e.clconf.prism1,itn.contentDeliver,'contentDeliver'))

    it('should remove purchase',
      e2e.contentPurchaseRemove(e2e.clconf.prism2))
  })
})
