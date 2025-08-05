// Legacy SRP E2E Test Client Application
// Uses the UMD bundle for browsers without ES module support

console.log('🔄 Legacy SRP Client Application Starting...');
console.log('📦 ThinbusSRP UMD bundle loaded:', typeof ThinbusSRP);

// RFC 5054 2048bit constants - must match server
const rfc5054 = {
    N_base10: "21766174458617435773191008891802753781907668374255538511144643224689886235383840957210909013086056401571399717235807266581649606472148410291413364152197364477180887395655483738115072677402235101762521901569820740293149529620419333266262073471054548368736039519702486226506248861060256971802984953561121442680157668000761429988222457090413873973970171927093992114751765168063614761119615476233422096442783117971236371647333871414335895773474667308967050807005509320424799678417036867928316761272274230314067548291133582479583061439577559347101961771406173684378522703483495337037655006751328447510550299250924469288819",
    g_base10: "2", 
    k_base16: "5b9e8ef059c6b32ea59fc1d322d37f04aa30bae5aa9003b8321e21ddb04e300"
};

// Create SRP client session factory from UMD bundle
console.log('🏗️  Creating SRP client session factory from UMD bundle...');
const SRP6JavascriptClientSession = ThinbusSRP.default(rfc5054.N_base10, rfc5054.g_base10, rfc5054.k_base16);
// Expose to window for testing
window.SRP6JavascriptClientSession = SRP6JavascriptClientSession;
console.log('✅ SRP Client session factory created');

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
    statusMessage.style.display = 'block';
}

function updateButton(text, disabled = false) {
    buttonText.textContent = text;
    loginButton.disabled = disabled;
}

function showSessionInfo(sessionId, sessionKey) {
    document.getElementById('session-id').textContent = sessionId;
    document.getElementById('session-key').textContent = sessionKey.substring(0, 16) + '...';
    document.getElementById('session-timestamp').textContent = new Date().toLocaleString();
    sessionInfo.style.display = 'block';
    form.style.display = 'none';
}

function hideSessionInfo() {
    sessionInfo.style.display = 'none';
    form.style.display = 'block';
    currentSessionId = null;
}

// SRP Authentication Flow
async function performSRPAuthentication(username, password) {
    console.log('🚀 Starting SRP authentication flow...');
    updateStatus('🔄 Initializing SRP client...', 'info');
    
    try {
        // Step 1: Create client and initialize with credentials
        console.log('📤 SRP Step 1: Initializing client with credentials...');
        const client = new SRP6JavascriptClientSession();
        client.step1(username, password);
        console.log('✅ Client step1 completed - State:', client.getState());
        
        updateStatus('🌐 Requesting server challenge...', 'info');
        
        // Get challenge from server (salt + B)
        console.log('🌐 Requesting challenge from server...');
        const challengeResponse = await fetch('/api/challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        
        if (!challengeResponse.ok) {
            throw new Error(`Challenge request failed: ${challengeResponse.status}`);
        }
        
        const { salt, B, sessionId } = await challengeResponse.json();
        console.log('✅ Server challenge received:', { 
            salt: salt.substring(0, 16) + '...', 
            B: B.substring(0, 16) + '...' 
        });
        
        updateStatus('🔐 Generating client proof...', 'info');
        
        // Step 2: Generate client proof
        console.log('📤 SRP Step 2: Generating client proof...');
        const credentials = client.step2(salt, B);
        console.log('✅ Client credentials generated:', {
            A: credentials.A.substring(0, 16) + '...',
            M1: credentials.M1.substring(0, 16) + '...',
            clientState: client.getState()
        });
        
        updateStatus('🔍 Verifying with server...', 'info');
        
        // Send credentials to server for verification
        console.log('🌐 Sending credentials to server for verification...');
        const authResponse = await fetch('/api/authenticate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                sessionId,
                A: credentials.A, 
                M1: credentials.M1 
            })
        });
        
        if (!authResponse.ok) {
            throw new Error(`Authentication failed: ${authResponse.status}`);
        }
        
        const { success, M2 } = await authResponse.json();
        
        if (!success) {
            throw new Error('Server rejected authentication');
        }
        
        console.log('✅ Server verified credentials:', { 
            success, 
            sessionId,
            M2: M2.substring(0, 16) + '...' 
        });
        
        updateStatus('🔍 Verifying server proof...', 'info');
        
        // Step 3: Verify server proof (optional but recommended)
        console.log('🔍 SRP Step 3: Verifying server proof...');
        const verified = client.step3(M2);
        console.log('✅ Server proof verification result:', verified);
        console.log('   Final Client State:', client.getState());
        
        if (!verified) {
            throw new Error('Server proof verification failed');
        }
        
        // Get shared session key for follow-on cryptography
        const sessionKey = client.getSessionKey();
        console.log('🔑 Shared session key obtained:', sessionKey.substring(0, 16) + '...');
        
        // Success!
        updateStatus('✅ Authentication successful!', 'success');
        showSessionInfo(sessionId, sessionKey);
        currentSessionId = sessionId;
        
        console.log('🎉 SRP authentication completed successfully!');
        return { success: true, sessionId, sessionKey };
        
    } catch (error) {
        console.error('❌ SRP authentication failed:', error);
        updateStatus(`❌ Authentication failed: ${error.message}`, 'error');
        return { success: false, error: error.message };
    }
}

// Event handlers
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (isAuthenticating) return;
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    
    if (!username || !password) {
        updateStatus('❌ Please enter both username and password', 'error');
        return;
    }
    
    isAuthenticating = true;
    updateButton('🔄 Authenticating...', true);
    
    const result = await performSRPAuthentication(username, password);
    
    isAuthenticating = false;
    updateButton('🔑 Authenticate with SRP', false);
    
    if (!result.success) {
        // Clear password field on failure for security
        passwordInput.value = '';
    }
});

logoutButton.addEventListener('click', () => {
    console.log('🚪 Logging out...');
    hideSessionInfo();
    updateStatus('Ready to authenticate using legacy UMD bundle', 'info');
    passwordInput.value = 'password1234'; // Reset for demo
});

// Prevent form submission on Enter in input fields
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        passwordInput.focus();
    }
});

passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        form.dispatchEvent(new Event('submit'));
    }
});

console.log('✅ Legacy SRP Client Application initialized successfully');
console.log('🎯 Ready for authentication using UMD bundle');