// SPDX-FileCopyrightText: 2014-2025 Simon Massey
// SPDX-License-Identifier: Apache-2.0
import { spawn } from 'child_process';
import puppeteer from 'puppeteer';
import { expect } from 'chai';

describe('UMD Bundle E2E Tests', function() {
    let server;
    let browser;
    let page;
    
    const PORT = 3002; // Different port from main E2E tests
    const BASE_URL = `http://localhost:${PORT}`;
    
    before(async function() {
        this.timeout(30000);
        
        console.log('📦 Starting UMD test server...');
        
        // Start the test server
        server = spawn('node', ['e2e/test-server.mjs'], {
            env: { ...process.env, PORT: PORT.toString() },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        // Wait for server to start
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Server failed to start within 10 seconds'));
            }, 10000);
            
            server.stdout.on('data', (data) => {
                const output = data.toString();
                console.log('[SERVER]', output.trim());
                if (output.includes(`SRP E2E Test Server running on http://localhost:${PORT}`)) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            
            server.stderr.on('data', (data) => {
                console.error('[SERVER ERROR]', data.toString());
            });
            
            server.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
        
        console.log('✅ Legacy test server started');
        
        // Launch browser
        const headless = !process.env.HEADED;
        const slowMo = process.env.SLOW ? 100 : 0;
        
        console.log(`🌐 Launching browser (headless: ${headless}, slowMo: ${slowMo}ms)...`);
        
        browser = await puppeteer.launch({
            headless,
            slowMo,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            devtools: !!process.env.DEBUG
        });
        
        page = await browser.newPage();
        
        // Enable console logging from the page
        page.on('console', msg => {
            const type = msg.type();
            const text = msg.text();
            if (type === 'error') {
                console.error(`[BROWSER ERROR] ${text}`);
            } else if (process.env.DEBUG) {
                console.log(`[BROWSER ${type.toUpperCase()}] ${text}`);
            }
        });
        
        // Handle page errors
        page.on('pageerror', error => {
            console.error('[PAGE ERROR]', error.message);
        });
        
        console.log('✅ Browser launched');
    });
    
    after(async function() {
        console.log('🧹 Cleaning up...');
        
        if (browser) {
            await browser.close();
            console.log('✅ Browser closed');
        }
        
        if (server) {
            server.kill('SIGTERM');
            
            // Wait for server to close
            await new Promise((resolve) => {
                server.on('close', () => {
                    console.log('✅ Server stopped');
                    resolve();
                });
                
                // Force kill after 5 seconds
                setTimeout(() => {
                    server.kill('SIGKILL');
                    resolve();
                }, 5000);
            });
        }
    });

    describe('Legacy UMD Bundle - Incremental Steps', function() {
        
        it('Step 1: Should load legacy page successfully', async function() {
            this.timeout(10000);
            
            console.log('🌐 Loading legacy page...');
            await page.goto(`${BASE_URL}/legacy.html`, { 
                waitUntil: 'networkidle0',
                timeout: 10000 
            });
            
            // Check page title
            const title = await page.title();
            expect(title).to.include('Legacy Browser Test');
            
            console.log('✅ Legacy page loaded successfully');
        });
        
        it('Step 2: Should load UMD bundle and initialize SRP client', async function() {
            this.timeout(5000);
            
            console.log('📦 Checking UMD bundle loading...');
            
            // Wait for ThinbusSRP to be available
            await page.waitForFunction(() => {
                return typeof window.ThinbusSRP !== 'undefined';
            }, { timeout: 5000 });
            
            // Check that the UMD bundle is loaded
            const thinbusSRPExists = await page.evaluate(() => {
                return typeof window.ThinbusSRP !== 'undefined';
            });
            expect(thinbusSRPExists).to.be.true;
            
            // Check that SRP client factory was created
            await page.waitForFunction(() => {
                return window.SRP6JavascriptClientSession !== undefined;
            }, { timeout: 2000 });
            
            const clientFactoryExists = await page.evaluate(() => {
                return typeof window.SRP6JavascriptClientSession === 'function';
            });
            expect(clientFactoryExists).to.be.true;
            
            console.log('✅ UMD bundle loaded and SRP client factory created');
        });
        
        it('Step 3: Should have form elements ready for interaction', async function() {
            this.timeout(5000);
            
            console.log('🔍 Checking form elements...');
            
            // Check form elements exist
            const usernameInput = await page.$('[data-testid="username-input"]');
            const passwordInput = await page.$('[data-testid="password-input"]');
            const loginButton = await page.$('[data-testid="login-button"]');
            
            expect(usernameInput).to.not.be.null;
            expect(passwordInput).to.not.be.null;
            expect(loginButton).to.not.be.null;
            
            // Check initial values
            const username = await page.evaluate(() => {
                return document.querySelector('[data-testid="username-input"]').value;
            });
            const password = await page.evaluate(() => {
                return document.querySelector('[data-testid="password-input"]').value;
            });
            
            expect(username).to.equal('testuser');
            expect(password).to.equal('password1234');
            
            // Check button is enabled
            const buttonDisabled = await page.evaluate(() => {
                return document.querySelector('[data-testid="login-button"]').disabled;
            });
            expect(buttonDisabled).to.be.false;
            
            console.log('✅ Form elements are ready');
        });
        
        it('Step 4: Should complete full SRP authentication using UMD bundle', async function() {
            this.timeout(15000);
            
            console.log('🔐 Testing complete SRP authentication flow...');
            
            // Click login button to start authentication
            await page.click('[data-testid="login-button"]');
            
            // Wait for authentication to complete and session info to be populated
            await page.waitForFunction(() => {
                const sessionInfo = document.getElementById('session-info');
                const sessionId = document.getElementById('session-id');
                return sessionInfo && sessionInfo.style.display !== 'none' && 
                       sessionId && sessionId.textContent !== '-' && sessionId.textContent.length > 0;
            }, { timeout: 10000 });
            
            // Verify session information is displayed
            const sessionVisible = await page.evaluate(() => {
                const sessionInfo = document.getElementById('session-info');
                return sessionInfo && sessionInfo.style.display !== 'none';
            });
            expect(sessionVisible).to.be.true;
            
            // Get session details
            const sessionDetails = await page.evaluate(() => {
                return {
                    sessionId: document.getElementById('session-id').textContent,
                    sessionKey: document.getElementById('session-key').textContent,
                    timestamp: document.getElementById('session-timestamp').textContent
                };
            });
            
            expect(sessionDetails.sessionId).to.not.equal('-');
            expect(sessionDetails.sessionKey).to.not.equal('-');
            expect(sessionDetails.timestamp).to.not.equal('-');
            
            console.log('✅ SRP authentication completed successfully');
            console.log(`   Session ID: ${sessionDetails.sessionId}`);
            console.log(`   Session Key: ${sessionDetails.sessionKey}`);
        });
        
        it('Step 5: Should handle logout functionality', async function() {
            this.timeout(5000);
            
            console.log('🚪 Testing logout functionality...');
            
            // Click logout button
            await page.click('#logout-button');
            
            // Wait for form to be visible again
            await page.waitForFunction(() => {
                const form = document.getElementById('login-form');
                return form && form.style.display !== 'none';
            }, { timeout: 2000 });
            
            // Verify session info is hidden
            const sessionHidden = await page.evaluate(() => {
                const sessionInfo = document.getElementById('session-info');
                return sessionInfo.style.display === 'none';
            });
            expect(sessionHidden).to.be.true;
            
            // Verify form is visible again
            const formVisible = await page.evaluate(() => {
                const form = document.getElementById('login-form');
                return form && form.style.display !== 'none';
            });
            expect(formVisible).to.be.true;
            
            console.log('✅ Logout completed successfully');
        });
    });

    describe('Legacy UMD Bundle - Error Handling', function() {
        
        it('Should handle invalid credentials gracefully', async function() {
            this.timeout(10000);
            
            console.log('🔒 Testing error handling with invalid credentials...');
            
            // Clear and enter invalid credentials
            await page.evaluate(() => {
                document.querySelector('[data-testid="username-input"]').value = 'invaliduser';
                document.querySelector('[data-testid="password-input"]').value = 'wrongpassword';
            });
            
            // Attempt authentication
            await page.click('[data-testid="login-button"]');
            
            // Wait for error message
            await page.waitForFunction(() => {
                const statusMessage = document.getElementById('status-message');
                return statusMessage && statusMessage.className.includes('error');
            }, { timeout: 8000 });
            
            // Verify error is displayed
            const errorMessage = await page.evaluate(() => {
                const statusMessage = document.getElementById('status-message');
                return {
                    text: statusMessage.textContent,
                    isError: statusMessage.className.includes('error')
                };
            });
            
            expect(errorMessage.isError).to.be.true;
            expect(errorMessage.text).to.include('failed');
            
            // Verify session info is not shown
            const sessionHidden = await page.evaluate(() => {
                const sessionInfo = document.getElementById('session-info');
                return sessionInfo.style.display === 'none';
            });
            expect(sessionHidden).to.be.true;
            
            console.log('✅ Error handling working correctly');
        });
    });
});