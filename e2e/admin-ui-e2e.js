const { spawn } = require('node:child_process');
const path = require('node:path');

const PROJECT_DIR = path.resolve(__dirname, '..');
const PORT = '3024';
const BASE_URL = `http://localhost:${PORT}`;
const ADMIN_TOKEN = 'e2e-admin-ui-token-xyz';

let pass = 0;
let fail = 0;

function log(label, ok, detail) {
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`  [${status}] ${label}${detail ? ' -- ' + detail : ''}`);
  if (ok) pass++; else fail++;
}

async function waitForServer(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return true;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function run() {
  console.log('Admin UI E2E against ' + BASE_URL);
  console.log('Starting server...');

  const server = spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', PORT], {
    cwd: PROJECT_DIR,
    stdio: 'ignore',
    env: { ...process.env, LAUNCHLENS_ADMIN_TOKENS: ADMIN_TOKEN },
  });

  const ready = await waitForServer();
  if (!ready) {
    console.error('Failed to start server.');
    process.exit(2);
  }
  console.log('Server ready.');

  try {
    console.log('\n[1] Admin page renders (unauthenticated)');

    const pageRes = await fetch(`${BASE_URL}/admin`);
    log('Admin page returns 200', pageRes.ok, `status=${pageRes.status}`);
    const html = await pageRes.text();
    log('Page has Admin Console heading', html.includes('Admin Console'));
    log('Page has Sign in button (logged out)', html.includes('Sign in'));
    log('Page has token input field', html.includes('admin-token-input'));

    console.log('\n[2] Admin API endpoints accessible');

    const tokensRes = await fetch(`${BASE_URL}/api/admin/tokens`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    log('Admin tokens API accessible', tokensRes.ok, `status=${tokensRes.status}`);

    const alertsRes = await fetch(`${BASE_URL}/api/admin/alerts`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    log('Admin alerts API accessible', alertsRes.ok, `status=${alertsRes.status}`);

    const auditRes = await fetch(`${BASE_URL}/api/admin/audit`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    log('Admin audit API accessible', auditRes.ok, `status=${auditRes.status}`);

    console.log('\n[3] Admin page resources');
    log('Page has admin-login CSS class', html.includes('admin-login'));

    console.log('\n' + '='.repeat(50));
    console.log(`${pass} passed, ${fail} failed`);
    process.exitCode = fail === 0 ? 0 : 1;
  } catch (err) {
    console.error('Admin UI E2E crashed:', err.message);
    console.error(err.stack);
    process.exit(2);
  } finally {
    server.kill();
  }
}

run();