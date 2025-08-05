// SPDX-FileCopyrightText: 2014-2025 Simon Massey
// SPDX-License-Identifier: Apache-2.0
// Synchronous SHA256 implementation for ES modules
// This is a workaround since we can't use async/await in concatenated files

// Try to get Node.js crypto synchronously  
let nodeCrypto = null;
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    // Check if crypto is already injected via globalThis (e.g., by test server)
    if (globalThis.nodeCrypto) {
        nodeCrypto = globalThis.nodeCrypto;
    } else {
        try {
            // This is a hack but should work for Node.js ES modules in practice
            const Module = globalThis.module || eval('module');
            if (Module && Module.createRequire) {
                // We're in an ES module context with createRequire available
                const req = Module.createRequire(import.meta.url || 'file:///fake.js');
                nodeCrypto = req('crypto');
            } else {
                // Try the older global require if available
                nodeCrypto = globalThis.require && globalThis.require('crypto');
            }
        } catch (e) {
            // Could not load crypto - will fall back to browser mode
            // Only warn if globalThis.nodeCrypto is also not available
            if (!globalThis.nodeCrypto) {
                console.warn('Could not load Node.js crypto module:', e.message);
            }
        }
    }
}

globalThis.SHA256 = function(message) {
    if (nodeCrypto) {
        // Node.js crypto loaded via createRequire
        return nodeCrypto.createHash('sha256').update(message).digest('hex');
    } else if (globalThis.nodeCrypto) {
        // Node.js crypto injected by test
        return globalThis.nodeCrypto.createHash('sha256').update(message).digest('hex');
    } else if (typeof window !== 'undefined' && typeof CryptoJS !== 'undefined' && CryptoJS.SHA256) {
        // Browser CryptoJS
        return CryptoJS.SHA256(message).toString().toLowerCase();
    } else {
        throw new Error('No SHA256 implementation available - need Node.js crypto or browser CryptoJS');
    }
};