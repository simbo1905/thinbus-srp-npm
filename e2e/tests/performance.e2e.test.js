import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('SRP Authentication Performance E2E Tests', function() {
    this.timeout(60000); // Extended timeout for performance tests

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
        console.log('🚀 Starting SRP Performance E2E Tests');
        
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
            slowMo: 0, // No slow motion for performance tests
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

    describe('Authentication Timing', function() {
        let page;

        beforeEach(async function() {
            page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
            
            page.on('console', msg => {
                if (process.env.DEBUG && msg.type() === 'error') {
                    console.log(`[BROWSER ERROR] ${msg.text()}`);
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

        it('should complete authentication within performance targets', async function() {
            console.log('⏱️  Testing authentication timing...');

            await page.waitForSelector('[data-testid="login-button"]');

            // Measure total authentication time
            const startTime = Date.now();
            await page.click('[data-testid="login-button"]');

            await page.waitForFunction(
                () => document.querySelector('[data-testid="status-message"]')?.textContent.includes('Authentication successful'),
                { timeout: 20000 }
            );

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            console.log(`📊 Total authentication time: ${totalTime}ms`);
            
            // Performance targets
            expect(totalTime).to.be.lessThan(5000, 'Authentication should complete within 5 seconds');
            
            // Log performance bracket
            if (totalTime < 1000) {
                console.log('🚀 Excellent performance: < 1 second');
            } else if (totalTime < 2000) {
                console.log('✅ Good performance: < 2 seconds');
            } else if (totalTime < 5000) {
                console.log('⚠️  Acceptable performance: < 5 seconds');
            }
        });

        it('should measure individual request timing', async function() {
            console.log('🌐 Testing individual request performance...');

            const requestTimings = [];

            // Intercept requests to measure timing
            await page.setRequestInterception(true);
            page.on('request', request => {
                request.continue();
            });

            page.on('response', response => {
                const timing = response.timing();
                const url = response.url();
                
                if (url.includes('/api/challenge') || url.includes('/api/authenticate')) {
                    const totalTime = timing.receiveHeadersEnd - timing.requestTime;
                    requestTimings.push({
                        url: url.split('/').pop(),
                        time: Math.round(totalTime)
                    });
                    console.log(`📡 ${url.split('/').pop()}: ${Math.round(totalTime)}ms`);
                }
            });

            await page.waitForSelector('[data-testid="login-button"]');
            await page.click('[data-testid="login-button"]');

            await page.waitForFunction(
                () => document.querySelector('[data-testid="status-message"]')?.textContent.includes('Authentication successful'),
                { timeout: 15000 }
            );

            // Analyze request timings
            expect(requestTimings).to.have.length.greaterThan(0);
            
            const challengeRequest = requestTimings.find(r => r.url === 'challenge');
            const authRequest = requestTimings.find(r => r.url === 'authenticate');

            if (challengeRequest) {
                console.log(`🏃 Challenge request: ${challengeRequest.time}ms`);
                expect(challengeRequest.time).to.be.lessThan(1000, 'Challenge request should be < 1 second');
            }

            if (authRequest) {
                console.log(`🔐 Authentication request: ${authRequest.time}ms`);
                expect(authRequest.time).to.be.lessThan(2000, 'Authentication request should be < 2 seconds');
            }
        });

        it('should benchmark consecutive authentications', async function() {
            console.log('🔄 Testing consecutive authentication performance...');

            const authTimes = [];
            const numTests = 3;

            for (let i = 0; i < numTests; i++) {
                console.log(`📊 Running authentication test ${i + 1}/${numTests}...`);

                // Reset form if needed
                await page.reload({ waitUntil: 'networkidle0' });
                await page.waitForSelector('[data-testid="login-button"]');

                const startTime = Date.now();
                await page.click('[data-testid="login-button"]');

                await page.waitForFunction(
                    () => document.querySelector('[data-testid="status-message"]')?.textContent.includes('Authentication successful'),
                    { timeout: 15000 }
                );

                const endTime = Date.now();
                const authTime = endTime - startTime;
                authTimes.push(authTime);

                console.log(`   Authentication ${i + 1}: ${authTime}ms`);

                // Wait a moment between tests
                await page.waitForTimeout(500);
            }

            // Calculate statistics
            const avgTime = authTimes.reduce((a, b) => a + b, 0) / authTimes.length;
            const minTime = Math.min(...authTimes);
            const maxTime = Math.max(...authTimes);

            console.log(`📈 Performance Statistics:`);
            console.log(`   Average: ${Math.round(avgTime)}ms`);
            console.log(`   Minimum: ${minTime}ms`);
            console.log(`   Maximum: ${maxTime}ms`);

            // Performance assertions
            expect(avgTime).to.be.lessThan(5000, 'Average authentication time should be < 5 seconds');
            expect(maxTime).to.be.lessThan(8000, 'Maximum authentication time should be < 8 seconds');
            
            // Consistency check - max shouldn't be more than 3x min
            const consistency = maxTime / minTime;
            expect(consistency).to.be.lessThan(3, `Performance should be consistent (max/min ratio: ${consistency.toFixed(2)})`);
        });
    });

    describe('Memory and Resource Usage', function() {
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

        it('should monitor memory usage during authentication', async function() {
            console.log('💾 Testing memory usage...');

            // Get baseline metrics
            const baselineMetrics = await page.metrics();
            console.log(`📊 Baseline JS Heap: ${Math.round(baselineMetrics.JSHeapUsedSize / 1024 / 1024)}MB`);
            console.log(`📊 Baseline DOM Nodes: ${baselineMetrics.Nodes}`);

            await page.waitForSelector('[data-testid="login-button"]');
            await page.click('[data-testid="login-button"]');

            await page.waitForFunction(
                () => document.querySelector('[data-testid="status-message"]')?.textContent.includes('Authentication successful'),
                { timeout: 15000 }
            );

            // Get post-authentication metrics
            const finalMetrics = await page.metrics();
            console.log(`📊 Final JS Heap: ${Math.round(finalMetrics.JSHeapUsedSize / 1024 / 1024)}MB`);
            console.log(`📊 Final DOM Nodes: ${finalMetrics.Nodes}`);

            // Calculate changes
            const heapIncrease = finalMetrics.JSHeapUsedSize - baselineMetrics.JSHeapUsedSize;
            const nodeIncrease = finalMetrics.Nodes - baselineMetrics.Nodes;

            console.log(`📈 Heap increase: ${Math.round(heapIncrease / 1024 / 1024)}MB`);
            console.log(`📈 Node increase: ${nodeIncrease} nodes`);

            // Memory usage assertions
            expect(heapIncrease).to.be.lessThan(50 * 1024 * 1024, 'Heap increase should be < 50MB');
            expect(finalMetrics.JSHeapUsedSize).to.be.lessThan(100 * 1024 * 1024, 'Total heap should be < 100MB');
            
            // DOM node count should remain reasonable
            expect(finalMetrics.Nodes).to.be.lessThan(1000, 'Total DOM nodes should be < 1000');
        });

        it('should test memory stability over multiple authentications', async function() {
            console.log('🔄 Testing memory stability...');

            const heapSizes = [];
            const numIterations = 5;

            for (let i = 0; i < numIterations; i++) {
                console.log(`🔄 Memory test iteration ${i + 1}/${numIterations}...`);

                // Reset page
                await page.reload({ waitUntil: 'networkidle0' });
                await page.waitForSelector('[data-testid="login-button"]');

                // Perform authentication
                await page.click('[data-testid="login-button"]');
                await page.waitForFunction(
                    () => document.querySelector('[data-testid="status-message"]')?.textContent.includes('Authentication successful'),
                    { timeout: 15000 }
                );

                // Force garbage collection if available
                try {
                    await page.evaluate(() => {
                        if (window.gc) {
                            window.gc();
                        }
                    });
                } catch (e) {
                    // GC not available, that's ok
                }

                // Measure memory
                const metrics = await page.metrics();
                const heapMB = Math.round(metrics.JSHeapUsedSize / 1024 / 1024);
                heapSizes.push(heapMB);
                
                console.log(`   Iteration ${i + 1}: ${heapMB}MB heap`);

                await page.waitForTimeout(1000); // Brief pause between iterations
            }

            // Analyze memory stability
            const avgHeap = heapSizes.reduce((a, b) => a + b, 0) / heapSizes.length;
            const maxHeap = Math.max(...heapSizes);
            const minHeap = Math.min(...heapSizes);

            console.log(`📊 Memory Stability:`);
            console.log(`   Average: ${avgHeap}MB`);
            console.log(`   Range: ${minHeap}MB - ${maxHeap}MB`);
            console.log(`   Variation: ${Math.round(((maxHeap - minHeap) / avgHeap) * 100)}%`);

            // Memory should remain stable (< 50% variation)
            const variation = (maxHeap - minHeap) / avgHeap;
            expect(variation).to.be.lessThan(0.5, `Memory usage should be stable (variation: ${Math.round(variation * 100)}%)`);
            
            // No significant memory leaks
            expect(maxHeap).to.be.lessThan(avgHeap * 1.5, 'Memory usage should not grow significantly');
        });

        it('should monitor event listener count', async function() {
            console.log('🎧 Testing event listener management...');

            // Get baseline listener count
            const baselineListeners = await page.evaluate(() => {
                return window.getEventListeners ? 
                    Object.keys(window.getEventListeners(document)).length : 
                    0; // Fallback if getEventListeners not available
            });

            await page.waitForSelector('[data-testid="login-button"]');

            // Perform authentication
            await page.click('[data-testid="login-button"]');
            await page.waitForFunction(
                () => document.querySelector('[data-testid="status-message"]')?.textContent.includes('Authentication successful'),
                { timeout: 15000 }
            );

            // Get final listener count
            const finalListeners = await page.evaluate(() => {
                return window.getEventListeners ? 
                    Object.keys(window.getEventListeners(document)).length : 
                    0;
            });

            console.log(`🎧 Event listeners - Baseline: ${baselineListeners}, Final: ${finalListeners}`);

            // Event listeners shouldn't grow significantly
            const listenerIncrease = finalListeners - baselineListeners;
            expect(listenerIncrease).to.be.lessThan(10, `Event listener count should not grow significantly (increase: ${listenerIncrease})`);
        });
    });

    describe('Network Performance', function() {
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

        it('should measure network request sizes', async function() {
            console.log('📡 Testing network request sizes...');

            const requestSizes = [];
            const responseSizes = [];

            await page.setRequestInterception(true);
            
            page.on('request', request => {
                if (request.url().includes('/api/')) {
                    const postData = request.postData();
                    if (postData) {
                        requestSizes.push({
                            url: request.url().split('/').pop(),
                            size: postData.length
                        });
                        console.log(`📤 ${request.url().split('/').pop()} request: ${postData.length} bytes`);
                    }
                }
                request.continue();
            });

            page.on('response', async response => {
                if (response.url().includes('/api/')) {
                    try {
                        const responseText = await response.text();
                        responseSizes.push({
                            url: response.url().split('/').pop(),
                            size: responseText.length
                        });
                        console.log(`📥 ${response.url().split('/').pop()} response: ${responseText.length} bytes`);
                    } catch (e) {
                        // Ignore errors reading response
                    }
                }
            });

            await page.waitForSelector('[data-testid="login-button"]');
            await page.click('[data-testid="login-button"]');

            await page.waitForFunction(
                () => document.querySelector('[data-testid="status-message"]')?.textContent.includes('Authentication successful'),
                { timeout: 15000 }
            );

            // Analyze request/response sizes
            const totalRequestSize = requestSizes.reduce((sum, req) => sum + req.size, 0);
            const totalResponseSize = responseSizes.reduce((sum, res) => sum + res.size, 0);

            console.log(`📊 Total request size: ${totalRequestSize} bytes`);
            console.log(`📊 Total response size: ${totalResponseSize} bytes`);

            // Size expectations (SRP involves large numbers, so expect kilobytes not bytes)
            expect(totalRequestSize).to.be.lessThan(10000, 'Total request size should be < 10KB');
            expect(totalResponseSize).to.be.lessThan(10000, 'Total response size should be < 10KB');
        });

        it('should test with simulated slow network', async function() {
            console.log('🐌 Testing with simulated slow network...');

            // Simulate slow 3G connection
            await page.emulateNetworkConditions({
                offline: false,
                downloadThroughput: 500 * 1024 / 8, // 500 Kbps
                uploadThroughput: 500 * 1024 / 8,   // 500 Kbps
                latency: 400 // 400ms latency
            });

            await page.waitForSelector('[data-testid="login-button"]');

            const startTime = Date.now();
            await page.click('[data-testid="login-button"]');

            await page.waitForFunction(
                () => document.querySelector('[data-testid="status-message"]')?.textContent.includes('Authentication successful'),
                { timeout: 30000 } // Extended timeout for slow network
            );

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            console.log(`📊 Authentication on slow network: ${totalTime}ms`);

            // Should still complete, but will take longer
            expect(totalTime).to.be.greaterThan(2000, 'Should take longer on slow network');
            expect(totalTime).to.be.lessThan(20000, 'Should still complete within 20 seconds');
        });
    });
});