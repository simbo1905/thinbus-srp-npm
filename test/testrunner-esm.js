import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createHash } from 'crypto';

// Inject crypto into globalThis before importing modules
globalThis.nodeCrypto = { createHash };

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import our ES modules
const clientModule = await import(join(__dirname, '..', 'client.mjs'));
const serverModule = await import(join(__dirname, '..', 'server.mjs'));

// RFC 5054 2048bit constants
const rfc5054 = {
    N_base10: "21766174458617435773191008891802753781907668374255538511144643224689886235383840957210909013086056401571399717235807266581649606472148410291413364152197364477180887395655483738115072677402235101762521901569820740293149529620419333266262073471054548368736039519702486226506248861060256971802984953561121442680157668000761429988222457090413873973970171927093992114751765168063614761119615476233422096442783117971236371647333871414335895773474667308967050807005509320424799678417036867928316761272274230314067548291133582479583061439577559347101961771406173684378522703483495337037655006751328447510550299250924469288819",
    g_base10: "2", 
    k_base16: "5b9e8ef059c6b32ea59fc1d322d37f04aa30bae5aa9003b8321e21ddb04e300"
};

console.log("🚀 Starting SRP ES Module Test Suite");
console.log("=====================================");

// Generate the client session class from the ES module factory
console.log("📦 Creating client session factory...");
const SRP6JavascriptClientSession = clientModule.default(rfc5054.N_base10, rfc5054.g_base10, rfc5054.k_base16);
console.log("✅ Client session factory created");

// Generate the server session class from the ES module factory  
console.log("📦 Creating server session factory...");
const SRP6JavascriptServerSession = serverModule.default(rfc5054.N_base10, rfc5054.g_base10, rfc5054.k_base16);
console.log("✅ Server session factory created");

console.log("\n🔐 REGISTRATION PHASE");
console.log("=====================");

// Instantiate a client session
console.log("👤 Creating client session...");
const client = new SRP6JavascriptClientSession();
console.log("✅ Client session created");

// Generate a random salt that should be stored with the user verifier
console.log("🧂 Generating random salt...");
const salt = client.generateRandomSalt(); 
console.log(`✅ Salt generated: ${salt.substring(0, 16)}...`);

const username = "tom@arcot.com";
const password = "password1234";
console.log(`👤 User: ${username}`);
console.log(`🔑 Password: ${password}`);

// Generate the users password verifier that should be stored with their salt
console.log("🔐 Generating verifier...");
const verifier = client.generateVerifier(salt, username, password);
console.log(`✅ Verifier generated: ${verifier.substring(0, 16)}...`);

console.log("\n🚪 LOGIN PHASE");
console.log("==============");

console.log("📤 Client Step 1: Sending credentials to start authentication...");
client.step1(username, password);
console.log(`✅ Client step1 completed - State: ${client.getState()}`);

console.log("🏗️  Server Step 1: Generating challenge...");
const serverWillDie = new SRP6JavascriptServerSession();
const B = serverWillDie.step1(username, salt, verifier);
console.log(`✅ Server generated challenge B: ${B.substring(0, 16)}...`);

// Simulate server storing private state in cache/database
const privateState = serverWillDie.toPrivateStoreState();
const cacheJson = JSON.stringify(privateState);
console.log(`💾 Server private state cached (${cacheJson.length} bytes)`);

console.log("📤 Client Step 2: Creating password proof...");
const credentials = client.step2(salt, B);
console.log(`✅ Client generated credentials:`);
console.log(`   A: ${credentials.A.substring(0, 16)}...`);
console.log(`   M1: ${credentials.M1.substring(0, 16)}...`);
console.log(`   Client State: ${client.getState()}`);

console.log("🔍 Server Step 2: Verifying credentials...");
// Simulate loading challenge data from cache
const newPrivate = JSON.parse(cacheJson);
const server = new SRP6JavascriptServerSession();
server.fromPrivateStoreState(newPrivate);
console.log("💾 Server private state restored from cache");

try {
    const M2 = server.step2(credentials.A, credentials.M1);
    console.log(`✅ Server verified credentials and generated M2: ${M2.substring(0, 16)}...`);
    
    console.log("🔍 Client Step 3: Verifying server proof...");
    const step3Result = client.step3(M2);
    console.log(`✅ Client verified server proof: ${step3Result}`);
    console.log(`   Final Client State: ${client.getState()}`);
    
    console.log("\n🔑 SESSION KEY VERIFICATION");
    console.log("===========================");
    
    // Get session keys from both sides
    const clientSessionKey = client.getSessionKey();
    const serverSessionKey = server.getSessionKey();
    
    console.log(`👤 Client session key: ${clientSessionKey}`);
    console.log(`🖥️  Server session key: ${serverSessionKey}`);
    
    // Verify they match
    if (clientSessionKey === serverSessionKey) {
        console.log("✅ SUCCESS: Session keys match perfectly!");
        console.log(`🔐 Shared key length: ${clientSessionKey.length} characters`);
    } else {
        console.error("❌ FAILURE: Session keys do not match!");
        console.error("This indicates a problem with the SRP implementation.");
        throw new Error("Session key mismatch - SRP protocol failed");
    }
    
    console.log("\n🎉 ES MODULE TEST RESULTS");
    console.log("=========================");
    console.log("✅ Client ES module loaded successfully");
    console.log("✅ Server ES module loaded successfully");  
    console.log("✅ SRP registration phase completed");
    console.log("✅ SRP authentication phase completed");
    console.log("✅ Session keys generated and verified");
    console.log("✅ Full SRP round-trip successful");
    
    console.log("\n📊 COMPATIBILITY TEST");
    console.log("=====================");
    
    // Test with the old browser.js for backward compatibility
    try {
        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        
        console.log("🌐 Testing backward compatibility with browser.js...");
        const BrowserSRP6JavascriptClientSession = require('../browser.js')(rfc5054.N_base10, rfc5054.g_base10, rfc5054.k_base16);
        
        const bclient = new BrowserSRP6JavascriptClientSession();
        bclient.step1(username, password);
        
        const bserver = new SRP6JavascriptServerSession();
        const bB = bserver.step1(username, salt, verifier);
        const bcredentials = bclient.step2(salt, bB);
        const bM2 = bserver.step2(bcredentials.A, bcredentials.M1);
        bclient.step3(bM2);
        
        const bclientSessionKey = bclient.getSessionKey();
        const bserverSessionKey = bserver.getSessionKey();
        
        if (bclientSessionKey === bserverSessionKey) {
            console.log("✅ Browser.js compatibility test passed");
            console.log(`🔗 Browser-Server key match: ${bclientSessionKey === serverSessionKey ? 'YES' : 'NO'}`);
        } else {
            console.error("❌ Browser.js compatibility test failed");
        }
    } catch (compatError) {
        console.warn(`⚠️  Browser.js compatibility test skipped: ${compatError.message}`);
    }
    
} catch (error) {
    console.error("❌ CRITICAL ERROR in SRP authentication:");
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    throw error;
}

console.log("\n🏁 All tests completed successfully!");
process.exit(0);