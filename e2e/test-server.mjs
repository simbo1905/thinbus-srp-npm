import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Inject crypto into globalThis before importing modules
globalThis.nodeCrypto = { createHash };

// Import our server module
const serverModule = await import('../server.mjs');

// RFC 5054 2048bit constants
const rfc5054 = {
    N_base10: "21766174458617435773191008891802753781907668374255538511144643224689886235383840957210909013086056401571399717235807266581649606472148410291413364152197364477180887395655483738115072677402235101762521901569820740293149529620419333266262073471054548368736039519702486226506248861060256971802984953561121442680157668000761429988222457090413873973970171927093992114751765168063614761119615476233422096442783117971236371647333871414335895773474667308967050807005509320424799678417036867928316761272274230314067548291133582479583061439577559347101961771406173684378522703483495337037655006751328447510550299250924469288819",
    g_base10: "2", 
    k_base16: "5b9e8ef059c6b32ea59fc1d322d37f04aa30bae5aa9003b8321e21ddb04e300"
};

// Create SRP server session factory
const SRP6JavascriptServerSession = serverModule.default(rfc5054.N_base10, rfc5054.g_base10, rfc5054.k_base16);

// Test user data - pre-computed using client.generateVerifier()
const testUsers = {
    testuser: {
        salt: "beaff5190c8691567dc8a3abf2fef9fccb9fcef9c5450f32cb479c355fd31194",
        verifier: "9398e888e2ac20fca8d2cd5ad5e8fe95047ca0116409cb0f98cfd39dd6410cc9159ce23dcc70c6f841bee8cb1b4059450816583f26d9751971b789c0179fb719657c36c6a64ba4131fea53687b1fcdd27c4905893097fc8d6f8b23edd28f44231d872a5d0855132e31b5d6e8eaef160865a5e4506c2e897da3aa11fbe562c053c2caa182659ad9bb6c158a2c0b1a7d5443094d95dbccb4b222db5e96c659e2b8c3c87d72ba076044e8b6aaf10eea507cbd25be7e1d80ede5c6d33ea6bed49d9f5142014c83ed01d28ad20235eaaf4570a7ed39e6bb6e2532c05221bd924f222578233c3d33d97cfdd98324acc14acfcb70a3c280b29702b4d2effca947d415e0"
    }
};

// Active sessions storage
const activeSessions = new Map();

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Serve client.mjs from parent directory
app.get('/client.mjs', (req, res) => {
    res.sendFile(join(__dirname, '..', 'client.mjs'));
});

// Serve dist directory for legacy bundles
app.use('/dist', express.static(join(__dirname, '..', 'dist')));

// Logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('  Body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// POST /api/challenge - Initialize authentication challenge
app.post('/api/challenge', (req, res) => {
    const { username } = req.body;
    
    if (!username) {
        return res.status(400).json({ error: 'Username required' });
    }
    
    const user = testUsers[username];
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    try {
        // Create new server session
        const serverSession = new SRP6JavascriptServerSession();
        const B = serverSession.step1(username, user.salt, user.verifier);
        
        // Generate session ID and store server state
        const sessionId = randomUUID();
        const privateState = serverSession.toPrivateStoreState();
        activeSessions.set(sessionId, {
            serverSession,
            privateState,
            username,
            timestamp: Date.now()
        });
        
        console.log(`  Challenge created for ${username}, sessionId: ${sessionId}`);
        console.log(`  B: ${B.substring(0, 16)}...`);
        
        res.json({
            salt: user.salt,
            B: B,
            sessionId: sessionId
        });
    } catch (error) {
        console.error('Challenge error:', error);
        res.status(500).json({ error: 'Server error during challenge creation' });
    }
});

// POST /api/authenticate - Verify client proof and complete authentication
app.post('/api/authenticate', (req, res) => {
    const { sessionId, A, M1 } = req.body;
    
    if (!sessionId || !A || !M1) {
        return res.status(400).json({ error: 'sessionId, A, and M1 required' });
    }
    
    const sessionData = activeSessions.get(sessionId);
    if (!sessionData) {
        return res.status(404).json({ error: 'Invalid or expired session' });
    }
    
    try {
        // Restore server session from stored state
        const server = new SRP6JavascriptServerSession();
        server.fromPrivateStoreState(sessionData.privateState);
        
        // Verify client proof
        const M2 = server.step2(A, M1);
        
        // Update session with successful authentication
        sessionData.authenticated = true;
        sessionData.sessionKey = server.getSessionKey();
        sessionData.timestamp = Date.now();
        
        console.log(`  Authentication successful for ${sessionData.username}`);
        console.log(`  M2: ${M2.substring(0, 16)}...`);
        console.log(`  Session key: ${sessionData.sessionKey.substring(0, 16)}...`);
        
        res.json({
            M2: M2,
            success: true
        });
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({ 
            error: 'Authentication failed',
            success: false 
        });
    }
});

// GET /api/session - Check session validity
app.get('/api/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    const sessionData = activeSessions.get(sessionId);
    if (!sessionData || !sessionData.authenticated) {
        return res.json({ valid: false });
    }
    
    // Check if session is expired (30 minutes)
    const isExpired = (Date.now() - sessionData.timestamp) > (30 * 60 * 1000);
    if (isExpired) {
        activeSessions.delete(sessionId);
        return res.json({ valid: false });
    }
    
    res.json({
        valid: true,
        username: sessionData.username,
        sessionKey: sessionData.sessionKey.substring(0, 32) + '...' // Truncated for security
    });
});

// DELETE /api/session - Logout/clear session
app.delete('/api/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    const deleted = activeSessions.delete(sessionId);
    if (deleted) {
        console.log(`  Session ${sessionId} deleted`);
    }
    
    res.json({ success: deleted });
});

// Development endpoint to generate test user verifier
app.post('/api/dev/generate-verifier', async (req, res) => {
    const { username, password, salt } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    try {
        // Import client module to generate verifier
        const clientModule = await import('../client.mjs');
        const SRP6JavascriptClientSession = clientModule.default(rfc5054.N_base10, rfc5054.g_base10, rfc5054.k_base16);
        
        const client = new SRP6JavascriptClientSession();
        const useSalt = salt || client.generateRandomSalt();
        const verifier = client.generateVerifier(useSalt, username, password);
        
        console.log(`  Generated verifier for ${username}`);
        
        res.json({
            username,
            salt: useSalt,
            verifier
        });
    } catch (error) {
        console.error('Verifier generation error:', error);
        res.status(500).json({ error: 'Failed to generate verifier' });
    }
});

// Error handling
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    console.log(`🚀 SRP E2E Test Server running on http://localhost:${PORT}`);
    console.log(`📊 Test user: testuser / password1234`);
    console.log(`🔧 Development verifier generator: POST /api/dev/generate-verifier`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down server...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

export { server, activeSessions };