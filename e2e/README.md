# SRP End-to-End Testing

This directory contains comprehensive end-to-end tests for the thinbus-srp ES module implementation using Puppeteer to automate browser testing against a Node.js backend.

## Overview

The E2E testing suite validates the complete SRP authentication flow by:
- Running a Node.js Express server that uses `server.mjs`
- Serving an HTML client that uses `client.mjs`
- Automating browser interactions with Puppeteer
- Verifying the full authentication protocol works correctly

## Architecture

```text
e2e/
├── README.md              # This documentation
├── test-server.mjs        # Express server using server.mjs
├── public/
│   ├── index.html         # Login page with test selectors
│   └── app.js             # Browser SRP client using client.mjs
├── tests/
│   ├── srp.e2e.test.js    # Core authentication scenarios
│   ├── error.e2e.test.js  # Error handling and edge cases
│   └── performance.e2e.test.js # Performance benchmarks
└── screenshots/           # Failure screenshots
```text

## Test Server (test-server.mjs)

### Endpoints

#### POST /api/challenge
**Purpose**: Initialize SRP authentication challenge
**Request**: `{ "username": "testuser" }`
**Response**: `{ "salt": "hex", "B": "hex", "sessionId": "uuid" }`

Starts the SRP authentication process by:
1. Looking up the user's stored salt and verifier
2. Creating a new server session and generating ephemeral value B
3. Storing server state with a unique session ID
4. Returning challenge data to the client

#### POST /api/authenticate
**Purpose**: Verify client proof and complete authentication
**Request**: `{ "sessionId": "uuid", "A": "hex", "M1": "hex" }`
**Response**: `{ "M2": "hex", "success": boolean }`

Completes authentication by:
1. Restoring server session from stored state
2. Verifying the client's proof M1 using ephemeral value A
3. Generating server proof M2 if authentication succeeds
4. Marking session as authenticated

#### GET /api/session/:sessionId
**Purpose**: Check if a session is valid and active
**Response**: `{ "valid": boolean, "username": "string", "sessionKey": "truncated" }`

Validates sessions by checking:
- Session exists and is authenticated
- Session hasn't expired (30 minute timeout)
- Returns truncated session key for verification

#### DELETE /api/session/:sessionId
**Purpose**: Logout and invalidate session
**Response**: `{ "success": boolean }`

#### POST /api/dev/generate-verifier (Development Only)
**Purpose**: Generate verifier for new test users
**Request**: `{ "username": "string", "password": "string", "salt": "optional" }`
**Response**: `{ "username": "string", "salt": "hex", "verifier": "hex" }`

### Test User Data

Pre-configured test user:
- **Username**: `testuser`
- **Password**: `password1234`
- **Salt**: Generated using `client.generateRandomSalt()`
- **Verifier**: Generated using `client.generateVerifier(salt, username, password)`

## Browser Client (public/)

### index.html
Login form with test-friendly selectors:
```html
<input type="text" data-testid="username-input" />
<input type="password" data-testid="password-input" />
<button data-testid="login-button">Login</button>
<div data-testid="status-message"></div>
<div data-testid="session-info"></div>
```text

### app.js
Browser JavaScript that:
1. Imports `client.mjs` as ES module
2. Handles form submission and executes SRP protocol:
   - Calls `/api/challenge` to get salt and B
   - Uses client.mjs to generate A and M1
   - Calls `/api/authenticate` with proof
   - Displays results and session information
3. Updates status messages throughout the process
4. Stores session ID for further API calls

## Test Scenarios

### Happy Path Authentication (srp.e2e.test.js)

```javascript
it('should complete successful SRP authentication', async () => {
  await page.goto('http://localhost:3000');
  await page.type('[data-testid="username-input"]', 'testuser');
  await page.type('[data-testid="password-input"]', 'password1234');
  await page.click('[data-testid="login-button"]');

  await page.waitForSelector('[data-testid="status-message"]');
  const statusText = await page.textContent('[data-testid="status-message"]');
  expect(statusText).toContain('Authentication successful');

  const sessionInfo = await page.textContent('[data-testid="session-info"]');
  expect(sessionInfo).toContain('Session Key:');
});
```text

### Error Handling Tests (error.e2e.test.js)

**Wrong Password Test**:
- Enter invalid password
- Verify authentication fails with appropriate error message
- Ensure no session is created

**Non-existent User Test**:
- Enter non-existent username
- Verify challenge request fails appropriately

**Network Failure Simulation**:
- Intercept and fail network requests
- Verify graceful error handling
- Test timeout scenarios

**Rapid Click Protection**:
- Click login button multiple times rapidly
- Verify only one authentication attempt occurs
- Test UI state during processing

### Performance Tests (performance.e2e.test.js)

