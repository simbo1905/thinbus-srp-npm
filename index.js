/**
 * Thinbus Javascript Secure Remote Password (SRP)
 * Version  1.7.2
 * Copyright 2014-2017 Simon Massey
 * http://www.apache.org/licenses/LICENSE-2.0
*/
// see test/testrunner.js for usage
module.exports = {
    // the original browser client session prototype using RFC 5054 2048bit constants
    SRP6JavascriptClientSessionSHA256: require('./browser.js'),
    // client session factory is for advanced usage to set your own large prime values
    clientSessionFactory: require('./client.js'),
    // server session factory is for advanded usage to set your own large prime values
    serverSessionFactory: require('./server.js')
}