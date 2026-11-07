import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const env={...process.env,NODE_ENV:'production',PANEL_OPEN_ACCESS:'1',DATABASE_URL:'',PUBLIC_BASE_URL:'',BACKUP_CLOUD_ENDPOINT:'',BACKUP_CLOUD_TOKEN:'',SUPERADMIN_PASSCODE:'sensitive-test-secret'};
const result=spawnSync(process.execPath,['scripts/production-check.mjs'],{env,encoding:'utf8'});
assert.equal(result.status,1);assert.ok(!result.stdout.includes(env.SUPERADMIN_PASSCODE),'preflight must not print secrets');
const report=JSON.parse(result.stdout);assert.equal(report.ready,false);
for(const id of ['review_mode','payment_provider','customer_registration','outbox_delivery','media_storage','restore_rehearsal']) assert.equal(report.checks.find(c=>c.id===id)?.status,'blocker',id);
console.log('Production preflight correctly rejects incomplete configuration without exposing secrets');