**Authentication Timing**:
```javascript
it('should complete authentication within 2 seconds', async () => {
  const startTime = Date.now();
  // ... perform authentication ...
  const endTime = Date.now();
  expect(endTime - startTime).toBeLessThan(2000);
});
```text

**Memory Monitoring**:
- Track JS heap size during authentication
- Verify no memory leaks after multiple authentications
- Monitor DOM node count

## Running Tests

### NPM Scripts

```json
{
  "test:integration": "npm run test:e2e",
  "test:e2e": "mocha e2e/tests/*.e2e.test.js --timeout 30000",
  "test:e2e:headed": "HEADED=true npm run test:e2e",
  "test:e2e:debug": "DEBUG=true npm run test:e2e",
  "test:e2e:slow": "SLOW=true npm run test:e2e"
}
```text

### Environment Variables

- `HEADED=true`: Run with visible browser (default: headless)
- `DEBUG=true`: Enable DevTools and additional logging
- `SLOW=true`: Add 100ms delay between actions for debugging
- `PORT=3001`: Use different port for test server

### Command Examples

```bash
# Run all E2E tests headless
npm run test:integration

# Run with visible browser for debugging
HEADED=true npm run test:integration

# Run specific test file
npx mocha e2e/tests/srp.e2e.test.js --timeout 30000

# Debug mode with DevTools
DEBUG=true HEADED=true npm run test:integration
```text

## Debugging Failed Tests

### Screenshot Analysis
When tests fail, screenshots are automatically captured to `e2e/screenshots/`:
- `test-name-YYYY-MM-DD-HH-mm-ss.png`
- Shows exact browser state at failure point

### Console Output
Tests capture and display:
- Browser console messages (errors, warnings, logs)
- Network request/response details
- Server-side logs correlated with test actions

### Common Debugging Steps

1. **Check screenshot**: `ls e2e/screenshots/` for latest failure image
2. **Run in headed mode**: `HEADED=true npm run test:e2e` to see browser
3. **Add debug breakpoint**: `await page.evaluate(() => debugger);`
4. **Check server logs**: Look for authentication flow in console output
5. **Verify timing**: Use `SLOW=true` to slow down actions

### Common Issues and Solutions

**Element not found**:
```javascript
// Problem: Element not ready
await page.click('[data-testid="login-button"]');

// Solution: Wait for element
await page.waitForSelector('[data-testid="login-button"]');
await page.click('[data-testid="login-button"]');
```text

**Timing issues**:
```javascript
// Problem: Action happens before page ready
await page.goto('http://localhost:3000');
await page.type('[data-testid="username-input"]', 'testuser');

// Solution: Wait for network idle
await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
await page.type('[data-testid="username-input"]', 'testuser');
```text

**Authentication failures**:
- Check test user credentials match server expectations
- Verify server.mjs and client.mjs are using same SRP parameters
- Look for crypto import issues in browser console

## Performance Benchmarks

### Target Metrics
- **Total authentication time**: < 2 seconds
- **Challenge request**: < 200ms
- **Authentication request**: < 500ms
- **Browser memory growth**: < 10MB during authentication

### Monitoring
Performance tests track:
- Request timing breakdown
- JavaScript heap size before/after
- DOM node count
- Event listener count
- Network timing details

## Security Considerations

### Test Data
- Uses dedicated test credentials, not production data
- Test verifier generated specifically for E2E environment
- Sessions automatically expire after 30 minutes

### Network Security
- Server only listens on localhost during tests
- No real user data exposed
- Test database isolated from production

### Browser Security
- Puppeteer runs in sandboxed environment
- No persistent browser data
- Screenshots don't capture sensitive information

## Integration with CI/CD

### GitHub Actions Example
```yaml
- name: Run E2E Tests
  run: |
    npm run build-es
    npm run build-server
    npm run test:integration
  env:
    CI: true
```text

### Test Results
- JUnit XML output for CI integration
- Coverage reports for browser JavaScript
- Performance metrics logged as artifacts

## Development Workflow

### Adding New Tests
1. Create test file in `e2e/tests/` with `.e2e.test.js` suffix
2. Use existing test structure and helper functions
3. Add data-testid attributes to HTML for new UI elements
4. Update this README with new test scenarios

### Updating Test Data
1. Use `/api/dev/generate-verifier` endpoint to create new users
2. Update `testUsers` object in `test-server.mjs`
3. Ensure client and server use matching SRP parameters

### Local Development
1. Start test server: `node e2e/test-server.mjs`
2. Open browser to `http://localhost:3000`
3. Test authentication manually before writing automated tests
4. Use browser DevTools to inspect network requests and console output

This comprehensive E2E testing suite ensures the SRP ES module implementation works correctly across different browsers and handles edge cases appropriately.