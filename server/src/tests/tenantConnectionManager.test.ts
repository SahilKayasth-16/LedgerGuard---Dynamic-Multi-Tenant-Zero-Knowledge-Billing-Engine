import { tenantConnectionManager } from '../services/tenantConnectionManager';
import { config } from '../config/env';

async function runTenantConnectionManagerTests() {
  console.log('=== STARTING DAY 3 TENANT CONNECTION MANAGER TEST SUITE ===\n');

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
    // Cleanup any existing connections first
    await tenantConnectionManager.disconnectAll();

    // TEST 1: Tenant A creates a connection
    const connA1 = await tenantConnectionManager.getTenantConnection('tenant-company-a');
    assert(
      connA1 !== undefined && connA1.readyState === 1,
      'TEST 1: Tenant A creates a healthy Mongoose connection',
      `ReadyState: ${connA1?.readyState}`
    );

    // TEST 2: Tenant A reuses the same connection
    const connA2 = await tenantConnectionManager.getTenantConnection('tenant-company-a');
    assert(
      connA1 === connA2,
      'TEST 2: Tenant A reuses the exact same cached connection instance',
      'connA1 !== connA2'
    );

    // TEST 3: Tenant B gets its own isolated connection
    const connB1 = await tenantConnectionManager.getTenantConnection('tenant-company-b');
    assert(
      connA1 !== connB1 && connB1.readyState === 1,
      'TEST 3: Tenant B gets its own isolated Mongoose connection instance',
      'connA1 === connB1 or connB1 not ready'
    );

    // TEST 4: Tenant isolation (database names strictly separated)
    assert(
      connA1.name === 'ledgerguard_tenant_company_a' && connB1.name === 'ledgerguard_tenant_company_b',
      'TEST 4: Database isolation verified (Tenant A -> ledgerguard_tenant_company_a, Tenant B -> ledgerguard_tenant_company_b)',
      `Got connA name: ${connA1.name}, connB name: ${connB1.name}`
    );

    // TEST 5: Missing / invalid tenant configuration
    let test5Passed = false;
    try {
      await tenantConnectionManager.getTenantConnection('non-existent-tenant');
    } catch (err: any) {
      test5Passed = err.message.includes('Tenant configuration not found');
    }
    assert(
      test5Passed,
      'TEST 5: Missing tenant configuration throws safe error without crashing',
      'Failed to throw expected error for non-existent tenant'
    );

    // TEST 6: Missing MONGODB_URI fails fast (no localhost fallback)
    const originalUri = process.env.MONGODB_URI;
    let test6Passed = false;
    try {
      delete process.env.MONGODB_URI;
      // Accessing config.mongodbUri must fail fast
      const _ = config.mongodbUri;
    } catch (err: any) {
      test6Passed = err.message.includes('MONGODB_URI environment variable is missing');
    } finally {
      process.env.MONGODB_URI = originalUri;
    }
    assert(
      test6Passed,
      'TEST 6: Missing MONGODB_URI fails fast with clear configuration error and NO localhost fallback',
      'Failed to trigger fail-fast error'
    );

    // TEST 7: Concurrent access deduplication
    await tenantConnectionManager.disconnectAll();
    const concurrentPromises = [
      tenantConnectionManager.getTenantConnection('tenant-company-a'),
      tenantConnectionManager.getTenantConnection('tenant-company-a'),
      tenantConnectionManager.getTenantConnection('tenant-company-a'),
    ];
    const [c1, c2, c3] = await Promise.all(concurrentPromises);
    assert(
      c1 === c2 && c2 === c3,
      'TEST 7: Concurrent connection requests for tenant A return the exact same connection promise/instance',
      'Concurrent connections created duplicate instances'
    );

    // TEST 8: Disconnect & Lifecycle cleanup
    await tenantConnectionManager.getTenantConnection('tenant-company-b'); // Ensure B is connected
    await tenantConnectionManager.disconnectTenant('tenant-company-a');

    const statsAfterDisconnect = tenantConnectionManager.getCacheStats();
    assert(
      statsAfterDisconnect.activeConnections === 1 &&
        statsAfterDisconnect.cachedTenants.includes('tenant-company-b') &&
        !statsAfterDisconnect.cachedTenants.includes('tenant-company-a'),
      'TEST 8: disconnectTenant("tenant-company-a") closes connection A and cleans cache without affecting tenant B',
      `Stats after disconnect: ${JSON.stringify(statsAfterDisconnect)}`
    );

    console.log(`\n=== TENANT CONNECTION MANAGER RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  } catch (error: any) {
    console.error('Test suite error:', error);
    failed++;
  } finally {
    await tenantConnectionManager.disconnectAll();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runTenantConnectionManagerTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

