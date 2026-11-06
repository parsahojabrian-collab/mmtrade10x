import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync('apps/api/src/index.ts','utf8');
const view=readFileSync('public/miniapp/p74/learning/challenge-status.js','utf8');
const admin=readFileSync('public/miniapp/p74/learning/admin-challenge.js','utf8');
test('challenge pass verdict is never inferred from participation or deposits',()=>{
 assert.match(src,/Account registration\/copy connection is not proof of passing 10X/);
 assert.match(src,/Never infer PASS from balance, deposits, trade history/);
 assert.match(src,/verdict: effective\?\.verdict \?\? 'NOT_VERIFIED'/);
});
test('broker result requires explicit official account and status fields',()=>{
 assert.match(src,/EPLANET_CHALLENGE_STATUS_FIELD/);
 assert.match(src,/EPLANET_CHALLENGE_ACCOUNT_FIELD/);
 assert.match(src,/broker_account_mismatch/);
 assert.match(src,/broker_challenge_program_mismatch/);
 assert.match(src,/broker_challenge_verdict_unavailable/);
 assert.match(src,/EPLANET_CHALLENGE_ALLOWED_HOSTS/);
});
test('broker fetch is HTTPS, allowlisted, no redirects, with timeout',()=>{
 assert.match(src,/url\.protocol !== 'https:'/);
 assert.match(src,/hosts\.includes\(url\.hostname/);
 assert.match(src,/redirect:'error'/);
 assert.match(src,/AbortSignal\.timeout\(8000\)/);
});
test('user status uses Telegram initData, never a user-id parameter',()=>{
 const start=src.indexOf("app.post('/challenge/result/status'");const end=src.indexOf("app.get('/admin/challenge/results'",start);
 assert.ok(start>0 && end>start);assert.match(src.slice(start,end),/miniUser\(input\.data\.initData,false\)/);
});
test('manual decisions require session superadmin and proof for final outcomes',()=>{
 const start=src.indexOf("app.put('/admin/challenge/results/:userId'");const end=src.indexOf("app.post('/admin/challenge/results/:userId/clear-override'",start);
 const route=src.slice(start,end);
 assert.match(route,/p37SuperSession\(request,reply\)/);
 assert.match(route,/final_decision_requires_evidence_reference/);
 assert.match(route,/reason:z\.string\(\)\.trim\(\)\.min\(10\)/);
});
test('manual decisions and clearing are audited with actor and reasons',()=>{
 assert.match(src,/action:'CHALLENGE_SUPERADMIN_DECISION'/);
 assert.match(src,/action:'CHALLENGE_SUPERADMIN_OVERRIDE_CLEARED'/);
 assert.match(src,/adminUserId:actor\.id/);
 assert.match(src,/reason:body\.data\.reason/);
});
test('broker and admin status remain distinct, conflicting verdict shown',()=>{
 assert.match(src,/broker: MMChallengeBroker \| null; manual: MMChallengeManual \| null/);
 assert.match(src,/value\.manual\.verdict !== broker\.verdict/);
 assert.match(admin,/conflict/);
});
test('stage 1 widget shows pass green, failure red and pending neutral',()=>{
 assert.match(view,/PASSED:\[/);assert.match(view,/FAILED:\[/);assert.match(view,/NOT_VERIFIED:\[/);
 assert.match(view,/fetch\('\/challenge\/result\/status'/);
});
