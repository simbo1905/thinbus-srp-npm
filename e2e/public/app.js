// SPDX-FileCopyrightText: 2014-2025 Simon Massey
// SPDX-License-Identifier: Apache-2.0
// SRP E2E Test Client Application
// Uses client.mjs ES module for browser-based SRP authentication

// For browser compatibility, we need to inject CryptoJS if available
// In a real application, you would include CryptoJS via script tag or import
if (typeof globalThis.CryptoJS === 'undefined') {
    // Load CryptoJS dynamically for SHA256 support
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js';
    script.onload = () => {
        console.log('✅ CryptoJS loaded for SHA256 support');
        initializeApp();
    };
    document.head.appendChild(script);
} else {
    initializeApp();
}

function initializeApp() {
    // RFC 5054 2048bit constants - must match server
    const rfc5054 = {
        N_base10: "21766174458617435773191008891802753781907668374255538511144643224689886235383840957210909013086056401571399717235807266581649606472148410291413364152197364477180887395655483738115072677402235101762521901569820740293149529620419333266262073471054548368736039519702486226506248861060256971802984953561121442680157668000761429988222457090413873973970171927093992114751765168063614761119615476233422096442783117971236371647333871414335895773474667308967050807005509320424799678417036867928316761272274230314067548291133582479583061439577559347101961771406173684378522703483495337037655006751328447510550299250924469288819",
        g_base10: "2", 
        k_base16: "5b9e8ef059c6b32ea59fc1d322d37f04aa30bae5aa9003b8321e21ddb04e300"
    };

    // Import client factory (this will be loaded from the built client.mjs)
    import('/client.mjs').then(clientModule => {
        const SRP6JavascriptClientSession = clientModule.default(rfc5054.N_base10, rfc5054.g_base10, rfc5054.k_base16);
        
        console.log('✅ SRP Client module loaded');
        
        // DOM elements
        const form = document.getElementById('login-form');
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const loginButton = document.querySelector('[data-testid="login-button"]');
        const buttonText = document.getElementById('button-text');
        const statusMessage = document.getElementById('status-message');
        const sessionInfo = document.getElementById('session-info');
        const logoutButton = document.getElementById('logout-button');

        // Session state
        let currentSessionId = null;
        let isAuthenticating = false;

        // Helper functions
        function updateStatus(message, type = 'info') {
            statusMessage.textContent = message;
            statusMessage.className = `status-message ${type}`;
            console.log(`[${type.toUpperCase()}] ${message}`);
        }

        function setLoading(loading) {
            isAuthenticating = loading;
            loginButton.disabled = loading;
            
            if (loading) {
                buttonText.innerHTML = '<span class="loading"></span>Authenticating...';
            } else {
                buttonText.textContent = 'Login with SRP';
            }
        }

        function showSessionInfo(username, sessionId, sessionKey) {
            document.getElementById('session-username').textContent = username;
            document.getElementById('session-id').textContent = sessionId;
            document.getElementById('session-key').textContent = sessionKey;
            sessionInfo.classList.add('visible');
        }

        function hideSessionInfo() {
            sessionInfo.classList.remove('visible');
        }

        // Display complete SRP protocol flow diagram
        function displayProtocolDiagram(username, sessionId, salt, B, A, M1, M2, sessionKey) {
            console.log('');
            console.log('╔════════════════════════════════════════════════════════════════╗');
            console.log('║                    SRP PROTOCOL FLOW DIAGRAM                   ║');
            console.log('╚════════════════════════════════════════════════════════════════╝');
            console.log('');
            console.log('    CLIENT                           WIRE                        SERVER');
            console.log('    ======                           ====                        ======');
            console.log('');
            console.log('1. User enters credentials');
            console.log('   Username: ' + username);
            console.log('   Password: ********');
            console.log('                                      │');
            console.log('2. Request Challenge                  │');
            console.log('   ──────────────────────────────────►│ POST /api/challenge');
            console.log('   { username: "' + username + '" }     │ { username }');
            console.log('                                      │');
            console.log('                                      │ 3. Server generates (b, B)');
            console.log('                                      │    B = g^b + k*v mod N');
            console.log('                                      │');
            console.log('4. Challenge Response                 │');
            console.log('   ◄──────────────────────────────────│ 200 OK');
            console.log('   { salt, B, sessionId }             │ { salt: "' + salt.substring(0, 12) + '..."');
            console.log('   salt: ' + salt.substring(0, 16) + '...│   B: "' + B.substring(0, 12) + '..."');
            console.log('   B: ' + B.substring(0, 16) + '...   │   sessionId: "' + sessionId.substring(0, 8) + '..." }');
            console.log('   sessionId: ' + sessionId.substring(0, 12) + '...│');
            console.log('                                      │');
            console.log('5. Client generates (a, A)            │');
            console.log('   A = g^a mod N                      │');
            console.log('   A: ' + A.substring(0, 16) + '...   │');
            console.log('                                      │');
            console.log('6. Client computes S and M1           │');
            console.log('   S = (B - k*g^x)^(a + u*x) mod N    │');
            console.log('   M1 = H(A + B + S)                  │');
            console.log('   M1: ' + M1.substring(0, 16) + '... │');
            console.log('                                      │');
            console.log('7. Authentication Request             │');
            console.log('   ──────────────────────────────────►│ POST /api/authenticate');
            console.log('   { sessionId, A, M1 }               │ { sessionId: "' + sessionId.substring(0, 8) + '..."');
            console.log('   A: ' + A.substring(0, 16) + '...   │   A: "' + A.substring(0, 12) + '..."');
            console.log('   M1: ' + M1.substring(0, 16) + '... │   M1: "' + M1.substring(0, 12) + '..." }');
            console.log('                                      │');
            console.log('                                      │ 8. Server computes S and verifies M1');
            console.log('                                      │    S = (A * v^u)^b mod N');
            console.log('                                      │    Verify: M1 ?= H(A + B + S)');
            console.log('                                      │');
            console.log('                                      │ 9. Server generates M2');
            console.log('                                      │    M2 = H(A + M1 + S)');
            console.log('                                      │');
            console.log('10. Authentication Response           │');
            console.log('    ◄──────────────────────────────────│ 200 OK');
            console.log('    { M2, success: true }              │ { M2: "' + M2.substring(0, 12) + '..."');
            console.log('    M2: ' + M2.substring(0, 16) + '... │   success: true }');
            console.log('                                      │');
            console.log('11. Client verifies M2                │');
            console.log('    Verify: M2 ?= H(A + M1 + S)       │');
            console.log('    Result: ✅ VERIFIED               │');
            console.log('                                      │');
            console.log('12. Both derive session key          │');
            console.log('    K = H(S)                          │    K = H(S)');
            console.log('    K: ' + sessionKey.substring(0, 16) + '... │    K: ' + sessionKey.substring(0, 16) + '...');
            console.log('                                      │');
            console.log('13. Session key verification         │');
            console.log('    ──────────────────────────────────►│ POST /api/verify-session-key');
            console.log('    { sessionId, clientSessionKey }    │ Compare keys');
            console.log('    ◄──────────────────────────────────│ { keysMatch: true }');
            console.log('                                      │');
            console.log('    🎉 AUTHENTICATION COMPLETE! 🎉    │    🎉 AUTHENTICATION COMPLETE! 🎉');
            console.log('    Shared session key established    │    Shared session key established');
            console.log('');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('Protocol Summary:');
            console.log('• Zero-knowledge proof: Password never transmitted');
            console.log('• Mutual authentication: Both parties prove knowledge');
            console.log('• Perfect forward secrecy: Ephemeral keys (a,b) discarded');
            console.log('• Shared secret: Identical session key K derived by both parties');
            console.log('• Cryptographic security: Based on discrete logarithm problem');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('');
        }

        // API helper functions
        async function apiRequest(endpoint, options = {}) {
            const url = `/api${endpoint}`;
            const config = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                ...options
            };

            console.log(`🌐 ${config.method} ${url}`, config.body ? JSON.parse(config.body) : '');

            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }

            console.log(`✅ Response:`, data);
            return data;
        }

        // SRP Authentication Flow
        async function authenticateWithSRP(username, password) {
            try {
                setLoading(true);
                console.log('');
                console.log('╔════════════════════════════════════════════════════════════════╗');
                console.log('║                    SRP CLIENT AUTHENTICATION                   ║');
                console.log('╚════════════════════════════════════════════════════════════════╝');
                console.log(`🚀 CLIENT: Starting SRP authentication for user: ${username}`);
                updateStatus('Starting SRP authentication...', 'info');

                // Step 1: Get challenge from server
                console.log('📤 CLIENT: Requesting challenge from server...');
                updateStatus('Requesting authentication challenge...', 'info');
                const challengeResponse = await apiRequest('/challenge', {
                    method: 'POST',
                    body: JSON.stringify({ username })
                });

                const { salt, B, sessionId } = challengeResponse;
                currentSessionId = sessionId;
                
                console.log('📥 CLIENT: Received server challenge');
                console.log(`   - Salt (s): ${salt.substring(0, 16)}...${salt.substring(salt.length-8)}`);
                console.log(`   - Server public B: ${B.substring(0, 16)}...${B.substring(B.length-8)}`);
                console.log(`   - Session ID: ${sessionId}`);
                updateStatus('Challenge received, generating client proof...', 'info');

                // Step 2: Create client session and generate proof
                const client = new SRP6JavascriptClientSession();
                
                console.log('🔑 CLIENT: Generating client ephemeral key pair (a, A)');
                // Client step 1: Set credentials
                client.step1(username, password);
                
                // Client step 2: Generate A and M1 using server's salt and B
                const credentials = client.step2(salt, B);
                
                console.log(`   - Client public A = g^a mod N: ${credentials.A.substring(0, 16)}...${credentials.A.substring(credentials.A.length-8)}`);
                console.log(`🧮 CLIENT: Computing shared secret S = (B - k*g^x)^(a + u*x) mod N`);
                console.log(`🛡️  CLIENT: Generated client proof M1 = H(A + B + S): ${credentials.M1.substring(0, 16)}...${credentials.M1.substring(credentials.M1.length-8)}`);
                updateStatus('Sending authentication proof to server...', 'info');

                // Step 3: Send proof to server
                console.log('📤 CLIENT: Sending authentication proof { A, M1 } to server');
                const authResponse = await apiRequest('/authenticate', {
                    method: 'POST',
                    body: JSON.stringify({
                        sessionId,
                        A: credentials.A,
                        M1: credentials.M1
                    })
                });

                if (!authResponse.success) {
                    throw new Error('Server rejected authentication proof');
                }

                console.log('📥 CLIENT: Received server response');
                console.log(`   - Server proof M2: ${authResponse.M2.substring(0, 16)}...${authResponse.M2.substring(authResponse.M2.length-8)}`);
                updateStatus('Verifying server proof...', 'info');

                // Step 4: Verify server's proof M2
                console.log('🔍 CLIENT: Verifying server proof M2 = H(A + M1 + S)');
                const serverVerified = client.step3(authResponse.M2);
                
                if (!serverVerified) {
                    throw new Error('Server proof verification failed');
                }

                // Step 5: Get session key and show success
                const sessionKey = client.getSessionKey();
                
                console.log('✅ CLIENT: Server proof verified successfully!');
                console.log('🔑 CLIENT: Generated shared session key');
                console.log(`   - Session Key = H(S): ${sessionKey.substring(0, 16)}...${sessionKey.substring(sessionKey.length-8)}`);
                
                // Verify session keys match between client and server
                console.log('🔍 CLIENT: Verifying session key matches server...');
                const verifyResponse = await apiRequest('/verify-session-key', {
                    method: 'POST',
                    body: JSON.stringify({
                        sessionId,
                        clientSessionKey: sessionKey
                    })
                });
                
                if (verifyResponse.keysMatch) {
                    console.log('✅ CLIENT: Session key verification successful!');
                } else {
                    console.log('❌ CLIENT: Session key mismatch detected!');
                }
                
                // Display complete protocol flow diagram
                displayProtocolDiagram(username, sessionId, salt, B, credentials.A, credentials.M1, authResponse.M2, sessionKey);
                
                console.log('');
                console.log('╔════════════════════════════════════════════════════════════════╗');
                console.log('║              🎉 SRP AUTHENTICATION SUCCESSFUL! 🎉              ║');
                console.log('╚════════════════════════════════════════════════════════════════╝');
                console.log(`📋 Final status: Complete SRP authentication successful for ${username}`);
                console.log(`   Session ID: ${sessionId}`);
                console.log(`   Session Key: ${sessionKey}`);
                console.log(`   Key Verification: ${verifyResponse.keysMatch ? '✅ PASSED' : '❌ FAILED'}`);
                console.log('');
                
                updateStatus('🎉 Authentication successful!', 'success');
                showSessionInfo(username, sessionId, sessionKey);

            } catch (error) {
                console.error('❌ Authentication failed:', error);
                updateStatus(`Authentication failed: ${error.message}`, 'error');
                currentSessionId = null;
                hideSessionInfo();
            } finally {
                setLoading(false);
            }
        }

        // Logout function
        async function logout() {
            if (!currentSessionId) return;

            try {
                await apiRequest(`/session/${currentSessionId}`, {
                    method: 'DELETE'
                });

                currentSessionId = null;
                hideSessionInfo();
                updateStatus('Logged out successfully', 'info');

                // Clear form
                usernameInput.value = '';
                passwordInput.value = '';

            } catch (error) {
                console.error('Logout error:', error);
                updateStatus(`Logout failed: ${error.message}`, 'error');
            }
        }

        // Event listeners
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (isAuthenticating) {
                return; // Prevent multiple simultaneous requests
            }

            const username = usernameInput.value.trim();
            const password = passwordInput.value;

            if (!username || !password) {
                updateStatus('Please enter both username and password', 'error');
                return;
            }

            await authenticateWithSRP(username, password);
        });

        logoutButton.addEventListener('click', logout);

        // Pre-fill test credentials for convenience
        usernameInput.value = 'testuser';
        passwordInput.value = 'password1234';

        updateStatus('Ready for authentication', 'info');
        console.log('🚀 SRP E2E Test Client initialized');

    }).catch(error => {
        console.error('Failed to load SRP client module:', error);
        updateStatus('Failed to load SRP client module', 'error');
    });
}