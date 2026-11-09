// Creates and drops a new local database. Never run this against a real store.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import pg from 'pg';
if(process.env.LOCAL_DB_ISOLATION_TEST!=='1'||process.env.DATABASE_URL)throw Error('Requires LOCAL_DB_ISOLATION_TEST=1 and local embedded PostgreSQL only');
const name='kv_isolation_'+randomBytes(6).toString('hex');
const uploads=await mkdtemp(path.join(os.tmpdir(),'kv-schema-uploads-'));
const admin=new pg.Client({host:'127.0.0.1',port:Number(process.env.PGPORT??55432),user:process.env.PGUSER??'kolbe',password:process.env.PGPASSWORD??'kolbe',database:'postgres'});
await admin.connect();let client;let db;
try{
 await admin.query(`create database "${name}"`);
 client=new pg.Client({host:'127.0.0.1',port:Number(process.env.PGPORT??55432),user:process.env.PGUSER??'kolbe',password:process.env.PGPASSWORD??'kolbe',database:name});await client.connect();
 await client.query("create schema demo_separate; create table public.products(marker text); insert into public.products values ('unchanged'); create table public.only_public (marker text); insert into public.only_public values ('secret')");
 process.env.PGDATABASE=name;process.env.DATABASE_SCHEMA='demo_separate';process.env.PANEL_OPEN_ACCESS='1';process.env.UPLOADS_DIR=uploads;process.env.LOG_LEVEL='silent';
 db=await import('../server/src/db.ts');await db.initDb();
 await db.withTransaction(async tx=>{await tx.query('set transaction isolation level repeatable read read only');const r=await tx.query('show transaction_isolation');assert.equal(r.rows[0].transaction_isolation,'repeatable read');});
 const resolved=await db.query('select current_schema() as schema');assert.equal(resolved.rows[0].schema,'demo_separate');
 await db.query("insert into state_documents(key,value) values('test','{}'::jsonb)");
 await assert.rejects(db.query('select * from only_public'),/does not exist/);
 await assert.rejects(db.withTransaction(async tx=>{await tx.query("insert into state_documents(key,value) values('rollback','{}'::jsonb)");throw Error('rollback-test')}),/rollback-test/);
 assert.equal((await db.query("select count(*)::int n from state_documents where key='rollback'")).rows[0].n,0);
 await (await import('../server/src/seed.ts')).seedDatabase();
 const app=await (await import('../server/src/index.ts')).buildServer();
 try {assert.equal((await app.inject({method:'GET',url:'/api/admin/backups'})).statusCode,503);assert.equal((await app.inject({method:'GET',url:'/api/bootstrap'})).statusCode,200);assert((await app.inject({method:'GET',url:'/api/products'})).json().length>0)} finally {await app.close()}
 const backup=await import('../server/src/backup.ts');await assert.rejects(backup.dumpAll(),/پشتیبان‌گیری/);await assert.rejects(backup.createBackup(),/پشتیبان‌گیری/);await assert.rejects(backup.restoreBackup('/this/file/does/not/exist'),/پشتیبان‌گیری/);
 assert.deepEqual((await client.query('select * from public.products')).rows,[{marker:'unchanged'}]);
 const missing=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',"import {initDb} from './server/src/db.ts'; try {await initDb();process.exit(1)} catch(e) {if(!e.message.includes('DATABASE_SCHEMA')) process.exit(2)}"],{env:{...process.env,DATABASE_SCHEMA:'does_not_exist'},encoding:'utf8',timeout:20000});assert.equal(missing.status,0,missing.stderr);
 const invalid=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',"import './server/src/db.ts'"],{env:{...process.env,DATABASE_SCHEMA:'public'},encoding:'utf8',timeout:20000});assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/DATABASE_SCHEMA/);
 console.log('Schema migration, public isolation, transaction rollback and fail-closed validation OK');
}finally{await db?.closeDb();await client?.end();await admin.query(`drop database if exists "${name}"`);await admin.end();await rm(uploads,{recursive:true,force:true})}
