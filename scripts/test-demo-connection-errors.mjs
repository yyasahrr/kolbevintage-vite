import {test} from 'node:test';
import assert from 'node:assert/strict';
import {describeDemoConnectionError as explain} from './demo-connection-errors.mjs';
test('diagnoses without revealing error details',()=>{
 assert.match(explain({code:'28P01',message:'password authentication failed SECRET'}),/احراز هویت/);
 assert.match(explain({code:'XX000',message:'Tenant or user not found SECRET'}),/پیدا نکرد/);
 assert.match(explain({code:'ENOTFOUND',message:'private-host SECRET'}),/شبکه/);
 assert.match(explain({code:'SELF_SIGNED_CERT_IN_CHAIN',message:'SECRET'}),/TLS.*SELF_SIGNED_CERT_IN_CHAIN/);
 assert(!explain({code:'SECRET_CERT',message:'SECRET'}).includes('SECRET'));
 assert.match(explain({code:'42501',message:'SECRET'}),/مجوز/);
 for(const e of [{code:'XX000',message:'SECRET'},{code:'28P01',message:'SECRET'},{}])assert(!explain(e).includes('SECRET'));
});
