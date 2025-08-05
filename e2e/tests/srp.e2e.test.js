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

describe('SRP Authentication E2E Tests', function() {
    this.timeout(30000); // 30 second timeout for all tests

    let browser;
    let server;
    let serverPort = 3000;

    // Helper function to wait for server to be ready
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
        console.log('🚀 Starting SRP E2E Test Suite');
        
        // Start test server
        console.log('📦 Starting test server...');
        const serverPath = join(__dirname, '..', 'test-server.mjs');
        server = spawn('node', [serverPath], {
            env: { ...process.env, PORT: serverPort },
            stdio: 'pipe'
        });

        // Log server output
        server.stdout.on('data', (data) => {
            if (process.env.DEBUG) {
                console.log(`[SERVER] ${data.toString().trim()}`);
            }
        });

        server.stderr.on('data', (data) => {
            console.error(`[SERVER ERROR] ${data.toString().trim()}`);
        });

        server.on('error', (error) => {
            console.error('Failed to start server:', error);
        });

        // Wait for server to be ready
        await waitForServer(serverPort);
        console.log('✅ Test server ready');

        // Launch Puppeteer
        console.log('🌐 Launching browser...');
        const launchOptions = {
            headless: process.env.HEADED !== 'true',
            slowMo: process.env.SLOW ? 100 : 0,
            devtools: process.env.DEBUG === 'true',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        };
        
        if (process.env.DEBUG) {
            console.log('Browser launch options:', launchOptions);
        }

        browser = await puppeteer.launch(launchOptions);
        console.log('✅ Browser ready');
    });

    after(async function() {
        console.log('🧹 Cleaning up test environment...');
        
        if (browser) {
            await browser.close();
            console.log('✅ Browser closed');
        }
        
        if (server) {
            server.kill('SIGTERM');
            console.log('✅ Server stopped');
        }
    });

    describe('Happy Path Authentication', function() {
        let page;

        beforeEach(async function() {
            page = await browser.newPage();
            
            // Set viewport
            await page.setViewport({ width: 1280, height: 720 });
            
            // Collect console messages
            page.on('console', msg => {
                if (process.env.DEBUG) {
                    console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`);
                }
            });

            // Collect page errors
            page.on('pageerror', error => {
                console.error(`[PAGE ERROR] ${error.message}`);
            });

            // Navigate to test page
            await page.goto(`http://localhost:${serverPort}`, { 
                waitUntil: 'networkidle0' 
            });
        });

        afterEach(async function() {
            if (page) {
                await page.close();
            }
        });

        it('should complete successful SRP authentication', async function() {
            console.log('🔐 Testing successful SRP authentication...');

            // Wait for page to be fully loaded
            await page.waitForSelector('[data-testid="username-input"]');
            await page.waitForSelector('[data-testid="password-input"]');
            await page.waitForSelector('[data-testid="login-button"]');

            // Verify test credentials are pre-filled
            const usernameValue = await page.$eval('[data-testid="username-input"]', el => el.value);
            const passwordValue = await page.$eval('[data-testid="password-input"]', el => el.value);
            
            expect(usernameValue).to.equal('testuser');
            expect(passwordValue).to.equal('password1234');

            // Get initial status
            const initialStatus = await page.$eval('[data-testid="status-message"]', el => el.textContent);
            expect(initialStatus).to.contain('Ready for authentication');

            // Click login button
            console.log('👆 Clicking login button...');
            await page.click('[data-testid="login-button"]');

            // Wait for authentication to complete
            console.log('⏳ Waiting for authentication to complete...');
            await page.waitForFunction(
                () => {
                    const statusEl = document.querySelector('[data-testid="status-message"]');
                    return statusEl && (
                        statusEl.textContent.includes('Authentication successful') ||
                        statusEl.textContent.includes('Authentication failed')
                    );
                },
                { timeout: 15000 }
            );

            // Check final status
            const finalStatus = await page.$eval('[data-testid="status-message"]', el => el.textContent);
            console.log(`📋 Final status: ${finalStatus}`);
            expect(finalStatus).to.contain('Authentication successful');

            // Verify session info is displayed
            const sessionInfo = await page.$eval('[data-testid="session-info"]', el => el.textContent);
            expect(sessionInfo).to.contain('Authentication Successful');
            expect(sessionInfo).to.contain('Username: testuser');
            expect(sessionInfo).to.contain('Session ID:');
            expect(sessionInfo).to.contain('Session Key:');

            // Verify session info is visible
            const sessionInfoVisible = await page.$('[data-testid="session-info"]') !== null;
            expect(sessionInfoVisible).to.be.true;

            console.log('✅ SRP authentication completed successfully');
        });

        it('should display session information correctly', async function() {
            console.log('📊 Testing session information display...');

            // Complete authentication first
            await page.waitForSelector('[data-testid="login-button"]');
            await page.click('[data-testid="login-button"]');

            // Wait for success
            await page.waitForFunction(
                () => document.querySelector('[data-testid="status-message"]')?.textContent.includes('Authentication successful'),
                { timeout: 15000 }
            );

            // Verify session details
            const sessionUsername = await page.$eval(\'#session-username\', el => el.textContent);
            expect(sessionUsername).to.equal('testuser');

            const sessionId = await page.$eval(\'#session-id\', el => el.textContent);
            expect(sessionId).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/); // UUID format

            const sessionKey = await page.$eval(\'#session-key\', el => el.textContent);
            expect(sessionKey).to.have.length.greaterThan(50); // Session key should be substantial

            console.log(`📋 Session ID: ${sessionId.substring(0, 8)}...`);
            console.log(`🔑 Session Key: ${sessionKey.substring(0, 16)}...`);
        });

        it('should measure authentication performance', async function() {
            console.log('⏱️  Testing authentication performance...');

            await page.waitForSelector('[data-testid="login-button"]');

            // Measure authentication time
            const startTime = Date.now();
            await page.click('[data-testid="login-button"]');

            await page.waitForFunction(
                () => document.querySelector('[data-testid="status-message"]')?.textContent.includes('Authentication successful'),
                { timeout: 15000 }
            );

            const endTime = Date.now();
            const authTime = endTime - startTime;

            console.log(`📊 Authentication completed in ${authTime}ms`);
            expect(authTime).to.be.lessThan(5000); // Should complete within 5 seconds

            // Measure memory usage
            const metrics = await page.metrics();
            console.log(`💾 JS Heap Size: ${Math.round(metrics.JSHeapUsedSize / 1024 / 1024)}MB`);
            console.log(`📄 DOM Nodes: ${metrics.Nodes}`);
        });
    });

    describe('Session Management', function() {
        let page;

        beforeEach(async function() {
            page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
            
            page.on('console', msg => {
                if (process.env.DEBUG) {
                    console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`);
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

        it('should support logout functionality', async function() {
            console.log('🚪 Testing logout functionality...');

            // Complete authentication first
            await page.waitForSelector('[data-testid="login-button"]');
            await page.click('[data-testid="login-button"]');

            await page.waitForFunction(
                () => document.querySelector('[data-testid="status-message"]')?.textContent.includes('Authentication successful'),
                { timeout: 15000 }
            );

            // Verify session info is visible
            let sessionInfoVisible = await page.$('[data-testid="session-info"]');
            expect(sessionInfoVisible).to.be.true;

            // Click logout
            await page.waitForSelector('#logout-button');
            await page.click('#logout-button');

            // Wait for logout to complete
            await page.waitForFunction(
                () => document.querySelector('[data-testid="status-message"]')?.textContent.includes('Logged out'),
                { timeout: 5000 }
            );

            // Verify session info is hidden
            sessionInfoVisible = await page.$('[data-testid="session-info"]');
            expect(sessionInfoVisible).to.be.false;

            // Verify form is cleared
            const usernameValue = await page.$eval(\'[data-testid="username-input"]\', el => el.textContent);
            const passwordValue = await page.$eval(\'[data-testid="password-input"]\', el => el.textContent);
            
            expect(usernameValue).to.equal('');
            expect(passwordValue).to.equal('');

            console.log('✅ Logout completed successfully');
        });
    });

    describe('UI State Management', function() {
        let page;

        beforeEach(async function() {
            page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
            await page.goto(`http://localhost:${serverPort}`, { 
                waitUntil: 'networkidle0' 
            });
        });

        afterEach(async function() {
            if (page) {
                await page.close();
            }
        });

        it('should disable login button during authentication', async function() {
            console.log('🔒 Testing login button state management...');

            await page.waitForSelector('[data-testid="login-button"]');

            // Verify button is initially enabled
            const initialDisabled = await page.$eval(\'[data-testid="login-button"]\', el => el.textContent);
            expect(initialDisabled).to.be.false;

            // Start authentication
            await page.click('[data-testid="login-button"]');

            // Check that button becomes disabled quickly
            await page.waitForFunction(
                () => document.querySelector('[data-testid="login-button"]').disabled,
                { timeout: 1000 }
            );

            const duringAuthDisabled = await page.$eval(\'[data-testid="login-button"]\', el => el.textContent);
            expect(duringAuthDisabled).to.be.true;

            // Wait for completion
            await page.waitForFunction(
                () => document.querySelector('[data-testid="status-message"]')?.textContent.includes('Authentication successful'),
                { timeout: 15000 }
            );

            // Verify button is re-enabled
            const finalDisabled = await page.$eval(\'[data-testid="login-button"]\', el => el.textContent);
            expect(finalDisabled).to.be.false;

            console.log('✅ Button state managed correctly during authentication');
        });

        it('should show loading state during authentication', async function() {
            console.log('⏳ Testing loading state display...');

            await page.waitForSelector('[data-testid="login-button"]');

            // Get initial button text
            const initialText = await page.$eval(\'[data-testid="login-button"]\', el => el.textContent);
            expect(initialText).to.contain('Login with SRP');

            // Start authentication
            await page.click('[data-testid="login-button"]');

            // Check for loading state
            await page.waitForFunction(
                () => document.querySelector('[data-testid="login-button"]').textContent.includes('Authenticating'),
                { timeout: 1000 }
            );

            const loadingText = await page.$eval(\'[data-testid="login-button"]\', el => el.textContent);
            expect(loadingText).to.contain('Authenticating');

            // Wait for completion
            await page.waitForFunction(
                () => document.querySelector('[data-testid="status-message"]')?.textContent.includes('Authentication successful'),
                { timeout: 15000 }
            );

            // Verify button text returns to normal
            const finalText = await page.$eval(\'[data-testid="login-button"]\', el => el.textContent);
            expect(finalText).to.contain('Login with SRP');

            console.log('✅ Loading state displayed correctly');
        });
    });
});