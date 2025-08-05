import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('SRP Authentication Error Handling E2E Tests', function() {
    this.timeout(30000);

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
        console.log('🚀 Starting SRP Error Handling E2E Tests');
        
        // Start test server
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

        browser = await puppeteer.launch({
            headless: process.env.HEADED !== 'true',
            slowMo: process.env.SLOW ? 100 : 0,
            devtools: process.env.DEBUG === 'true',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        console.log('✅ Browser ready');
    });

    after(async function() {
        if (browser) {
            await browser.close();
        }
        if (server) {
            server.kill('SIGTERM');
        }
    });

    describe('Authentication Failures', function() {
        let page;

        beforeEach(async function() {
            page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
            
            page.on('console', msg => {
                if (process.env.DEBUG) {
                    console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`);
                }
            });

            page.on('pageerror', error => {
                console.error(`[PAGE ERROR] ${error.message}`);
            });

            await page.goto(`http://localhost:${serverPort}`, { 
                waitUntil: 'networkidle0' 
            });
        });

        afterEach(async function() {
            if (page) {
                // Capture screenshot on test failure
                if (this.currentTest.state === 'failed') {
                    const screenshotPath = join(__dirname, '..', 'screenshots', 
                        `${this.currentTest.title.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.png`);
                    await page.screenshot({ path: screenshotPath, fullPage: true });
                    console.log(`📸 Screenshot saved: ${screenshotPath}`);
                }
                await page.close();
            }
        });

        it('should handle wrong password gracefully', async function() {
            console.log('❌ Testing wrong password handling...');

            await page.waitForSelector('[data-testid="username-input"]');
            
            // Clear and enter wrong password
            await page.fill('[data-testid="username-input"]', 'testuser');
            await page.fill('[data-testid="password-input"]', 'wrongpassword');

            await page.click('[data-testid="login-button"]');

            // Wait for error message
            await page.waitForFunction(
                () => {
                    const statusEl = document.querySelector('[data-testid="status-message"]');
                    return statusEl && statusEl.textContent.includes('Authentication failed');
                },
                { timeout: 15000 }
            );

            const errorStatus = await page.textContent('[data-testid="status-message"]');
            expect(errorStatus).to.contain('Authentication failed');

            // Verify session info is not shown
            const sessionInfoVisible = await page.isVisible('[data-testid="session-info"]');
            expect(sessionInfoVisible).to.be.false;

            // Verify login button is re-enabled
            const buttonDisabled = await page.isDisabled('[data-testid="login-button"]');
            expect(buttonDisabled).to.be.false;

            console.log('✅ Wrong password handled correctly');
        });

        it('should handle non-existent user gracefully', async function() {
            console.log('👤 Testing non-existent user handling...');

            await page.waitForSelector('[data-testid="username-input"]');
            
            // Enter non-existent user
            await page.fill('[data-testid="username-input"]', 'nonexistentuser');
            await page.fill('[data-testid="password-input"]', 'password1234');

            await page.click('[data-testid="login-button"]');

            // Wait for error message
            await page.waitForFunction(
                () => {
                    const statusEl = document.querySelector('[data-testid="status-message"]');
                    return statusEl && statusEl.textContent.includes('User not found');
                },
                { timeout: 15000 }
            );

            const errorStatus = await page.textContent('[data-testid="status-message"]');
            expect(errorStatus).to.contain('User not found');

            // Verify no session created
            const sessionInfoVisible = await page.isVisible('[data-testid="session-info"]');
            expect(sessionInfoVisible).to.be.false;

            console.log('✅ Non-existent user handled correctly');
        });

        it('should validate empty fields', async function() {
            console.log('📝 Testing empty field validation...');

            await page.waitForSelector('[data-testid="username-input"]');
            
            // Clear all fields
            await page.fill('[data-testid="username-input"]', '');
            await page.fill('[data-testid="password-input"]', '');

            await page.click('[data-testid="login-button"]');

            // Wait a moment to see if any request is made
            await page.waitForTimeout(1000);

            // Check status - should show validation error
            const status = await page.textContent('[data-testid="status-message"]');
            expect(status).to.contain('Please enter both username and password');

            console.log('✅ Empty field validation working');
        });

        it('should handle rapid multiple clicks', async function() {
            console.log('🖱️  Testing rapid click protection...');

            await page.waitForSelector('[data-testid="login-button"]');

            // Ensure credentials are filled
            await page.fill('[data-testid="username-input"]', 'testuser');
            await page.fill('[data-testid="password-input"]', 'password1234');

            // Click multiple times rapidly
            console.log('👆 Clicking login button rapidly...');
            await Promise.all([
                page.click('[data-testid="login-button"]'),
                page.click('[data-testid="login-button"]'),
                page.click('[data-testid="login-button"]')
            ]);

            // Wait for authentication to complete
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

            // Should still complete successfully only once
            const finalStatus = await page.textContent('[data-testid="status-message"]');
            expect(finalStatus).to.contain('Authentication successful');

            console.log('✅ Rapid click protection working');
        });
    });

    describe('Network Error Scenarios', function() {
        let page;

        beforeEach(async function() {
            page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
            
            // Enable request interception
            await page.setRequestInterception(true);
            
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

        it('should handle challenge request failure', async function() {
            console.log('🌐 Testing challenge request failure...');

            // Intercept and fail challenge requests
            page.on('request', request => {
                if (request.url().includes('/api/challenge')) {
                    console.log('🚫 Blocking challenge request');
                    request.abort();
                } else {
                    request.continue();
                }
            });

            await page.waitForSelector('[data-testid="login-button"]');
            await page.click('[data-testid="login-button"]');

            // Wait for error message
            await page.waitForFunction(
                () => {
                    const statusEl = document.querySelector('[data-testid="status-message"]');
                    return statusEl && statusEl.textContent.includes('Authentication failed');
                },
                { timeout: 15000 }
            );

            const errorStatus = await page.textContent('[data-testid="status-message"]');
            expect(errorStatus).to.contain('Authentication failed');

            console.log('✅ Challenge request failure handled');
        });

        it('should handle authentication request failure', async function() {
            console.log('🌐 Testing authentication request failure...');

            let challengeRequestSeen = false;
            
            page.on('request', request => {
                if (request.url().includes('/api/challenge')) {
                    challengeRequestSeen = true;
                    request.continue();
                } else if (request.url().includes('/api/authenticate')) {
                    console.log('🚫 Blocking authentication request');
                    request.abort();
                } else {
                    request.continue();
                }
            });

            await page.waitForSelector('[data-testid="login-button"]');
            await page.click('[data-testid="login-button"]');

            // Wait for error message
            await page.waitForFunction(
                () => {
                    const statusEl = document.querySelector('[data-testid="status-message"]');
                    return statusEl && statusEl.textContent.includes('Authentication failed');
                },
                { timeout: 15000 }
            );

            expect(challengeRequestSeen).to.be.true;
            
            const errorStatus = await page.textContent('[data-testid="status-message"]');
            expect(errorStatus).to.contain('Authentication failed');

            console.log('✅ Authentication request failure handled');
        });

        it('should handle slow network responses', async function() {
            console.log('⏱️  Testing slow network handling...');

            page.on('request', request => {
                if (request.url().includes('/api/challenge')) {
                    console.log('🐌 Delaying challenge request');
                    setTimeout(() => request.continue(), 2000); // 2 second delay
                } else {
                    request.continue();
                }
            });

            await page.waitForSelector('[data-testid="login-button"]');
            
            const startTime = Date.now();
            await page.click('[data-testid="login-button"]');

            // Should still complete but take longer
            await page.waitForFunction(
                () => {
                    const statusEl = document.querySelector('[data-testid="status-message"]');
                    return statusEl && (
                        statusEl.textContent.includes('Authentication successful') ||
                        statusEl.textContent.includes('Authentication failed')
                    );
                },
                { timeout: 20000 }
            );

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            console.log(`📊 Authentication completed in ${totalTime}ms with network delay`);
            expect(totalTime).to.be.greaterThan(2000); // Should take at least 2 seconds due to delay

            const finalStatus = await page.textContent('[data-testid="status-message"]');
            expect(finalStatus).to.contain('Authentication successful');

            console.log('✅ Slow network responses handled correctly');
        });
    });

    describe('Browser Compatibility', function() {
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

        it('should not have JavaScript errors in console', async function() {
            console.log('🐛 Testing for JavaScript errors...');

            const errors = [];
            page.on('pageerror', error => {
                errors.push(error.message);
            });

            // Perform authentication to exercise all code paths
            await page.waitForSelector('[data-testid="login-button"]');
            await page.click('[data-testid="login-button"]');

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

            // Check for any JavaScript errors
            expect(errors).to.have.length(0, `JavaScript errors found: ${errors.join(', ')}`);

            console.log('✅ No JavaScript errors detected');
        });

        it('should load all required resources', async function() {
            console.log('📦 Testing resource loading...');

            const failedRequests = [];
            
            page.on('requestfailed', request => {
                failedRequests.push(`${request.method()} ${request.url()} - ${request.failure().errorText}`);
            });

            // Reload page to test all resource loading
            await page.reload({ waitUntil: 'networkidle0' });

            // Check for failed requests
            expect(failedRequests).to.have.length(0, `Failed requests: ${failedRequests.join(', ')}`);

            // Verify critical elements are present
            const hasUsernameInput = await page.$('[data-testid="username-input"]') !== null;
            const hasPasswordInput = await page.$('[data-testid="password-input"]') !== null;
            const hasLoginButton = await page.$('[data-testid="login-button"]') !== null;

            expect(hasUsernameInput).to.be.true;
            expect(hasPasswordInput).to.be.true;
            expect(hasLoginButton).to.be.true;

            console.log('✅ All resources loaded successfully');
        });
    });
});