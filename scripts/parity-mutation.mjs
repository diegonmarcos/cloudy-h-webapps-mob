#!/usr/bin/env node
// Proves the parity test is not blind (#1958): runs it with PARITY_MUTATE=1 (the App page "drops" a tile, the site loses an app,
// a route and a Cloud page) and exits 0 ONLY when that run is RED. Run after `npm ci`.
import { spawnSync } from 'node:child_process';
const r = spawnSync('npx', ['vitest', 'run', 'scripts/webapps-parity.test.ts'], { env: { ...process.env, PARITY_MUTATE: '1' }, encoding: 'utf8' });
if (r.status === 0) { console.error('FAIL: the mutated parity run was GREEN, the guard is blind'); process.exit(1); }
if (!/lost without a declared reason|differs|Cloud page/.test(r.stdout + r.stderr)) { console.error('FAIL: red for the wrong reason\n' + (r.stdout + r.stderr).slice(-1500)); process.exit(1); }
console.log('ok: parity mutation is RED as required');
