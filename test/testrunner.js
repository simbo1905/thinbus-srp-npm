
// RFC 5054 2048bit constants
var rfc5054 = {
    N_base10: "21766174458617435773191008891802753781907668374255538511144643224689886235383840957210909013086056401571399717235807266581649606472148410291413364152197364477180887395655483738115072677402235101762521901569820740293149529620419333266262073471054548368736039519702486226506248861060256971802984953561121442680157668000761429988222457090413873973970171927093992114751765168063614761119615476233422096442783117971236371647333871414335895773474667308967050807005509320424799678417036867928316761272274230314067548291133582479583061439577559347101961771406173684378522703483495337037655006751328447510550299250924469288819",
    g_base10: "2", 
    k_base16: "5b9e8ef059c6b32ea59fc1d322d37f04aa30bae5aa9003b8321e21ddb04e300"
}

// generate the client session class from the client session factory closure
const SRP6JavascriptClientSession = require('thinbus-srp/client.js')(rfc5054.N_base10, rfc5054.g_base10, rfc5054.k_base16);

// generate the server session class from the server session factory closure
const SRP6JavascriptServerSession = require('thinbus-srp/server.js')(rfc5054.N_base10, rfc5054.g_base10, rfc5054.k_base16);

// ----------------------------------------------------------------------------
// CLIENT REGISTRATION FLOW 
// https://simonmassey.bitbucket.io/thinbus/register.png
// Note as per RFC 2945 the user ID (usually their email) is concatenated to 
// their password when generating the verifier. This means that if a user 
// changes either their email address or their password you need to generate 
// a new verifier and replace the old one in the database.
//                ┌──────────────┐                       ┌──────────────┐
//                │   Browser    │                       │  Web Server  │
//                └──────────────┘                       └──────┬───────┘
//                        │
//                                                              │
//     .─.              ┌─┴─┐        GET /register.html       ┌───┐
//    (   )             │   │◀────────────────────────────────│   │
//     `┬'              │   │                                 └───┘
//  ────┼────           │   │                                   │
//      │  email,passwd │   │
//     ┌┴┐ ─────────────▶   ├──┐                                │
//     │ │              │   │  │         generateSalt()
//     │ │              │   │  │ generateVerifier(email,passwd) │
//   ──┘ └──            │   │◀─┘
//                      │   │                                   │
//                      │   │
//                      │   │                                   │
//                      │   │   POST {email,salt,verifier}    ┌───┐
//                      │   ├────────────────────────────────▶│   │
//                      │   │                                 └───┘
//                      └───┘                                   │
//                        │

// instantiate a client session
const client = new SRP6JavascriptClientSession();

// generate a random salt that should be stored with the user verifier
const salt = client.generateRandomSalt(); 

const username = "tom@arcot.com";
const password = "password1234";

// generate the users password verifier that should be stored with their salt. 
const verifier = client.generateVerifier(salt, username, password);

// ----------------------------------------------------------------------------
// CLIENT LOGIN FLOW  
// https://simonmassey.bitbucket.io/thinbus/login.png
//                ┌──────────────┐                       ┌──────────────┐
//                │   Browser    │                       │  Web Server  │
//                └──────────────┘                       └──────────────┘
//                        │                                     │
//    .─.               ┌───┐         GET /login.html         ┌───┐
//   (   ) email,passwd │   │◀────────────────────────────────│   │
//    `┬' ─────────────▶│   │                                 └───┘
// ────┼────            │   │     AJAX /challenge {email}       │
//     │                │   ├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ▶───┐                .───────────.
//    ┌┴┐               │   │                               ┌─┤   │◀──────────────(  Database   )
//    │ │               │   │    step1(email,salt,verifier) │ │   │{salt,verifier}(`───────────')
//    │ │               │   │                               │ │   │               (`───────────')
//  ──┘ └──             │   │                               └▶│   │               (`───────────')
//                      │   │            {salt,B}             │   │                `───────────'
//                    ┌─┤   │◀─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤   │
// step1(email,passwd)│ │   │                                 │   │      ┌───────────────────┐
//       step2(salt,B)│ │   │     POST /auth {email,A,M1}     │   ├ ─ ─ ─│ This timeline is  │
//                    └▶│   ├────────────────────────────────▶│   │      │ the continuity of │
//                      └───┘                               ┌─┤   │      │  "b" the server   │
//                        │                      step2(A,M1)│ │   │      │ private ephemeral │
//                                                          │ │   │      │value. This can be │
//                      ┌─┴─┐             {M2}              └▶│   │      │held in the main DB│
//             step3(M2)│   │◀────────────────────────────────┤   │      │or a cache for the │
//                      └─┬─┘     REDIRECT /home.html OR      │   │      │ short duration of │
//                                     /login.html            │   │      │the login protocol.│
//                        │                                   │   │      └───────────────────┘
//                                                            └───┘
//                        │                                     │
//                        ▼                                     ▼

// normal login flow step1a client: browser starts with the username and password. 
client.step1(username, password);

// normal login flow step1b server: server starts with username from browser plus salt and verifier that was saved to database on user registration. note the username isn't part of the server crypto it is useful for server logging or debugging. the server returns both the salt and a unique challenge `B` called the server public ephemeral number. 
const server = new SRP6JavascriptServerSession();
var B = server.step1(username, salt, verifier);

// normal login flow step2a client: client creates a password proof from the salt, challenge and the username and password provided at step1. this generates `A` the cliehnt public ephemeral number and `M1` the hash of `M1` of a shared session key derived from both `A` and `B`. You can post `A` and `M1` to the server (e.g. seperated by a colon) instead of a password. 
var credentials = client.step2(salt, B);

// normal login flow step2b server: the server takes `A`, internally computes `M1` based on the verifier, and checks that its `M1` matche the value sent from the client. If not it throws an exception. If the `M1` match then the password proof is valid. It then generates `M2` which is a proof that it has the verifier. 
var M2 = server.step2(credentials.A, credentials.M1);

// normal login flow step3 client: client verifies that the server shows proof of the shared session key which demonstrates that it knows actual verifier
client.step3(M2);

// we can now use the shared session key that hasn't crossed the network for follow on cryptography (such as JWT token signing or whatever)

const clientSessionKey = client.getSessionKey();

console.log("clientSessionKey:"+clientSessionKey);

const serverSessionKey = server.getSessionKey();

console.log("serverSessionKey:"+serverSessionKey);

// load Unit.js module
const test = require('unit.js');

// the javascript client defaults to hashing the session key as that is additional protection of the password in case the key is accidentally exposed to an attacker.
test.assert.equal(clientSessionKey, serverSessionKey);               
