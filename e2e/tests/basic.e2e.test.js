// SPDX-FileCopyrightText: 2014-2025 Simon Massey
// SPDX-License-Identifier: Apache-2.0
import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Basic E2E Tests - Incremental', function() {
    this.timeout(10000);

    let browser;
    let server;
    let serverPort = 3000;

    function waitForServer(port, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkServer = async () => {
                try {
                    const response = await fetch(`http://localhost:${port}`);
                    if (response.ok) {
                        resolve();
                    } else {
                        throw new Error(`Server returned ${response.status}`);
                    }
                } catch (error) {
                    if (Date.now() - startTime > timeout) {
                        reject(new Error(`Server failed to start within ${timeout}ms: ${error.message}`));
                    } else {
                        setTimeout(checkServer, 100);
                    }
                }
            };
            
            checkServer();
        });
    }

    before(async function() {
        console.log('🚀 Starting Basic E2E Tests');
        
        // Start test server
        console.log('📦 Starting test server...');
        const serverPath = join(__dirname, '..', 'test-server.mjs');
        server = spawn('node', [serverPath], {
            env: { ...process.env, PORT: serverPort },
            stdio: 'pipe'
        });

        server.stdout.on('data', (data) => {
            if (process.env.DEBUG) {
                console.log(`[SERVER] ${data.toString().trim()}`);
            }
        });

        server.stderr.on('data', (data) => {
            console.error(`[SERVER ERROR] ${data.toString().trim()}`);
        });

        await waitForServer(serverPort);
        console.log('✅ Test server ready');

        // Launch Puppeteer
        console.log('🌐 Launching browser...');
        browser = await puppeteer.launch({
            headless: process.env.HEADED !== 'true',
            slowMo: process.env.SLOW ? 100 : 0,
            devtools: process.env.DEBUG === 'true',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        console.log('✅ Browser ready');
    });

    after(async function() {
        console.log('🧹 Cleaning up...');
        
        if (browser) {
            await browser.close();
            console.log('✅ Browser closed');
        }
        
        if (server) {
            server.kill('SIGTERM');
            console.log('✅ Server stopped');
        }
    });

    describe('Step 1: Page Loading', function() {
        let page;

        beforeEach(async function() {
            page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
        });

        afterEach(async function() {
            if (page) {
                await page.close();
            }
        });

        it('should load the page successfully', async function() {
            console.log('📄 Testing page load...');
            
            await page.goto(`http://localhost:${serverPort}`, { 
                waitUntil: 'networkidle0' 
            });

            const title = await page.title();
            expect(title).to.contain('SRP Authentication E2E Test');
            
            console.log('✅ Page loaded with correct title');
        });

        it('should have all required form elements', async function() {
            console.log('🔍 Testing form elements...');
            
            await page.goto(`http://localhost:${serverPort}`, { 
                waitUntil: 'networkidle0' 
            });

            // Check for required elements
            const usernameInput = await page.$('[data-testid="username-input"]');
            expect(usernameInput).to.not.be.null;

            const passwordInput = await page.$('[data-testid="password-input"]');
            expect(passwordInput).to.not.be.null;

            const loginButton = await page.$('[data-testid="login-button"]');
            expect(loginButton).to.not.be.null;

            const statusMessage = await page.$('[data-testid="status-message"]');
            expect(statusMessage).to.not.be.null;

            console.log('✅ All form elements present');
        });

        it('should have test credentials pre-filled', async function() {
            console.log('📝 Testing pre-filled credentials...');
            
            await page.goto(`http://localhost:${serverPort}`, { 
                waitUntil: 'networkidle0' 
            });

            const usernameValue = await page.evaluate(() => 
                document.querySelector('[data-testid="username-input"]').value
            );
            const passwordValue = await page.evaluate(() => 
                document.querySelector('[data-testid="password-input"]').value
            );
            
            expect(usernameValue).to.equal('testuser');
            expect(passwordValue).to.equal('password1234');

            console.log('✅ Test credentials pre-filled correctly');
        });
    });

    describe('Step 2: Basic Interaction', function() {
        let page;

        beforeEach(async function() {
            page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
            
            // Collect console messages for debugging
            page.on('console', msg => {
                if (process.env.DEBUG || msg.type() === 'error') {
                    console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
                }
            });

            await page.goto(`http://localhost:${serverPort}`, { 
                waitUntil: 'networkidle0' 
            });
        });

        afterEach(async function() {
            if (page) {
                await page.close();
            }
        });

        it('should allow typing in form fields', async function() {
            console.log('⌨️  Testing form input...');

            // Clear and type new values
            await page.evaluate(() => {
                document.querySelector('[data-testid="username-input"]').value = '';
                document.querySelector('[data-testid="password-input"]').value = '';
            });
            
            await page.type('[data-testid="username-input"]', 'newuser');
            await page.type('[data-testid="password-input"]', 'newpass');

            // Verify values
            const usernameValue = await page.evaluate(() => 
                document.querySelector('[data-testid="username-input"]').value
            );
            const passwordValue = await page.evaluate(() => 
                document.querySelector('[data-testid="password-input"]').value
            );
            
            expect(usernameValue).to.equal('newuser');
            expect(passwordValue).to.equal('newpass');

            console.log('✅ Form input working correctly');
        });

        it('should show initial status message', async function() {
            console.log('💬 Testing initial status...');

            const statusText = await page.evaluate(() => 
                document.querySelector('[data-testid="status-message"]').textContent
            );
            expect(statusText).to.contain('Ready for authentication');

            console.log('✅ Initial status message correct');
        });

        it('should have clickable login button', async function() {
            console.log('🖱️  Testing button interaction...');

            const button = await page.$('[data-testid="login-button"]');
            const isEnabled = await page.evaluate(btn => !btn.disabled, button);
            
            expect(isEnabled).to.be.true;

            // Test clicking (but don't wait for completion)
            await page.click('[data-testid="login-button"]');
            
            // Just verify the button becomes disabled (indicating click registered)
            await page.waitForFunction(
                () => document.querySelector('[data-testid="login-button"]').disabled,
                { timeout: 2000 }
            );

            const isDisabledAfterClick = await page.evaluate(btn => btn.disabled, button);
            expect(isDisabledAfterClick).to.be.true;

            console.log('✅ Button interaction working');
        });
    });

    describe('Step 3: Server Communication', function() {
        let page;

        beforeEach(async function() {
            page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
            
            page.on('console', msg => {
                if (process.env.DEBUG || msg.type() === 'error') {
                    console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
                }
            });

            await page.goto(`http://localhost:${serverPort}`, { 
                waitUntil: 'networkidle0' 
            });
        });

        afterEach(async function() {
            if (page) {
                await page.close();
            }
        });

        it('should make API request when login clicked', async function() {
            console.log('🌐 Testing API communication...');

            let challengeRequestMade = false;
            
            // Monitor network requests
            page.on('request', request => {
                if (request.url().includes('/api/challenge')) {
                    challengeRequestMade = true;
                    console.log('📡 Challenge request detected');
                }
            });

            // Ensure test credentials (they should already be pre-filled)
            await page.evaluate(() => {
                document.querySelector('[data-testid="username-input"]').value = 'testuser';
                document.querySelector('[data-testid="password-input"]').value = 'password1234';
            });

            await page.click('[data-testid="login-button"]');

            // Wait a moment for request
            await new Promise(resolve => setTimeout(resolve, 2000));

            expect(challengeRequestMade).to.be.true;

            console.log('✅ API request made successfully');
        });
    });

    describe('Step 4: Complete SRP Authentication', function() {
        let page;

        beforeEach(async function() {
            page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
            
            page.on('console', msg => {
                if (process.env.DEBUG || msg.type() === 'error') {
                    console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
                }
            });

            await page.goto(`http://localhost:${serverPort}`, { 
                waitUntil: 'networkidle0' 
            });
        });

        afterEach(async function() {
            if (page) {
                await page.close();
            }
        });

        it('should complete full SRP authentication', async function() {
            console.log('🔐 Testing complete SRP authentication...');

            // Click login with pre-filled credentials
            await page.click('[data-testid="login-button"]');

            // Wait for authentication to complete
            console.log('⏳ Waiting for authentication to complete...');
            
            let finalStatus = '';
            let attempts = 0;
            const maxAttempts = 25; // 5 seconds total
            
            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 200));
                finalStatus = await page.evaluate(() => 
                    document.querySelector('[data-testid="status-message"]').textContent
                );
                
                if (finalStatus.includes('Authentication successful') || finalStatus.includes('Authentication failed')) {
                    break;
                }
                attempts++;
            }

            console.log(`📋 Final status: ${finalStatus}`);
            expect(finalStatus).to.contain('Authentication successful');

            // Verify session info is displayed
            const sessionInfoVisible = await page.evaluate(() => {
                const sessionInfo = document.querySelector('[data-testid="session-info"]');
                return sessionInfo && sessionInfo.classList.contains('visible');
            });
            
            expect(sessionInfoVisible).to.be.true;

            // Verify session details
            const sessionUsername = await page.evaluate(() => 
                document.querySelector('#session-username').textContent
            );
            expect(sessionUsername).to.equal('testuser');

            const sessionId = await page.evaluate(() => 
                document.querySelector('#session-id').textContent
            );
            expect(sessionId).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

            const sessionKey = await page.evaluate(() => 
                document.querySelector('#session-key').textContent
            );
            expect(sessionKey).to.have.length.greaterThan(50);

            console.log('✅ Complete SRP authentication successful');
            console.log(`   Session ID: ${sessionId.substring(0, 8)}...`);
            console.log(`   Session Key: ${sessionKey.substring(0, 16)}...`);
        });

        it('should handle logout functionality', async function() {
            console.log('🚪 Testing logout functionality...');

            // Complete authentication first
            await page.click('[data-testid="login-button"]');

            // Wait for authentication success
            let attempts = 0;
            while (attempts < 25) {
                await new Promise(resolve => setTimeout(resolve, 200));
                const status = await page.evaluate(() => 
                    document.querySelector('[data-testid="status-message"]').textContent
                );
                if (status.includes('Authentication successful')) break;
                attempts++;
            }

            // Verify session info is visible
            let sessionInfoVisible = await page.evaluate(() => {
                const sessionInfo = document.querySelector('[data-testid="session-info"]');
                return sessionInfo && sessionInfo.classList.contains('visible');
            });
            expect(sessionInfoVisible).to.be.true;

            // Click logout
            await page.click('#logout-button');

            // Wait for logout to complete
            attempts = 0;
            while (attempts < 10) {
                await new Promise(resolve => setTimeout(resolve, 200));
                const status = await page.evaluate(() => 
                    document.querySelector('[data-testid="status-message"]').textContent
                );
                if (status.includes('Logged out')) break;
                attempts++;
            }

            // Verify session info is hidden
            sessionInfoVisible = await page.evaluate(() => {
                const sessionInfo = document.querySelector('[data-testid="session-info"]');
                return sessionInfo && sessionInfo.classList.contains('visible');
            });
            expect(sessionInfoVisible).to.be.false;

            // Verify form is cleared
            const usernameValue = await page.evaluate(() => 
                document.querySelector('[data-testid="username-input"]').value
            );
            const passwordValue = await page.evaluate(() => 
                document.querySelector('[data-testid="password-input"]').value
            );
            
            expect(usernameValue).to.equal('');
            expect(passwordValue).to.equal('');

            console.log('✅ Logout completed successfully');
        });
    });

    describe('Step 5: Error Handling', function() {
        let page;

        beforeEach(async function() {
            page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
            
            page.on('console', msg => {
                if (process.env.DEBUG || msg.type() === 'error') {
                    console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
                }
            });

            await page.goto(`http://localhost:${serverPort}`, { 
                waitUntil: 'networkidle0' 
            });
        });

        afterEach(async function() {
            if (page) {
                await page.close();
            }
        });

        it('should handle wrong password gracefully', async function() {
            console.log('❌ Testing wrong password handling...');

            // Set wrong password
            await page.evaluate(() => {
                document.querySelector('[data-testid="username-input"]').value = 'testuser';
                document.querySelector('[data-testid="password-input"]').value = 'wrongpassword';
            });

            await page.click('[data-testid="login-button"]');

            // Wait for error message
            let finalStatus = '';
            let attempts = 0;
            while (attempts < 25) {
                await new Promise(resolve => setTimeout(resolve, 200));
                finalStatus = await page.evaluate(() => 
                    document.querySelector('[data-testid="status-message"]').textContent
                );
                if (finalStatus.includes('Authentication failed') || finalStatus.includes('failed')) {
                    break;
                }
                attempts++;
            }

            console.log(`📋 Error status: ${finalStatus}`);
            expect(finalStatus).to.contain('Authentication failed');

            // Verify session info is not shown
            const sessionInfoVisible = await page.evaluate(() => {
                const sessionInfo = document.querySelector('[data-testid="session-info"]');
                return sessionInfo && sessionInfo.classList.contains('visible');
            });
            expect(sessionInfoVisible).to.be.false;

            console.log('✅ Wrong password handled correctly');
        });

        it('should handle non-existent user', async function() {
            console.log('👤 Testing non-existent user handling...');

            // Set non-existent user
            await page.evaluate(() => {
                document.querySelector('[data-testid="username-input"]').value = 'nonexistentuser';
                document.querySelector('[data-testid="password-input"]').value = 'password1234';
            });

            await page.click('[data-testid="login-button"]');

            // Wait for error message
            let finalStatus = '';
            let attempts = 0;
            while (attempts < 25) {
                await new Promise(resolve => setTimeout(resolve, 200));
                finalStatus = await page.evaluate(() => 
                    document.querySelector('[data-testid="status-message"]').textContent
                );
                if (finalStatus.includes('User not found') || finalStatus.includes('failed')) {
                    break;
                }
                attempts++;
            }

            console.log(`📋 Error status: ${finalStatus}`);
            expect(finalStatus).to.contain('User not found');

            // Verify no session created
            const sessionInfoVisible = await page.evaluate(() => {
                const sessionInfo = document.querySelector('[data-testid="session-info"]');
                return sessionInfo && sessionInfo.classList.contains('visible');
            });
            expect(sessionInfoVisible).to.be.false;

            console.log('✅ Non-existent user handled correctly');
        });

        it('should handle button state during authentication', async function() {
            console.log('🔒 Testing button state management...');

            // Test that button becomes disabled during authentication
            await page.click('[data-testid="login-button"]');

            // Check button is disabled immediately
            const isDisabled = await page.evaluate(() => 
                document.querySelector('[data-testid="login-button"]').disabled
            );
            expect(isDisabled).to.be.true;

            // Check button text changes
            const buttonText = await page.evaluate(() => 
                document.querySelector('[data-testid="login-button"]').textContent
            );
            expect(buttonText).to.contain('Authenticating');

            // Wait for authentication to complete
            let attempts = 0;
            while (attempts < 25) {
                await new Promise(resolve => setTimeout(resolve, 200));
                const status = await page.evaluate(() => 
                    document.querySelector('[data-testid="status-message"]').textContent
                );
                if (status.includes('Authentication successful')) break;
                attempts++;
            }

            // Verify button is re-enabled
            const finalDisabled = await page.evaluate(() => 
                document.querySelector('[data-testid="login-button"]').disabled
            );
            expect(finalDisabled).to.be.false;

            console.log('✅ Button state managed correctly during authentication');
        });
    });
});