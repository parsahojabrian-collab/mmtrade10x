import test from 'node:test';
import assert from 'node:assert/strict';
import {eplanetHarness,eplanetDatabase} from './helpers/eplanet-harness.mjs';
const BASE='/miniapp/eplanet',store='EPLANET_ONBOARDING_V1';
const pending=(id='q',step='registration',userId='u')=>({id,step,userId,accountId:'123',status:'pending',createdAt:'2026-01-01T00:00:00Z'});
test('approved steps are completed rather than locked and completion reaches four of four',()=>{
 const h=eplanetHarness();assert.equal(h.statuses({accountCreated:true}).registration.status,'completed');assert.equal(h.statuses({accountCreated:true}).deposit.status,'available');
 assert.ok(Object.values(h.statuses({accountCreated:true,depositCompleted:true,copyConnected:true,challengeParticipant:true})).every(s=>s.status==='completed'));
});
test('rejected status returns the admin reason without exposing another user request',async()=>{
 const h=eplanetHarness();h.database.state.settings[store]={requests:[{...pending(),status:'rejected',note:'Correct the account id'},{...pending('other'),userId:'other',status:'rejected',note:'Private'}]};
 const r=await h.dispatch('POST',BASE+'/status',{initData:'valid'});assert.equal(r.data.steps.registration.status,'rejected');assert.equal(r.data.steps.registration.note,'Correct the account id');
});
test('unauthenticated users cannot read status or submit a verification request',async()=>{
 const h=eplanetHarness();for(const path of ['/status','/submit']){const r=await h.dispatch('POST',BASE+path,{initData:'bad',...(path==='/submit'?{step:'registration',accountId:'123'}:{})});assert.equal(r.status,401)}
 assert.equal(h.database.state.settings[store],undefined);
});
test('pending requests are deduplicated across independent API worker contexts',async()=>{
 const database=eplanetDatabase(),a=eplanetHarness(database),b=eplanetHarness(database);
 const results=await Promise.all([a,b].map(h=>h.dispatch('POST',BASE+'/submit',{initData:'valid',step:'registration',accountId:'123'})));
 assert.deepEqual(results.map(x=>x.status).sort(),[201,409]);assert.equal(database.state.settings[store].requests.length,1);
});
test('later steps cannot be submitted before prior workflow approvals',async()=>{
 const h=eplanetHarness();const r=await h.dispatch('POST',BASE+'/submit',{initData:'valid',step:'deposit'});assert.equal(r.status,409);assert.equal(r.data.error,'step_not_available');
});
test('a late decision failure rolls back workflow, queue and audit together',async()=>{
 const h=eplanetHarness();h.database.state.settings[store]={requests:[pending()]};const before=structuredClone(h.database.state);h.database.failAudit('EPLANET_REQUEST_DECIDED');
 await assert.rejects(h.dispatch('POST',BASE+'/admin/requests/q/decision',{approved:true},'SUPER_ADMIN'),/late audit failure/);
 assert.deepEqual(h.database.state,before);assert.equal(h.database.maxDepth(),1);
});
test('one successful approval commits queue and workflow and unlocks the next step',async()=>{
 const h=eplanetHarness();h.database.state.settings[store]={requests:[pending()]};const r=await h.dispatch('POST',BASE+'/admin/requests/q/decision',{approved:true},'SUPER_ADMIN');
 assert.equal(r.status,200);assert.equal(h.database.state.workflows.u.accountCreated,true);assert.equal(h.database.state.settings[store].requests[0].status,'approved');assert.equal(h.database.state.audits.length,2);assert.equal(h.database.maxDepth(),1);
 const status=await h.dispatch('POST',BASE+'/status',{initData:'valid'});assert.equal(status.data.steps.registration.status,'completed');assert.equal(status.data.steps.deposit.status,'available');
});
test('config editing detects a stale form and preserves concurrent requests',async()=>{
 const h=eplanetHarness();const initial=(await h.dispatch('GET',BASE+'/config')).data;
 await h.dispatch('POST',BASE+'/submit',{initData:'valid',step:'registration',accountId:'123'});
 const first=await h.dispatch('PUT',BASE+'/admin/config',{...initial.config,title:'First edit',expectedRevision:initial.revision},'SUPER_ADMIN');assert.equal(first.status,200);
 const stale=await h.dispatch('PUT',BASE+'/admin/config',{...initial.config,title:'Stale edit',expectedRevision:initial.revision},'SUPER_ADMIN');assert.equal(stale.status,409);assert.equal(stale.data.error,'config_revision_conflict');assert.equal(h.database.state.settings[store].config.title,'First edit');assert.equal(h.database.state.settings[store].requests.length,1);
});
test('queue pruning preserves pending requests and refuses new work when pending capacity is full',async()=>{
 const h=eplanetHarness();const rows=[pending('oldest'),...Array.from({length:1600},(_,i)=>({...pending('done-'+i),status:'approved'}))];assert.ok(h.prune(rows).some(x=>x.id==='oldest'));assert.equal(h.prune(rows).length,1500);
 h.database.state.settings[store]={requests:Array.from({length:1500},(_,i)=>pending('q'+i,'registration','other'+i))};const r=await h.dispatch('POST',BASE+'/submit',{initData:'valid',step:'registration',accountId:'123'});assert.equal(r.status,503);assert.equal(h.database.state.settings[store].requests.length,1500);
});
test('decisions require superadmin and cannot approve a different already-confirmed account',async()=>{
 const h=eplanetHarness();h.database.state.settings[store]={requests:[pending()]};for(const role of [undefined,'CONTENT_MANAGER']){const r=await h.dispatch('POST',BASE+'/admin/requests/q/decision',{approved:true},role);assert.equal(r.status,role?403:401)}
 h.database.state.workflows.u={version:1,accountCreated:true,accountId:'different'};const r=await h.dispatch('POST',BASE+'/admin/requests/q/decision',{approved:true},'SUPER_ADMIN');assert.equal(r.status,409);assert.equal(r.data.error,'account_id_conflict');assert.equal(h.database.state.settings[store].requests[0].status,'pending');
});
test('unsafe links are rejected while local uploaded images are accepted',async()=>{
 const h=eplanetHarness(),config=(await h.dispatch('GET',BASE+'/config')).data.config;
 for(const value of ['javascript:alert(1)','http://example.test','https://user:pass@example.test']){const r=await h.dispatch('PUT',BASE+'/admin/config',{...config,registerUrl:value},'SUPER_ADMIN');assert.equal(r.status,400)}
 const r=await h.dispatch('PUT',BASE+'/admin/config',{...config,heroImage:'/uploads/home-studio/photo.webp'},'SUPER_ADMIN');assert.equal(r.status,200);assert.equal(r.data.config.heroImage,'/uploads/home-studio/photo.webp');
});

test('the existing standalone team workflow writer remains versioned and ordered',async()=>{
 const h=eplanetHarness();let r=await h.changeWorkflow('u',{step:'ACCOUNT_CREATED',approved:true,version:0,accountId:'123'});assert.equal(r.ok,true);
 r=await h.changeWorkflow('u',{step:'DEPOSIT_COMPLETED',approved:true,version:0});assert.equal(r.error,'version_conflict');
 r=await h.changeWorkflow('u',{step:'DEPOSIT_COMPLETED',approved:true,version:1});assert.equal(r.ok,true);
 r=await h.changeWorkflow('u',{step:'ACCOUNT_CREATED',approved:false,version:2});assert.equal(r.error,'revoke_later_steps_first');assert.equal(h.database.state.workflows.u.accountCreated,true);
});
