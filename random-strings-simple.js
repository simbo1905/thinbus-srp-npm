// Simple random strings implementation for both browser and Node.js
const randomStrings = (function() {
    const hexChars = '0123456789abcdef';
    
    function getRandomValues(length) {
        if (typeof require !== 'undefined') {
            // Node.js environment
            const crypto = require('crypto');
            return crypto.randomBytes(length);
        } else if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
            // Browser environment
            const array = new Uint8Array(length);
            window.crypto.getRandomValues(array);
            return array;
        } else {
            // Fallback using Math.random (not cryptographically secure)
            const array = new Uint8Array(length);
            for (let i = 0; i < length; i++) {
                array[i] = Math.floor(Math.random() * 256);
            }
            return array;
        }
    }
    
    return {
        hex: function(length) {
            const bytes = getRandomValues(Math.ceil(length / 2));
            let result = '';
            for (let i = 0; i < bytes.length && result.length < length; i++) {
                result += hexChars[bytes[i] >> 4] + hexChars[bytes[i] & 0x0f];
            }
            return result.substring(0, length);
        }
    };
})();