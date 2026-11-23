import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,steps,transition,THRESHOLD,SCENARIOS} from './sandbox-state.mjs';

const reg={type:'REGISTER',accountId:'DEMO_1001',email:'tester@example.test'};
function registered(){return transition(fresh(),reg);}
test('only first step is unlocked initially',()=>{
 assert.deepEqual(steps(fresh()).map(x=>x.status),['available','locked','locked','locked']);
});
test('registration rejects real email domains and unsafe account identifiers',()=>{
 for(const email of ['john@gmail.com','real@example.com','missing@','<script>@example.test']){
  assert.equal(transition(fresh(),{...reg,email}).flags[0],false);
 }
 assert.equal(transition(fresh(),{...reg,accountId:'../admin'}).flags[0],false);
});
test('registration unlocks Deposit and preserves fake identity',()=>{
 const s=registered();assert.equal(s.flags[0],true);
 assert.equal(s.email,'tester@example.test');
 assert.deepEqual(steps(s).map(x=>x.status),['completed','available','locked','locked']);
});
test('locked stages cannot be approved out of order',()=>{
 const initial=fresh();
 assert.equal(transition(initial,{type:'DEPOSIT'}).flags[1],false);
 assert.equal(transition(initial,{type:'CONNECT'}).flags[2],false);
 assert.equal(transition(initial,{type:'ACTIVATE'}).flags[3],false);
});
for(const [key,status] of [
 ['LOW','INSUFFICIENT_BALANCE'],
 ['PARTNER','BROKER_PARTNER_MISMATCH'],
 ['EMAIL','BROKER_EMAIL_UNVERIFIED'],
 ['ERROR','BROKER_API_ERROR']]){
 test(key+' scenario fails closed without advancing Deposit',()=>{
  const a=transition(registered(),{type:'SCENARIO',value:key});
  const b=transition(a,{type:'DEPOSIT'});
  assert.equal(b.flags[1],false);
  assert.equal(b.lastStatus,status);
  assert.equal(b.audit.some(x=>x.action==='DEPOSIT_MOCK_APPROVED'),false);
 });
}
test('sufficient balance needs two virtual readings and unlocks Connect',()=>{
 const s=transition(registered(),{type:'DEPOSIT'});
 assert.equal(s.flags[1],true);
 assert.equal(s.lastStatus,'DEPOSIT_VERIFIED_MOCK');
 const reads=s.audit.filter(x=>x.action.startsWith('BALANCE_CHECK_'));
 assert.equal(reads.length,2);
 assert.equal(reads[1].details.virtualTimeMs-reads[0].details.virtualTimeMs,61000);
 assert.ok(SCENARIOS.ENOUGH.availableBalance>=THRESHOLD);
 assert.deepEqual(steps(s).map(x=>x.status),['completed','completed','available','locked']);
});
test('rechecking an approved deposit does not double-approve',()=>{
 const approved=transition(registered(),{type:'DEPOSIT'});
 const again=transition(approved,{type:'DEPOSIT'});
 assert.equal(again.audit.filter(x=>x.action==='DEPOSIT_MOCK_APPROVED').length,1);
 assert.equal(again.lastStatus,'ALREADY_COMPLETED');
});
test('all four stages can be completed without production API',()=>{
 let s=registered();
 for(const action of ['DEPOSIT','CONNECT','ACTIVATE'])s=transition(s,{type:action});
 assert.deepEqual(s.flags,[true,true,true,true]);
 assert.equal(steps(s).every(x=>x.status==='completed'),true);
});
test('changing broker scenario invalidates dependent progress',()=>{
 let s=registered();
 for(const action of ['DEPOSIT','CONNECT','ACTIVATE'])s=transition(s,{type:action});
 s=transition(s,{type:'SCENARIO',value:'LOW'});
 assert.deepEqual(s.flags,[true,false,false,false]);
 assert.equal(s.lastBalance,null);
});
test('reset removes all fictional state',()=>{
 assert.deepEqual(transition(registered(),{type:'RESET'}),fresh());
});
