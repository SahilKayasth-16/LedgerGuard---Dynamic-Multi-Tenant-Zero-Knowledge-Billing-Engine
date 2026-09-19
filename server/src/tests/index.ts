import { spawnSync } from 'child_process';
import path from 'path';

const testFiles = [
  'security.test.ts',
  'tenantConnectionManager.test.ts',
  'tenantGateway.test.ts',
  'isolation.test.ts',
  'week1Audit.test.ts',
  'ledger.test.ts',
  'idempotency.test.ts',
  'redisLock.test.ts',
];

console.log(`\n>>> EXECUTING ALL ${testFiles.length} TEST SUITES FOR LEDGERGUARD <<<\n`);

for (const file of testFiles) {
  const filePath = path.join(__dirname, file);
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['tsx', `"${filePath}"`],
    {
      stdio: 'inherit',
      shell: true,
    }
  );

  if (result.status !== 0) {
    console.error(`\n❌ Test suite failed in: ${file}`);
    process.exit(result.status || 1);
  }
}

console.log('\n================================================================');
console.log('🎉 ALL TEST SUITES PASSED SUCCESSFULLY! (87+ ASSERTIONS)');
console.log('================================================================\n');

