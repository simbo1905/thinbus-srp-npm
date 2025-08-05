// SPDX-FileCopyrightText: 2014-2025 Simon Massey
// SPDX-License-Identifier: Apache-2.0
(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.thinbus = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({"SRP6JavascriptClientSessionSHA256":[function(require,module,exports){
/**
 * Thinbus Javascript Secure Remote Password (SRP)
 * Version  1.7.5
 * Copyright 2014-2017 Simon Massey
 * http://www.apache.org/licenses/LICENSE-2.0
*/
const SHA256 = require("crypto-js/sha256");

const BigInteger = require('jsbn').BigInteger;

var randomStrings = require('random-strings');

/**
 * A factory closure which takes SRP parameters and returns a SRP6JavascriptClientSession class with the parameters bound to it. 
 * 
 * @param {string} N_base10 Safe prime N as decimal string. 
 * @param {string} g_base10 Generator g as decimal string.
 * @param {string} k_base16 Symmetry braking k as hexidecimal string. See https://bitbucket.org/simon_massey/thinbus-srp-js/overview
 */
function srpClientFactory (N_base10, g_base10, k_base16) {


	function SRP6JavascriptClientSession() {
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
		
		this.x = null; // salted hashed password
		this.v = null; // verifier
		this.I = null; // identity
		this.P = null; // password, nulled after use
		this.salt = null; // salt
		this.B = null; // server public key
		this.A = null; // client public key
		this.a = null; // client private key
		this.k = null; // constant computed by the server
		this.u = null; // blended public keys
		this.S = null; // shared secret key long form
		this.K = null; // shared secret hashed form
		this.M1str = null; // password proof
		
		// private
		this.check = function(v, name) {
			if( typeof v === 'undefined' || v === null || v === "" || v === "0" ) {
				throw new Error(name+" must not be null, empty or zero");
			}
		};
		
		/** private<p>
		 * 
		 * Computes x = H(s | H(I | ":" | P))
		 * <p> Uses string concatenation before hashing. 
		 * <p> Specification RFC 2945
		 *
		 * @param salt     The salt 's'. Must not be null or empty.
		 * @param identity The user identity/email 'I'. Must not be null or empty.
		 * @param password The user password 'P'. Must not be null or empty
		 * @return The resulting 'x' value as BigInteger.
		 */
		this.generateX = function(salt, identity, password) {
			this.check(salt, "salt");
			this.check(identity, "identity");
			this.check(password, "password");
			//console.log("js salt:"+salt);
			//console.log("js i:"+identity);
			//console.log("js p:"+password);
			this.salt = salt;
			var hash1 = this.H(identity+':'+password);
			
			// server BigInteger math will trim leading zeros so we must do likewise to get a match
			while (hash1.substring(0, 1) === '0') { 
				//console.log("stripping leading zero from M1");
				hash1 = hash1.substring(1);
			}
			
			//console.log("js hash1:"+hash1);
			//console.log("js salt:"+salt);
			var concat = (salt+hash1).toUpperCase();
			//console.log("js concat:"+concat);
			var hash = this.H(concat);
			
			// Java BigInteger math will trim leading zeros so we do likewise
			while (hash.substring(0, 1) === '0') { 
				//console.log("stripping leading zero from M1");
				hash = hash.substring(1);
			}		
			
			//console.log("js hash:"+hash)
			//console.log("js x before modN "+this.fromHex(hash));
			this.x = this.fromHex(hash).mod(this.N());
			return this.x;
		};

		/**
		 * Computes the session key S = (B - k * g^x) ^ (a + u * x) (mod N)
		 * from client-side parameters.
		 * 
		 * <p>Specification: RFC 5054
		 *
		 * @param N The prime parameter 'N'. Must not be {@code null}.
		 * @param g The generator parameter 'g'. Must not be {@code null}.
		 * @param k The SRP-6a multiplier 'k'. Must not be {@code null}.
		 * @param x The 'x' value, see {@link #computeX}. Must not be 
		 *          {@code null}.
		 * @param u The random scrambling parameter 'u'. Must not be 
		 *          {@code null}.
		 * @param a The private client value 'a'. Must not be {@code null}.
		 * @param B The public server value 'B'. Must note be {@code null}.
		 *
		 * @return The resulting session key 'S'.
		 */
		this.computeSessionKey = function(k, x, u, a, B) {
			this.check(k, "k");
			this.check(x, "x");
			this.check(u, "u");
			this.check(a, "a");
			this.check(B, "B");

			var exp = u.multiply(x).add(a);
			var tmp = this.g().modPow(x, this.N()).multiply(k);
			return B.subtract(tmp).modPow(exp, this.N());
		};
	}

	// public helper
	SRP6JavascriptClientSession.prototype.toHex = function(n) {
		"use strict";
		return n.toString(16);
	};

	// public helper
	/* jshint ignore:start */
	SRP6JavascriptClientSession.prototype.fromHex = function(s) {
		"use strict";
		return new BigInteger(""+s, 16); // jdk1.7 rhino requires string concat
	};
	/* jshint ignore:end */

	// public helper to hide BigInteger from the linter
	/* jshint ignore:start */
	SRP6JavascriptClientSession.prototype.BigInteger = function(string, radix) {
		"use strict";
		return new BigInteger(""+string, radix); // jdk1.7 rhino requires string concat
	};
	/* jshint ignore:end */


	// public getter of the current workflow state. 
	SRP6JavascriptClientSession.prototype.getState = function() {
		"use strict";
		return this.state;
	};

	/**
	 * Gets the shared sessionkey
	 * 
	 * @param hash Boolean With to return the large session key 'S' or 'K=H(S)'
	 */
	SRP6JavascriptClientSession.prototype.getSessionKey = function(hash) {
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
	SRP6JavascriptClientSession.prototype.getUserID = function() {
		"use strict";
		return this.I;
	};

	/* 
	* Generates a new salt 's'. This takes the current time, a pure browser random value, and an optional server generated random, and hashes them all together. 
	* This should ensure that the salt is unique to every use registration regardless of the quality of the browser random generation routine. 
	* Note that this method is optional as you can choose to always generate the salt at the server and sent it to the browser as it is a public value.  
	* <p>
	* Always add a unique constraint to where you store this in your database to force that all users on the system have a unique salt. 
	*
	* @param opionalServerSalt An optional server salt which is hashed into a locally generated random number. Can be left undefined when calling this function.
	* @return 's' Salt as a hex string of length driven by the bit size of the hash algorithm 'H'. 
	*/
	SRP6JavascriptClientSession.prototype.generateRandomSalt = function(opionalServerSalt) {
		"use strict";
		var s = null;
		
		/* jshint ignore:start */
		s = randomStrings.hex(32); // 16 bytes
		/* jshint ignore:end */

		// if you invoke without passing the string parameter the '+' operator uses 'undefined' so no nullpointer risk here
		var ss = this.H((new Date())+':'+opionalServerSalt+':'+s);
		return ss;
	};

	/* 
	* Generates a new verifier 'v' from the specified parameters.
	* <p>The verifier is computed as v = g^x (mod N). 
	* <p> Specification RFC 2945
	*
	* @param salt     The salt 's'. Must not be null or empty.
	* @param identity The user identity/email 'I'. Must not be null or empty.
	* @param password The user password 'P'. Must not be null or empty
	* @return The resulting verifier 'v' as a hex string
	*/
	SRP6JavascriptClientSession.prototype.generateVerifier = function(salt, identity, password) {
		"use strict";
		//console.log("SRP6JavascriptClientSession.prototype.generateVerifier");
		// no need to check the parameters as generateX will do this
		var x = this.generateX(salt, identity, password);
		//console.log("js x: "+this.toHex(x));
		this.v = this.g().modPow(x, this.N());
		//console.log("js v: "+this.toHex(this.v));
		return this.toHex(this.v);
	};

	/**
	 * Records the identity 'I' and password 'P' of the authenticating user.
	 * The session is incremented to {@link State#STEP_1}.
	 * <p>Argument origin:
	 * <ul>
	 *     <li>From user: user identity 'I' and password 'P'.
	 * </ul>
	 * @param userID   The identity 'I' of the authenticating user, UTF-8
	 *                 encoded. Must not be {@code null} or empty.
	 * @param password The user password 'P', UTF-8 encoded. Must not be
	 *                 {@code null}.
	 * @throws IllegalStateException If the method is invoked in a state 
	 *                               other than {@link State#INIT}.
	 */
	SRP6JavascriptClientSession.prototype.step1 = function(identity, password) {
		"use strict";
		//console.log("SRP6JavascriptClientSession.prototype.step1");
		//console.log("N: "+this.N());
		//console.log("g: "+this.g());
		//console.log("k: "+this.toHex(this.k));
		this.check(identity, "identity");
		this.check(password, "password");
		this.I = identity;
		this.P = password;
		if( this.state !== this.INIT ) {
			throw new Error("IllegalStateException not in state INIT");
		}
		this.state = this.STEP_1;
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
	SRP6JavascriptClientSession.prototype.computeU = function(Astr, Bstr) {
		"use strict";
		//console.log("SRP6JavascriptClientSession.prototype.computeU");
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

	SRP6JavascriptClientSession.prototype.random16byteHex = function() {
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
	 * @param N The safe prime.
	*/
	SRP6JavascriptClientSession.prototype.randomA = function(N) {
		"use strict";

		//console.log("N:"+N);

		// our ideal number of random  bits to use for `a` as long as its bigger than 256 bits
		var hexLength = this.toHex(N).length;

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
			r = (oneTimeBi.add(rBi)).modPow(ONE, N);
		}

		//console.log("r:"+r);

		// the result will in the range [1,N) using more random bits than size N
		return r;
	};

	/**
	 * Receives the password salt 's' and public value 'B' from the server.
	 * The SRP-6a crypto parameters are also set. The session is incremented
	 * to {@link State#STEP_2}.
	 * <p>Argument origin:
	 * <ul>
	 *     <li>From server: password salt 's', public value 'B'.
	 *     <li>Pre-agreed: crypto parameters prime 'N', 
	 *         generator 'g' and hash function 'H'.
	 * </ul>
	 * @param s      The password salt 's' as a hex string. Must not be {@code null}.
	 * @param B      The public server value 'B' as a hex string. Must not be {@code null}.
	 * @param k      k is H(N,g) with padding by the server. Must not be {@code null}.
	 * @return The client credentials consisting of the client public key 
	 *         'A' and the client evidence message 'M1'.
	 * @throws IllegalStateException If the method is invoked in a state 
	 *                               other than {@link State#STEP_1}.
	 * @throws SRP6Exception         If the public server value 'B' is invalid.
	 */
	SRP6JavascriptClientSession.prototype.step2 = function(s, BB) {
		"use strict";

		//console.log("SRP6JavascriptClientSession.prototype.step2");

		this.check(s, "s");
		//console.log("s:" + s);
		this.check(BB, "BB");
		//console.log("BB:" + BB);
		
		if( this.state !== this.STEP_1 ) {
			throw new Error("IllegalStateException not in state STEP_1");
		}
		
		// this is checked when passed to computeSessionKey
		this.B = this.fromHex(BB); 

		var ZERO = null;
		
		/* jshint ignore:start */
		ZERO = BigInteger.ZERO;
		/* jshint ignore:end */
		
		if (this.B.mod(this.N()).equals(ZERO)) {
			throw new Error("SRP6Exception bad server public value 'B' as B == 0 (mod N)");
		}
		
		//console.log("k:" + this.k);

		// this is checked when passed to computeSessionKey
		var x = this.generateX(s, this.I, this.P);
		//console.log("x:" + x);

		// blank the password as there is no reason to keep it around in memory.
		this.P = null;

		//console.log("N:"+this.toHex(this.N).toString(16));

		this.a = this.randomA(this.N);

		//console.log("a:" + this.toHex(this.a));

		this.A = this.g().modPow(this.a, this.N());
		//console.log("A:" + this.toHex(this.A));
		this.check(this.A, "A");
		
		this.u = this.computeU(this.A.toString(16),BB);
		//console.log("u:" + this.u);
		
		this.S = this.computeSessionKey(this.k, x, this.u, this.a, this.B);
		this.check(this.S, "S");
		
		//console.log("jsU:" + this.toHex(this.u));
		//console.log("jsS:" + this.toHex(this.S));
		
		var AA = this.toHex(this.A);
		
		this.M1str = this.H(AA+BB+this.toHex(this.S));
		this.check(this.M1str, "M1str");
		
		// server BigInteger math will trim leading zeros so we must do likewise to get a match
		while (this.M1str.substring(0, 1) === '0') { 
			//console.log("stripping leading zero from M1");
			this.M1str = this.M1str.substring(1);
		}
		
		//console.log("M1str:" + this.M1str);
		
		//console.log("js ABS:" + AA+BB+this.toHex(this.S));
		//console.log("js A:" + AA);
		//console.log("js B:" + BB);
		//console.log("js v:" + this.v);
		//console.log("js u:" + this.u);
		//console.log("js A:" + this.A);
		//console.log("js b:" + this.B);
		//console.log("js S:" + this.S);
		//console.log("js S:" + this.toHex(this.S));
		//console.log("js M1:" + this.M1str);
		
		this.state = this.STEP_2;
		return { A: AA, M1: this.M1str };
	};

	/**
	 * Receives the server evidence message 'M1'. The session is incremented
	 * to {@link State#STEP_3}.
	 *
	 * <p>Argument origin:
	 * <ul>
	 *     <li>From server: evidence message 'M2'.
	 * </ul>
	 * @param serverM2 The server evidence message 'M2' as string. Must not be {@code null}.
	 * @throws IllegalStateException If the method is invoked in a state 
	 *                               other than {@link State#STEP_2}.
	 * @throws SRP6Exception         If the session has timed out or the 
	 *                               server evidence message 'M2' is 
	 *                               invalid.
	 */
	SRP6JavascriptClientSession.prototype.step3 = function(M2) {
		"use strict";
		this.check(M2);
		//console.log("SRP6JavascriptClientSession.prototype.step3");

		// Check current state
		if (this.state !== this.STEP_2)
			throw new Error("IllegalStateException State violation: Session must be in STEP_2 state");

		//console.log("js A:" + this.toHex(this.A));
		//console.log("jsM1:" + this.M1str);
		//console.log("js S:" + this.toHex(this.S));
		
		var computedM2 = this.H(this.toHex(this.A)+this.M1str+this.toHex(this.S));
		
		//console.log("jsServerM2:" + M2);
		//console.log("jsClientM2:" + computedM2);
		
		// server BigInteger math will trim leading zeros so we must do likewise to get a match
		while (computedM2.substring(0, 1) === '0') { 
			//console.log("stripping leading zero from computedM2");
			computedM2 = computedM2.substring(1);
		}
		
		//console.log("server  M2:"+M2+"\ncomputedM2:"+computedM2);
		if ( ""+computedM2 !== ""+M2) {
			throw new Error("SRP6Exception Bad server credentials");
		}

		this.state = this.STEP_3;
		
		return true;
	};


	function SRP6JavascriptClientSessionSHA256(){ }

    SRP6JavascriptClientSessionSHA256.prototype = new SRP6JavascriptClientSession();

    SRP6JavascriptClientSessionSHA256.prototype.N = function() {
        return new BigInteger(N_base10, 10);
    }

    SRP6JavascriptClientSessionSHA256.prototype.g = function() {
        return new BigInteger(g_base10, 10);
    }

    SRP6JavascriptClientSessionSHA256.prototype.H = function (x) {
            return SHA256(x).toString().toLowerCase();
    }

    SRP6JavascriptClientSessionSHA256.prototype.k = new BigInteger(k_base16, 16);

  // return the new session class
  return SRP6JavascriptClientSessionSHA256;

}

module.exports = srpClientFactory
},{"crypto-js/sha256":"crypto-js/sha256","jsbn":"jsbn","random-strings":false}]},{},[])("SRP6JavascriptClientSessionSHA256")
});