
// RFC 5054 2048bit constants
var rfc5054 = {
    N_base10: "21766174458617435773191008891802753781907668374255538511144643224689886235383840957210909013086056401571399717235807266581649606472148410291413364152197364477180887395655483738115072677402235101762521901569820740293149529620419333266262073471054548368736039519702486226506248861060256971802984953561121442680157668000761429988222457090413873973970171927093992114751765168063614761119615476233422096442783117971236371647333871414335895773474667308967050807005509320424799678417036867928316761272274230314067548291133582479583061439577559347101961771406173684378522703483495337037655006751328447510550299250924469288819",
    g_base10: "2", 
    k_base16: "5b9e8ef059c6b32ea59fc1d322d37f04aa30bae5aa9003b8321e21ddb04e300"
}

// load Unit.js module
const test = require('unit.js');

// generate the client session class from the session factory
const SRP6JavascriptClientSession = require('../client.js')(rfc5054.N_base10, rfc5054.g_base10, rfc5054.k_base16);

// generate the client session class from the session factory
const SRP6JavascriptServerSession = require('../server.js')(rfc5054.N_base10, rfc5054.g_base10, rfc5054.k_base16);

// instantiate a client session
const client = new SRP6JavascriptClientSession();

// generate a random salt
const salt = client.generateRandomSalt(); 
const salt2 = client.generateRandomSalt(); 

// salts should differ
test.assert(salt !== salt2);

// and be a string
test.assert(typeof salt === 'string');

const username = "tom@arcot.com";
const password = "password1234";

const v = client.generateVerifier(salt, username, password);

//console.log("verifier: "+v);

const server = new SRP6JavascriptServerSession();

const randomB = server.randomB();

// normal login flow step1a client: browser starts with username and password given by user at the browser
client.step1(username, password);

// normal login flow step1b server: server starts with username from browser plus salt and verifier saved to database on user registration.
var B = server.step1(username, salt, v);

// normal login flow step2a client: server sends users salt from user registration and the server ephemeral number
var credentials = client.step2(salt, B);

// normal login flow step2b server: client sends its client ephemeral number and proof of a shared session key derived from both ephermal numbers and the password
var M2 = server.step2(credentials.A, credentials.M1);

// normal login flow step3 client: client verifies that the server shows proof of the shared session key which demonstrates that it knows actual verifier
client.step3(M2);

const clientSessionKey = client.getSessionKey();

console.log("clientSessionKey:"+clientSessionKey);

const serverSessionKey = server.getSessionKey();

console.log("serverSessionKey:"+serverSessionKey);

// the javascript client defaults to hashing the session key as that is additional protection of the password in case the key is accidentally exposed to an attacker.
test.assert.equal(clientSessionKey, serverSessionKey);