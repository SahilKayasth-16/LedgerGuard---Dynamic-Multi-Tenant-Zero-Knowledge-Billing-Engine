import http from 'http';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import app from '../app';
import { generateAccessToken } from '../utils/jwt';
import { generateRsaKeyPair } from '../utils/generateKeys';

// Helper for making HTTP requests to test server
const request = (
  server: http.Server,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: any
): Promise<{ status: number; body: any }> => {
  return new Promise((resolve, reject) => {
    const address = server.address() as { port: number };
    const payload = body ? JSON.stringify(body) : undefined;

    const req = http.request(
      {
        host: '127.0.0.1',
        port: address.port,
        method,
        path,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload).toString() } : {}),
          ...headers,
        },
      },
      (res) => {
        let responseData = '';
        res.on('data', (chunk) => (responseData += chunk));
        res.on('end', () => {
          try {
            const parsed = responseData ? JSON.parse(responseData) : {};
            resolve({ status: res.statusCode || 500, body: parsed });
          } catch (e) {
            resolve({ status: res.statusCode || 500, body: responseData });
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
};

async function runSecurityTests() {
  console.log('=== STARTING DAY 2 SECURITY TEST SUITE ===\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  try {
    // TEST A: Valid RS256 JWT
    const validToken = generateAccessToken({
      userId: 'user-company-a',
      tenantId: 'tenant-company-a',
      role: 'ADMIN',
    });

    const resA = await request(server, 'GET', '/api/auth/me', {
      Authorization: `Bearer ${validToken}`,
    });

    assert(
      resA.status === 200 &&
        resA.body.success === true &&
        resA.body.user?.tenantId === 'tenant-company-a' &&
        resA.body.user?.userId === 'user-company-a',
      'Test A: Valid RS256 JWT returns 200 OK with verified identity',
      `Got status ${resA.status}, body: ${JSON.stringify(resA.body)}`
    );

    // TEST B: No JWT (Missing Authorization header)
    const resB = await request(server, 'GET', '/api/auth/me');
    assert(
      resB.status === 401 && resB.body.success === false,
      'Test B: Missing JWT returns 401 Unauthorized',
      `Got status ${resB.status}`
    );

    // TEST C: Modified / Tampered JWT Payload
    const tokenParts = validToken.split('.');
    // Tamper with payload segment
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: 'user-company-a', tenantId: 'tenant-company-b', role: 'ADMIN' })
    ).toString('base64url');
    const tamperedToken = `${tokenParts[0]}.${tamperedPayload}.${tokenParts[2]}`;

    const resC = await request(server, 'GET', '/api/auth/me', {
      Authorization: `Bearer ${tamperedToken}`,
    });
    assert(
      resC.status === 401 && resC.body.success === false,
      'Test C: Tampered JWT payload returns 401 Unauthorized',
      `Got status ${resC.status}`
    );

    // TEST D: Wrong Signing Key
    const { privateKey: wrongPrivateKey } = generateRsaKeyPair();
    const wrongKeyToken = generateAccessToken({
      userId: 'user-company-a',
      tenantId: 'tenant-company-a',
      role: 'ADMIN',
      privateKeyOverride: wrongPrivateKey,
    });

    const resD = await request(server, 'GET', '/api/auth/me', {
      Authorization: `Bearer ${wrongKeyToken}`,
    });
    assert(
      resD.status === 401 && resD.body.success === false,
      'Test D: JWT signed with wrong RSA private key returns 401 Unauthorized',
      `Got status ${resD.status}`
    );

    // TEST E: Wrong Algorithm (HS256 attempt)
    const hs256Token = jwt.sign(
      { sub: 'user-company-a', tenantId: 'tenant-company-a', role: 'ADMIN' },
      'secret-key-123',
      { algorithm: 'HS256' }
    );

    const resE = await request(server, 'GET', '/api/auth/me', {
      Authorization: `Bearer ${hs256Token}`,
    });
    assert(
      resE.status === 401 && resE.body.success === false,
      'Test E: JWT using non-RS256 algorithm (HS256) returns 401 Unauthorized',
      `Got status ${resE.status}`
    );

    // TEST F: Expired JWT
    const expiredToken = generateAccessToken({
      userId: 'user-company-a',
      tenantId: 'tenant-company-a',
      role: 'ADMIN',
      expiresIn: '-1s',
    });

    const resF = await request(server, 'GET', '/api/auth/me', {
      Authorization: `Bearer ${expiredToken}`,
    });
    assert(
      resF.status === 401 && resF.body.success === false,
      'Test F: Expired JWT returns 401 Unauthorized',
      `Got status ${resF.status}`
    );

    // TEST G: Tenant Override Attempt
    const resG = await request(
      server,
      'GET',
      '/api/auth/me',
      {
        Authorization: `Bearer ${validToken}`,
      },
      { tenantId: 'tenant-company-b' }
    );

    assert(
      resG.status === 200 &&
        resG.body.user?.tenantId === 'tenant-company-a' &&
        resG.body.user?.tenantId !== 'tenant-company-b',
      'Test G: Tenant override attempt in request body cannot alter verified JWT tenant identity',
      `Expected tenant-company-a, got ${resG.body.user?.tenantId}`
    );

    console.log(`\n=== SECURITY TEST RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  } finally {
    server.close();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTests().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});
