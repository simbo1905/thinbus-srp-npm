# Thinbus Javascript Secure Remote Password (SRP)

[![Build Status](https://travis-ci.org/simbo1905/thinbus-srp-npm.svg?branch=master)](https://travis-ci.org/simbo1905/thinbus-srp-npm)
[![npm version](https://badge.fury.io/js/thinbus-srp.svg)](https://badge.fury.io/js/thinbus-srp)
 
This package provides a Javascript [Secure Remote Password](http://srp.stanford.edu/) [SRP-6a](http://srp.stanford.edu/doc.html#papers) implementation for web browsers to perform a zero-knowledge proof-of-password to a web server. There is a demo application [thinbus-srp-npm-tester](https://github.com/simbo1905/thinbus-srp-npm-tester) that uses this npm library.

This library contains both client and server JavaScript code. The public API exposes the client and server modules as two seperate factory closures: 

```JavaScript
// RFC 5054 2048bit constants
const rfc5054 = {
    N_base10: "21766174458617435773191008891802753781907668374255538511144643224689886235383840957210909013086056401571399717235807266581649606472148410291413364152197364477180887395655483738115072677402235101762521901569820740293149529620419333266262073471054548368736039519702486226506248861060256971802984953561121442680157668000761429988222457090413873973970171927093992114751765168063614761119615476233422096442783117971236371647333871414335895773474667308967050807005509320424799678417036867928316761272274230314067548291133582479583061439577559347101961771406173684378522703483495337037655006751328447510550299250924469288819",
    g_base10: "2", 
    k_base16: "5b9e8ef059c6b32ea59fc1d322d37f04aa30bae5aa9003b8321e21ddb04e300"
}

// generate the client session class from the client session factory closure
const SRP6JavascriptClientSession = require('thinbus-srp/client.js')(rfc5054.N_base10, rfc5054.g_base10, rfc5054.k_base16);

// generate the server session class from the server session factory closure
const SRP6JavascriptServerSession = require('thinbus-srp/server.js')(rfc5054.N_base10, rfc5054.g_base10, rfc5054.k_base16);

// generate a light weight browser compatible client session class from the browser session factory closure
const SRP6JavascriptServerSession = require('thinbus-srp/browser.js')(rfc5054.N_base10, rfc5054.g_base10, rfc5054.k_base16);
```

See `test\testrunner.js` and try out `npm test` for an example of seeing the client and server running through the full SRP6a protocol. 

In order to have a compatible and small (40K) browser version of the client this package also ships with the original [thinbus-srp-js](https://bitbucket.org/simon_massey/thinbus-srp-js) JavaScript code which `npm run-script build` converts into a browserify module within the file `browser.js`. See [this article](https://dontkry.com/posts/code/browserify-and-the-universal-module-definition.html) as an introduction to browserify. 

## Using

For the definitions of the values discussed below please refer to the [SRP design page](http://srp.stanford.edu/design.html). The following sequence diagram shows how to register a user with an SRP salt and verifier as demonstrated by the [Thinbus Demo Application](https://github.com/simbo1905/thinbus-srp-npm-tester). 

![Thinbus SRP Register Diagram](http://simonmassey.bitbucket.io/thinbus/register.png "Thinbus SRP Register Diagram")

In the diagram above the user is shown a standard registration form which includes both the username (e.g email) and password fields. 
They enter their email and password and click the register button. JavaScript then generates their random `salt` 
and with the salt, email and password generates an SRP `verififer`. Only the email, `salt` and the `verifier` are transmitted to 
the server and the generated values are saved into the database keyed by the email. 

**Note** Always use browser developer tools to inspect what you actually post to the server and only post the values shown 
in the sequence diagram as defined in the [SRP design page](http://srp.stanford.edu/design.html). It is a protocol 
violation and security bug if the raw password is accidently transmitted to the server even if it is ignored by the server. It is also a protocol violation and a security bug if you accidently transmit the verifier to the browser. 

The following sequence diagram shows how to login a registered user. 

![Thinbus SRP Login Diagram](http://simonmassey.bitbucket.io/thinbus/login-cache.png "Thinbus SRP Login Diagram")

In the diagram above the user is shown a standard login form. They enter their email and password and click the login button. 
JavaScript then makes an AJAX call using their email to load their `salt` and a one-time server challenge `B`. Then client creates 
a one-time client challenge `A` and uses all the information to compute a password proof `M1`. It then posts to the server 
the email, `A`, and `M1` as the users credentials. The server uses all the information (including a private part of the challenge to check the password proof). Only the email, 
client challenge `A` and the password proof `M1` are transmitted to the server. Note that the server needs to hold the private challenge state `b` that corresponds to the public challenge `B` sent to the client. It can store this private state in a time limited cache. 

There is an optional step `client.step3(M2)` where `M2` is the server's proof of a shared session key to the client. 
You can return `M2` from the server to check the browser has a matching shared secret if you wish to use that for further cryptography. If your web application is distributed as a native mobile application such that the client is running trusted JavaScript then the `M2` proof is an additional check of the authenticity of the server; it confirms to trusted client code that the server knows the verifier matching the user password. This check is also proof that the client and server both generated the same shared session key `S`. You can use `getSessionKey()` on the client and server to get `H(S)` a 256bit shared key that has not been transmitted over the network. This can be used for follow on cryptography such as [http-hmac-spec](https://github.com/acquia/http-hmac-spec/blob/2.0/README.md#spec) signing of restful API traffic.

**Note** that you don't have to use AJAX for SRP. It is used in the examples to hide the fact that with SRP you need an additional round-trip to the server to generate a challenge using the users verifier. You can avoid using AJAX by splitting the username and password fields across two pages. The first page can send the username and the next page can have a hidden fields containing the user specific salt and the server challenge `B`. This simply replaces the AJAX trip with an explicit page load. 

**Note** as per RFC 2945 the user ID (usually their email) is concatenated to their password when generating the verifier. This means that if a user changes *either* their email address or their password you need to generate a new verifier and replace the old one in the database. 

**Note** always use browser developer tools to inspect what you actually post to the server and only post the values shown 
in the sequence diagram as defined in the [SRP design page](http://srp.stanford.edu/design.html). It is a protocol violation 
and a security bug to accidently transmit to the server anything else even if it is ignored by the server. 

**Note** the JavaScript client object (typically `SRP6JavascriptClientSessionSHA256`) must be destroyed after each login attempt. 
The object is intended to be a temporary object and should be deleted to erase all traces of the password. You must also destroy 
the password form field the user typed their password into. The normal way to achieve destroying any traces of the password is to unload 
the login page after every login attempt. This is trivial to do by reloading the login page upon authentication failure or by loading a main landing page upon successful login. 

**Note** that the server has to remember the private ephemeral key `b` that matches the public ephemeral key `B` sent as a one-time server challenge to the user. 
This requires storing `b` either in the database, the server session or a server cache for the short duration of the login protocol. 
You cannot pass this value back to the server from the client without compromising security. 
The server should not use any values transmitted from the client other than those shown in the sequence diagram and 
named in the [SRP design page](http://srp.stanford.edu/design.html).

**Note** if you want to use the shared session key for follow-on cryptography you should use `client.getSessionKey()` to retrieved the
session key from the thinbus object and destroy the thinbus object as discussed above. The typical way to do this is to put the session key into browser local session storage. Then you can unload the login page then load a main landing page that collects the session key 
from storage. You can for example use the shared key for [http-hmac-spec](https://github.com/acquia/http-hmac-spec/blob/2.0/README.md#spec) signing for restful API traffic.

## Creating A Custom Large Safe Prime

The Java version of Thinbus has a command line tool and instructions how to use openssl to create safe prime see https://bitbucket.org/simon_massey/thinbus-srp-js/overview

## Recommendations 

* Use Thinbus SRP over HTTPS. Configure your webserver to mark session cookies as secure to prevent accidental use of HTTP.  Configure [HSTS](https://en.wikipedia.org/wiki/HTTP_Strict_Transport_Security#HSTS_mechanism_overview) to force HTTPS with your service. If your customers use a company supplied computer going via a corporate web proxy then HTTPS may be [decrypted and monitored](http://security.stackexchange.com/questions/63304/how-can-my-employer-be-a-man-in-the-middle-when-i-connect-to-gmail). HTTPS may be compromised due to things like [bad certs in the wild](http://nakedsecurity.sophos.com/2013/12/09/serious-security-google-finds-fake-but-trusted-ssl-certificates-for-its-domains-made-in-france/). HTTPS may be compromised by bugs or misconfigurations such as [Heartbleed](http://en.wikipedia.org/wiki/Heartbleed). HTTPS alone cannot protected against leaking passwords into error messages in your webserver logs. SRP over HTTPS is much safer than either used alone. 
* Add a javascript password strength meter and only allow users to register a verifier for a strong password. The best cryptography in the world won't protect your users if they use "password" as their password.
* Check that the user isn't using a password that is in the [HiBP](https://haveibeenpwned.com/Passwords) database. HiBP lets you query using the first few characters of the hash of the users passwords. You can check for an exact match of the hash in the results and refuse to let the user use a password that is in the public database of leaked passwords.
* Use a custom large safe prime number `N` using the instructions above. **Tip:** Check on the browsers and hardware you are targeting that the math runs fast enough for a good user experience for your chosen bit length. 
* Make the salt column in the database `not null` and add a uniqueness constraint.  
* Use symmetric AES encryption with a key only visible at the webserver to encrypt the verifier `v` value within the database. This protects against off-site database backups being used in an offline dictionary attack against `v`. 
* You can prevent privileged accounts from logging in using legacy browsers by checking `random16byteHex.isWebCryptoAPI()` when fetching the user salt; simply abort the protocol for privileged accounts when secure random numbers are not available at the browser. If you allow the use of browsers that don't have the `WebCryptoAPI` secure random number APIs then the fallback random generator hashes `window.cookie` as part of the generator seed. Consider adding a secure random cookie to help seed the fallback generator.
* Don't include any JS files [or any CSS files](http://stackoverflow.com/a/3613162/329496) from external sites onto your login page. 
* Count the number of failed password attempts and present the user with a CAPTCHA after a dozen attempts. This slows down scripted online dictionary attacks. Consider suspending the account (possibly temporarily) after a large number of contiguous failed attempts to defeat someone carefully researching a user then trying to guess their likely password. 

## Miscellaneous

The name Thinbus is a play on the name of the SRP Java library Nimbus. Thinbus NPM (this repo) is tested against Thinbus JavaSciprt taken from the Java version, which in turn is testing against Nimbus, which gives higher confidence in its correctneess. Nimbus has had a lot of eyes look at it over the years and was carefully check against other Java SRP library code and the example code provided by the inventor of SRP. 

Thinbus aims to support different server languages. By providing server versions tested against Thinbus JavaScript which is tested against many servers we can collectively all have greater confidence that all the server versions are correct: 

1. [thinbus-srp-js](https://bitbucket.org/simon_massey/thinbus-srp-js) The Java version which is compatible with the JavaScript version. At a future release I may delete the JavaScript from that repo and make this npm vesion the canonical one. It also includes a Java SRP client that you can use for server-to-server authentication or to generate temporary passwords to email to users. 
1. [thinbus-srp-spring-demo](https://bitbucket.org/simon_massey/thinbus-srp-spring-demo/overview) A Spring MVC application which uses the Thinbus JavaScript library to create accounts and login users with Spring Security. This has both authentication and authorisation.
1. [thinbus-php](https://bitbucket.org/simon_massey/thinbus-php/overview) Uses the Thinbus Javascript library to do SRP authentication to PHP server code. It also includes a PHP SRP client that you can use for server-to-server authentication or to generating temporary passwords to email to users. 
1. [pysrp_thinbus](https://github.com/SthPhoenix/pysrp_thinbus) is a fork of [pysrp](https://github.com/cocagne/pysrp) which is compatible with Thinbus so that you can use Python on the server. 

## License

```
   Copyright 2014-2017 Simon Massey

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```   

