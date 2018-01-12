/**
 * Thinbus Javascript Secure Remote Password (SRP)
 * Version  1.8.0
 * Copyright 2014-2017 Simon Massey
 * http://www.apache.org/licenses/LICENSE-2.0
*/
const SHA256 = require("crypto-js/sha256");

const BigInteger = require('jsbn').BigInteger;

import randomStrings from './random-strings';

/**
 * A factory closure which takes SRP parameters and returns a SRP6JavascriptServerSession class with with the parameters bound to it. 
 * 
 * @param {string} N_base10 Safe prime N as decimal string. 
 * @param {string} g_base10 Generator g as decimal string.
 * @param {string} k_base16 Symetry braking k as hexidecimal string. See https://bitbucket.org/simon_massey/thinbus-srp-js/overview
 */
function srpServerFactory (N_base10, g_base10, k_base16) {

  function SRP6JavascriptServerSession() {
    "use strict";
    
    /**
     * The session is initialised and ready to begin authentication
     * by proceeding to {@link #STEP_1}.
     */
    this.INIT = 0;
      
    /**
     * The authenticating user has input their identity 'I' 
     * (username) and password 'P'. The session is ready to proceed
     * to {@link #STEP_2}.
     */
    this.STEP_1 = 1;
      
    /**
     * The user identity 'I' is submitted to the server which has 
     * replied with the matching salt 's' and its public value 'B' 
     * based on the user's password verifier 'v'. The session is 
     * ready to proceed to {@link #STEP_3}.
     */
    this.STEP_2 = 2;
      
    /**
     * The client public key 'A' and evidence message 'M1' are
     * submitted and the server has replied with own evidence
     * message 'M2'. The session is finished (authentication was 
     * successful or failed).
     */
    this.STEP_3 = 3;
    
    this.state = this.INIT;
    
    this.v = null; // verifier
    this.I = null; // identity (used as informational not for any crypto)
    this.salt = null; // salt
    this.b = null; // server private key
    this.B = null; // server public key
    this.k = null; // constant computed by the server
    this.S = null; // shared secret key long form
  	this.K = null; // shared secret hashed form
    
    // private
    this.check = function(v, name) {
      if( typeof v === 'undefined' || v === null || v === "" || v === "0" ) {
        throw new Error(name+" must not be null, empty or zero");
      }
    };
  }

  SRP6JavascriptServerSession.prototype.toPrivateStoreState = function() {
    "use strict";
      return {I: this.I, v: this.toHex(this.v), s: this.toHex(this.salt), b: this.toHex(this.b)};
  }

  SRP6JavascriptServerSession.prototype.fromPrivateStoreState = function(obj) {
    "use strict";
      //return {I: this.I, v: this.toHex(this.v), s: this.toHex(this.salt), b: this.toHex(this.b)};
      this.I = obj.I;
      this.v = this.fromHex(obj.v);
      this.salt = this.fromHex(obj.salt);
      this.b = this.fromHex(obj.b);
      this.B = this.g.modPow(this.b, this.N).add(this.v.multiply(this.k)).mod(this.N);
      this.state = this.STEP_1;
      return;
  }

  // public helper
  SRP6JavascriptServerSession.prototype.toHex = function(n) {
    "use strict";
    return n.toString(16);
  };

  // public helper
  /* jshint ignore:start */
  SRP6JavascriptServerSession.prototype.fromHex = function(s) {
    "use strict";
    return new BigInteger(""+s, 16); // jdk1.7 rhino requires string concat
  };
  /* jshint ignore:end */

  // public helper to hide BigInteger from the linter
  /* jshint ignore:start */
  SRP6JavascriptServerSession.prototype.BigInteger = function(string, radix) {
    "use strict";
    return new BigInteger(""+string, radix); // jdk1.7 rhino requires string concat
  };
  /* jshint ignore:end */


  // public getter of the current workflow state. 
  SRP6JavascriptServerSession.prototype.getState = function() {
    "use strict";
    return this.state;
  };

  /**
   * Gets the shared sessionkey
   * 
   * @param hash Boolean With to return the large session key 'S' or 'K=H(S)'
   */
  SRP6JavascriptServerSession.prototype.getSessionKey = function(hash) {
    "use strict";
    if( this.S === null ) {
      return null;
    }
    this.SS = this.toHex(this.S);
    if(typeof hash !== 'undefined' && hash === false){
      return this.SS;
    } else {
      if( this.K === null ) {
        this.K = this.H(this.SS);
      }
      return this.K;
    }
  };

  // public getter
  SRP6JavascriptServerSession.prototype.getUserID = function() {
    "use strict";
    return this.I;
  };

  /**
   * Increments this SRP-6a authentication session to
   * {@link State#STEP_1}.
   *
   * <p>Argument origin:
   *
   * <ul>
   *     <li>From client: user identity 'I'.
   *     <li>From server database: matching salt 's' and password verifier
   *        'v' values.
   * </ul>
   *
   * @param userID The identity 'I' of the authenticating user. Must not
   *               be {@code null} or empty.
   * @param s      The password salt 's'. Must not be {@code null}.
   * @param v      The password verifier 'v'. Must not be {@code null}.
   *
   * @return The server public value 'B'.
   *
   * @throws IllegalStateException If the mehod is invoked in a state
   *                               other than {@link State#INIT}.
   */
  SRP6JavascriptServerSession.prototype.step1 = function(identity, salt, verifier) {
    "use strict";
    //console.log("SRP6JavascriptServerSession.prototype.step1");
    //console.log("N: "+this.N);
    //console.log("g: "+this.g);
    //console.log("k: "+this.toHex(this.k));

      if( this.state !== this.INIT) {
          throw new Error("IllegalStateException not in state INIT");
      }

    this.check(identity, "identity");
    this.check(salt, "salt");
    this.check(verifier, "verifier");
    this.I = identity;
    this.v = this.fromHex(verifier);
    this.salt = this.fromHex(salt);

    this.state = this.STEP_1;
      this.b = this.randomB();
      //console.log("b: "+this.b);
      this.B = this.g.modPow(this.b, this.N).add(this.v.multiply(this.k)).mod(this.N);
      //console.log("B: "+this.B);
      this.state = this.STEP_1;
      return this.toHex(this.B);
  };

  /**
   * Computes the random scrambling parameter u = H(A | B)
   * <p> Specification RFC 2945
   * Will throw an error if 
   *
   * @param A      The public client value 'A'. Must not be {@code null}.
   * @param B      The public server value 'B'. Must not be {@code null}.
   *
   * @return The resulting 'u' value.
   */
  SRP6JavascriptServerSession.prototype.computeU = function(Astr, Bstr) {
    "use strict";
    //console.log("SRP6JavascriptServerSession.prototype.computeU");
    this.check(Astr, "Astr");
    this.check(Bstr, "Bstr");
    /* jshint ignore:start */
    var output = this.H(Astr+Bstr);
    //console.log("js raw u:"+output);
    var u = new BigInteger(""+output,16);
    //console.log("js u:"+this.toHex(u));
    if( BigInteger.ZERO.equals(u) ) {
      throw new Error("SRP6Exception bad shared public value 'u' as u==0");
    }
    return u;
    /* jshint ignore:end */
  };

  SRP6JavascriptServerSession.prototype.random16byteHex = function() {
      "use strict";

      var r1 = null;
      /* jshint ignore:start */
      r1 = random16byteHex.random();
      /* jshint ignore:end */
      return r1;
  };

  /**
   * Generate a random value in the range `[1,N)` using a minimum of 256 random bits.
   *
   * See specification RFC 5054.
   * This method users the best random numbers available. Just in case the random number
   * generate in the client web browser is totally buggy it also adds `H(I+":"+salt+":"+time())`
   * to the generated random number.
  */
  SRP6JavascriptServerSession.prototype.randomB = function() {
      "use strict";

      // our ideal number of random  bits to use for `a` as long as its bigger than 256 bits
      var hexLength = this.toHex(this.N).length;

      var ZERO = this.BigInteger("0", 10);
      var ONE = this.BigInteger("1", 10);

      var r = ZERO;

      //  loop until we don't have a ZERO value. we would have to generate exactly N to loop so very rare.
      while(ZERO.equals(r)){
          var rstr = randomStrings.hex(hexLength);

          //console.log("rstr:"+rstr);

          // we now have a random just at lest 256 bits but typically more bits than N for large N
          var rBi = this.BigInteger(rstr, 16);

          //console.log("rBi:"+rBi);

          // this hashes the time in ms such that we wont get repeated numbers for successive attempts
          // it also hashes the salt which can itself be salted by a server strong random which protects
          // against rainbow tables. it also hashes the user identity which is unique to each user
          // to protect against having simply no good random numbers anywhere
          var oneTimeBi = this.BigInteger(this.H(this.I+":"+this.salt+':'+(new Date()).getTime()), 16);

          //console.log("oneTimeBi:"+oneTimeBi);

          // here we add the "one time" hashed time number to our random number to the random number
          // this protected against a buggy browser random number generated generating a constant value
          // we mod(N) to wrap to the range [0,N) then loop if we get 0 to give [1,N)
          // mod(N) is broken due to buggy library code so we workaround with modPow(1,N)
          r = (oneTimeBi.add(rBi)).modPow(ONE, this.N);
      }

      //console.log("r:"+r);

      // the result will in the range [1,N) using more random bits than size N
      return r;
  };

  /**
   * Increments this SRP-6a authentication session to
   * {@link State#STEP_2}.
   *
   * <p>Argument origin:
   *
   * <ul>
   *     <li>From client: public value 'A' and evidence message 'M1'.
   * </ul>
   *
   * @param A  The client public value. Must not be {@code null}.
   * @param M1 The client evidence message. Must not be {@code null}.
   *
   * @return The server evidence message 'M2'.
   *
   * @throws SRP6Exception If the session has timed out, the client public
   *                       value 'A' is invalid or the user credentials
   *                       are invalid.
   *
   * @throws IllegalStateException If the method is invoked in a state
   *                               other than {@link State#STEP_1}.
   */
  SRP6JavascriptServerSession.prototype.step2 = function(Astr, M1client) {
    "use strict";

    if( this.state !== this.STEP_1 ) {
      throw new Error("IllegalStateException not in state STEP_1");
    }

    this.check(Astr, "A");
    this.check(M1client, "M1");

    var A = this.fromHex(Astr);

    var Bstr = this.toHex(this.B);

    var u = this.computeU(Astr, Bstr);

    this.S = this.v.modPow(u, this.N).multiply(A).modPow(this.b, this.N);

  //	console.log("sAA:"+Astr);
  //	console.log("sBB:"+Bstr);
  //	console.log("sSS:"+this.toHex(this.S));

      var M1str = this.H(Astr+Bstr+this.toHex(this.S));

      this.check(M1str, "M1str");

      // Java BigInteger math will trim leading zeros so we must do likewise to get a match across languages
      while (M1str.substring(0, 1) === '0') {
          //console.log("stripping leading zero from M1");
          M1str = M1str.substring(1);
      }

  //    console.log("M1client:"+M1client);
  //    console.log("M1str   :"+M1str);

      if( M1client !== M1str ){
          throw "Bad client credentials";
      }

      var M2 = this.H(this.toHex(A)+M1str+this.toHex(this.S));

      // Java BigInteger math will trim leading zeros so we must do likewise to get a match across languages
      while (M2.substring(0, 1) === '0') {
          //console.log("stripping leading zero from computedM2");
          M2 = M2.substring(1);
      }

    this.state = this.STEP_2;

    return M2;
  };

  function SRP6JavascriptServerSessionSHA256(){ }

  SRP6JavascriptServerSessionSHA256.prototype = new SRP6JavascriptServerSession();

  SRP6JavascriptServerSessionSHA256.prototype.N = new BigInteger(N_base10, 10);

  SRP6JavascriptServerSessionSHA256.prototype.g = new BigInteger(g_base10, 10);

  SRP6JavascriptServerSessionSHA256.prototype.H = function (x) {
    return SHA256(x).toString().toLowerCase();
  }

  SRP6JavascriptServerSessionSHA256.prototype.k = new BigInteger(k_base16, 16);

  // return the new session class
  return SRP6JavascriptServerSessionSHA256;
}

module.exports = srpServerFactory
