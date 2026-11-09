import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDemoUri, PROJECT_REF } from './demo-connection-uri.mjs';

const host = 'aws-0-eu-west-1.pooler.supabase.com';
const uri = `postgresql://postgres.${PROJECT_REF}:[YOUR-PASSWORD]@${host}:5432/postgres`;
test('accepts URI, copied psql command, and direct project URI', () => {
  assert.deepEqual(parseDemoUri(uri), {host, port: 5432, user: `postgres.${PROJECT_REF}`});
  assert.deepEqual(parseDemoUri(`psql '${uri}'`), parseDemoUri(uri));
  assert.deepEqual(parseDemoUri(`DATABASE_URL="${uri}?sslmode=disable"`), parseDemoUri(uri));
  assert.equal(parseDemoUri(`postgresql://postgres:[YOUR-PASSWORD]@db.${PROJECT_REF}.supabase.co:5432/postgres`).user, 'postgres');
});
test('rejects unsuitable inputs with non-sensitive reasons', () => {
  assert.throws(() => parseDemoUri('not a URI'), {message: 'invalid_uri'});
  assert.throws(() => parseDemoUri(uri.replace('5432', '6543')), {message: 'wrong_port'});
  assert.throws(() => parseDemoUri(uri.replace(PROJECT_REF, 'differentproject')), {message: 'wrong_user'});
  assert.throws(() => parseDemoUri(uri.replace(host, 'example.com')), {message: 'wrong_host'});
  assert.throws(() => parseDemoUri(uri.replace(/\/postgres$/, '/other')), {message: 'wrong_database'});
});
