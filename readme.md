# Thinbus Javascript Secure Remote Password (SRP)
 
This package provides a Javascript [Secure Remote Password](http://srp.stanford.edu/) [SRP-6a](http://srp.stanford.edu/doc.html#papers) implementation for web browsers to perform a zero-knowledge proof-of-password to a web server. It contains both client and server JavaScript code. The public API exposes the client and server modules as two seperate factory closures: 

```JavaScript
// RFC 5054 2048bit constants
const rfc5054 = {
    N_base10: "21766174458617435773191008891802753781907668374255538511144643224689886235383840957210909013086056401571399717235807266581649606472148410291413364152197364477180887395655483738115072677402235101762521901569820740293149529620419333266262073471054548368736039519702486226506248861060256971802984953561121442680157668000761429988222457090413873973970171927093992114751765168063614761119615476233422096442783117971236371647333871414335895773474667308967050807005509320424799678417036867928316761272274230314067548291133582479583061439577559347101961771406173684378522703483495337037655006751328447510550299250924469288819",
    g_base10: "2", 
    k_base16: "5b9e8ef059c6b32ea59fc1d322d37f04aa30bae5aa9003b8321e21ddb04e300"
}

// generate the client session class from the client session factory using the safe prime constants
const SRP6JavascriptClientSession = require('../client.js')(rfc5054.N_base10, rfc5054.g_base10, rfc5054.k_base16);

// generate the server session class from the server session factory using the safe prime constants
const SRP6JavascriptServerSession = require('../server.js')(rfc5054.N_base10, rfc5054.g_base10, rfc5054.k_base16);
```

See `test\testrunner.js` and try out `npm test` for an example of seeing the client and server running through the full SRP6a protocol. 

The name Thinbus is a play on the name of the SRP Java library Nimbus. Thinbus is tested against Nimbus which gives higher confidence in its correctneess. Nimbus has had a lot of eye on it over the years and was carefully check against other Java SRP library code. It was also carefully checked against the example code provided by the inventor of SRP. 

Thinbus aims to support different server languages. By providing server versions tested against Thinbus JavaScript which is tested against many servers we can collectively all have greater confidence that the the server versions are correct: 

1. [thinbus-srp-js](https://bitbucket.org/simon_massey/thinbus-srp-js) The Java version which is compatible with the JavaScript version. This version is based on the JavaScript in that repo. At a future release I will delete the JavaScript from that repo and make this npm vesion the canonical one. 
1. [thinbus-srp-spring-demo](https://bitbucket.org/simon_massey/thinbus-srp-spring-demo/overview) A Spring MVC application which uses the Thinbus JavaScript library to create accounts and login users with Spring Security. 
2. [thinbus-php](https://bitbucket.org/simon_massey/thinbus-php/overview) Uses the Thinbus Javascript library to do SRP authentication to PHP server code. It also includes a PHP SRP client that you can use for server-to-server authentication or for generating temporary passwords. 
3. [pysrp_thinbus](https://github.com/SthPhoenix/pysrp_thinbus) is a fork of [pysrp](https://github.com/cocagne/pysrp) which is compatible with Thinbus so that you can use Python on the server. 

The spring demo app has been checked on IE8+, Edge, Chrome, FireFox, and Safari. 

## Using

For the definitions of the values discussed below please refer to the [SRP design page](http://srp.stanford.edu/design.html). The following sequence diagram shows how to register a user with an SRP salt and verifier as demonstrated by the Java based
[Thinbus Spring Demo](https://bitbucket.org/simon_massey/thinbus-srp-spring-demo/overview). *Note* I may one day do a Node.js demo but writing demos for every Thinbus server language would be time consuming. If you have time to write a high quality Node.js demo then I would be happy to collaborate. 

![Thinbus SRP Register Diagram](http://simonmassey.bitbucket.io/thinbus/register.png "Thinbus SRP Register Diagram")

In the diagram above the user is shown a standard registration form which includes both the username (e.g email) and password fields. 
They enter their email and password and click the register button. JavaScript then generates their random `salt` 
and uses the salt, email and password to generate an SRP `verififer`. Only the email, `salt` and the `verifier` are transmitted to 
the server and the generated values are saved into the database keyed by the email. 

**Note** Always use browser developer tools to inspect what you actually post to the server and only post the values shown 
in the sequence diagram as defined in the [SRP design page](http://srp.stanford.edu/design.html). It is a protocol 
violation and security bug if the raw password is accidently transmitted to the server even if it is ignored by the server. 

The following sequence diagram shows how to login a registered user. 

![Thinbus SRP Login Diagram](http://simonmassey.bitbucket.io/thinbus/login.png "Thinbus SRP Login Diagram")

In the diagram above the user is shown a standard login form. They enter their email and password and click the login button. 
JavaScript then makes an AJAX call using their email to load their `salt` and a one-time server challenge `B`. JavaScript creates 
a one-time client challenge `A` and uses all the information to compute a password proof `M1`. It then posts to the server 
the email, `A`, and `M1` as the users credentials. The server uses all the information to check the password proof. Only the email, 
client challenge `A` and the password proof `M1` are transmitted to the server. 

There is an optional step `client.step3(M2)` where `M2` is the server's proof of a shared session key to the client. 
You can return `M2` from the server to check the browser has a matching shared secret if you wish to use that for further cryptography. 
If your web application is distributed as a native mobile application such that the client is running trusted JavaScript 
then the `M2` proof is an additional check of the authenticity of the server; it confirms to trusted JavaScript that the 
server knows the verifier matching the user password. 

**Note** As per RFC 2945 the user ID (usually their email) is concatenated to their password when generating the verifier. This means that if a user changes *either* their email address or their password you need to generate a new verifier and replace the old one in the database. 

**Note** Always use browser developer tools to inspect what you actually post to the server and only post the values shown 
in the sequence diagram as defined in the [SRP design page](http://srp.stanford.edu/design.html). It is a protocol violation 
and a security bug to accidently transmit to the server anything else even if it is ignored by the server. 

**Note** the JavaScript client object (typically `SRP6JavascriptClientSessionSHA256`) must be destroyed after each login attempt. 
The object is intended to be a temporary object and should be deleted to erase all traces of the password. You must also destroy 
the password form field the user typed their password into. The normal way to achieve destroying any traces of the password is to unload 
the login page after every login attempt. This is trivial to do by reloading the login page upon authentication failure or by loading a main 
landing page upon successful login. 

**Note** that the server has to remember the private ephemeral key `b` that matches the public ephemeral key `B` sent as a one-time server challenge to the user. 
This requires storing `b` either in the database, the server session or a server cache for the short duration of the login protocol. 
You cannot pass this value back to the server from the client without compromising security. 
The server should not use any values transmitted from the client other than those shown in the sequence diagram and 
named in the [SRP design page](http://srp.stanford.edu/design.html).

**Note** if you want to use the shared session key for follow-on cryptography you should use `client.getSessionKey()` to retrieved the
session key from the thinbus object and destroy the thinbus object as discussed above. The typical way to do this is to put the session key 
into browser local session storage. Then you can unload the login page then load a main landing page that collects the session key 
from storage.  

**Note** You don't have to use AJAX for SRP. It is used in the examples to hide the fact that with SRP you need an additional round-trip to the server to generate a challenge using the users verifier. You can avoid using AJAX by splitting the username and password fields across two pages. The first page can send the username and the next page can have a hidden fields containing the user specific salt and the server challenge `B`. This simply replaces the AJAX trip with an explicit page load. 

## Creating A Custom Large Safe Prime

The Java version of Thinbus has a command line tool and instructions how to use openssl to create safe prime see https://bitbucket.org/simon_massey/thinbus-srp-js/overview

## Recommendations 

* Use Thinbus SRP over HTTPS. Configure your webserver to mark session cookies as secure to prevent accidental use of HTTP.  Configure [HSTS](https://en.wikipedia.org/wiki/HTTP_Strict_Transport_Security#HSTS_mechanism_overview) to force HTTPS with your service. If your customers use a company supplied computer going via a corporate web proxy then HTTPS may be [decrypted and monitored](http://security.stackexchange.com/questions/63304/how-can-my-employer-be-a-man-in-the-middle-when-i-connect-to-gmail). HTTPS may be compromised due to things like [bad certs in the wild](http://nakedsecurity.sophos.com/2013/12/09/serious-security-google-finds-fake-but-trusted-ssl-certificates-for-its-domains-made-in-france/). HTTPS may be compromised by bugs or misconfigurations such as [Heartbleed](http://en.wikipedia.org/wiki/Heartbleed). HTTPS alone cannot protected against leaking passwords into error messages in your webserver logs. SRP over HTTPS is much safer than either used alone. 
* Add a javascript password strength meter and only allow users to register a verifier for a strong password. The best cryptography in the world won't protect your users if they use "password" as their password.
* Use a custom large safe prime number `N` using the instructions above. **Tip:** Check on the browsers and hardware you are targeting that the math runs fast enough for a good user experience for your chosen bit length. 
* Make the salt column in the database `not null` and add a uniqueness constraint.  
* Use symmetric AES encryption with a key only visible at the webserver to encrypt the verifier `v` value within the database. This protects against off-site database backups being used in an offline dictionary attack against `v`. 
* You can prevent privileged accounts from logging in using legacy browsers by checking `random16byteHex.isWebCryptoAPI()` when fetching the user salt; simply abort the protocol for privileged accounts when secure random numbers are not available at the browser. If you allow the use of browsers that don't have the `WebCryptoAPI` secure random number APIs then the fallback random generator hashes `window.cookie` as part of the generator seed. Consider adding a secure random cookie to help seed the fallback generator; see PRNG.md for more info.
* Don't include any JS files [or any CSS files](http://stackoverflow.com/a/3613162/329496) from external sites onto your login page. 
* Count the number of failed password attempts and present the user with a CAPTCHA after a dozen attempts. This slows down scripted online dictionary attacks. Consider suspending the account (possibly temporarily) after a large number of contiguous failed attempts to defeat someone carefully researching a user then trying to guess their likely password. 

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

