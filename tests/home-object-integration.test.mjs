import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {mergeWebRegistration,withBotUserLock} from '../apps/bot/src/account-state.ts';
const studio=readFileSync(new URL('../public/miniapp/p74/studio/studio.js',import.meta.url),'utf8');
const code=studio.slice(studio.indexOf('function mountHomeTools(){'),studio.indexOf('function previewUrl(){'));
function homeHarness(extra={}){
 const controls=Object.fromEntries(['home-object-panel','home-tools-toggle','home-object-controls','frame'].map(x=>[x,{hidden:false,setAttribute(){}}]));let adapter,unmounted=0,changes=0;
 const original={type:'text',text:'Existing content'};
 const scope={page:'index',homeToolsOpen:true,blocks:[original,{type:'element',selector:'#p74-home-config',text:JSON.stringify({version:74,brand:'Saved'})}],busy:false,reviewSnapshot:null,
  document:{querySelector:()=>({classList:{toggle(){}}})},window:{MMTradeHomeEditor:{unmount(){unmounted++},mount(options){adapter=options}},MMVS_Spatial:{isBusy:()=>false}},$:id=>controls[id],
  layoutHomePanel(){},checkpoint(){changes++},editBlock(selector){return scope.blocks.find(x=>x.selector===selector)},syncDirty(){},drawEdits(){},updateHistoryButtons(){},...extra};
 vm.runInNewContext(code,scope);return {scope,controls,adapter:()=>adapter,unmounted:()=>unmounted,changes:()=>changes,original};
}
test('home controls update only the home marker and preserve unrelated page content',()=>{
 const h=homeHarness();h.scope.mountHomeTools();assert.equal(h.controls['home-object-panel'].hidden,false);
 h.adapter().onChange({version:74,brand:'Edited'});assert.equal(h.scope.blocks[0],h.original);assert.equal(JSON.parse(h.scope.blocks[1].text).brand,'Edited');assert.equal(h.changes(),1);
});
test('home controls reject edits during read-only historical review',()=>{
 const h=homeHarness({reviewSnapshot:{version:1}});h.scope.mountHomeTools();assert.equal(h.adapter().isReadOnly(),true);
 assert.throws(()=>h.adapter().onChange({brand:'Wrong'}),/مجاز نیست/);assert.equal(h.changes(),0);assert.equal(JSON.parse(h.scope.blocks[1].text).brand,'Saved');
});
test('selecting another page unmounts home controls instead of editing the previous page',()=>{
 const h=homeHarness({page:'profile'});h.scope.mountHomeTools();assert.equal(h.adapter(),undefined);assert.equal(h.unmounted(),1);assert.equal(h.controls['home-tools-toggle'].hidden,true);
});
function mergeHarness({assignmentConflict=false,workflowConflict=false,sourceCompleted=false,profileConflict=false}={}){
 const updates=[],deleted=[],audit=[];const completed=new Date('2026-01-01');
 const lessons={target:[{id:'own',lessonId:'lesson',progressPct:20,videoProgressPct:10,contentProgressPct:20,completedAt:null}],source:[{id:'web',lessonId:'lesson',progressPct:100,videoProgressPct:80,contentProgressPct:100,completedAt:completed}]};
 const transfer=type=>({updateMany:async q=>{updates.push({type,...q});return{count:1}}});
 const tx={eplanetUserWorkflow:{findUnique:async q=>workflowConflict?{id:q.where.userId+'flow'}:null},userProgressAssignment:{findUnique:async q=>assignmentConflict?{id:q.where.userId+'assignment'}:null},
  lessonProgress:{findMany:async q=>lessons[q.where.userId],update:async q=>{updates.push({type:'lesson',...q});return q}},
  academyQuizAttempt:transfer('quiz'),userProgressEvent:transfer('progress'),userConsent:transfer('consent'),registrationStageEvent:transfer('stage'),supportTicket:transfer('support'),notification:transfer('notification'),followUpJob:transfer('followup'),
  auditLog:{...transfer('audit'),create:async q=>audit.push(q.data)},user:{findUnique:async q=>({firstName:q.where.id==='source'?'Website name':profileConflict?'Different name':'Telegram name',lastName:null,tradingLevel:null,profileCompletedAt:(q.where.id==='source'?(sourceCompleted||profileConflict):profileConflict)?completed:null,registrationSource:'website'}),update:async q=>{updates.push({type:'profile',...q});return q},delete:async q=>deleted.push(q.where.id)}};
 return {tx,updates,deleted,audit,completed};
}
test('website merge preserves higher lesson completion and queued messages before deleting the source',async()=>{
 const h=mergeHarness();assert.equal(await mergeWebRegistration(h.tx,'target','source'),true);
 const lesson=h.updates.find(x=>x.type==='lesson');assert.equal(lesson.data.progressPct,100);assert.equal(lesson.data.contentProgressPct,100);assert.equal(lesson.data.completedAt,h.completed);
 assert.ok(h.updates.some(x=>x.type==='notification'&&x.data.userId==='target'));assert.ok(h.updates.some(x=>x.type==='followup'&&x.data.userId==='target'));assert.deepEqual(h.deleted,['source']);
});
for(const kind of ['assignmentConflict','workflowConflict'])test(`website merge retains both records when ${kind} cannot be merged safely`,async()=>{
 const h=mergeHarness({[kind]:true});assert.equal(await mergeWebRegistration(h.tx,'target','source'),false);assert.equal(h.deleted.length,0);assert.equal(h.updates.length,0);assert.equal(h.audit[0].action,'WEB_PREREGISTRATION_MERGE_SKIPPED');
});
test('user-level serialization is acquired inside the same database transaction as the write',async()=>{
 const order=[];const tx={systemSetting:{upsert:async q=>{assert.equal(q.where.key,'BOT_USER_LOCK_user');order.push('lock')}}};
 const db={$transaction:async fn=>{order.push('begin');const result=await fn(tx);order.push('commit');return result}};
 assert.equal(await withBotUserLock(db,'user',async received=>{assert.equal(received,tx);order.push('write');return 7}),7);assert.deepEqual(order,['begin','lock','write','commit']);
});
function homeNormalizer(){
 const window={addEventListener(){}};const document={readyState:'loading',addEventListener(){}};
 const scope={window,document,location:{search:'?p74Preview=1',pathname:'/miniapp/p74/preview.html'},URLSearchParams,URL};
 vm.runInNewContext(readFileSync(new URL('../public/miniapp/p74/object-model.js',import.meta.url),'utf8'),scope);
 const source=readFileSync(new URL('../public/miniapp/p74/home.js',import.meta.url),'utf8').replace('window.P74={','window.__HomeNormalize=normalized;window.P74={');
 vm.runInNewContext(source,scope);return window.__HomeNormalize;
}
test('legacy home markers preserve the reviewed server challenge, copytrade and ePlanet routes',()=>{
 const normalize=homeNormalizer();const result=normalize({steps:[{href:'/old-unused-1'},{href:'/old-unused-2'}],stepCount:5});
 assert.equal(result.steps[0].href,'https://mmtrade10x.ir/mmtrade10x');assert.equal(result.steps[1].href,'/copytrade-academy');assert.equal(result.steps[3].href,'/eplanet');
});
test('new home markers honor edited links for the first and second stages',()=>{
 const normalize=homeNormalizer();const result=normalize({stepLinksVersion:1,steps:[{href:'/custom-1'},{href:'/custom-2'}],stepCount:3});
 assert.equal(result.steps[0].href,'/custom-1');assert.equal(result.steps[1].href,'/custom-2');
});

test('a completed website profile survives merging into an incomplete Telegram profile',async()=>{
 const h=mergeHarness({sourceCompleted:true});await mergeWebRegistration(h.tx,'target','source');const profile=h.updates.find(x=>x.type==='profile');assert.equal(profile.data.firstName,'Website name');assert.equal(profile.data.profileCompletedAt,h.completed);
});
test('conflicting completed profiles are preserved for review rather than silently overwritten',async()=>{
 const h=mergeHarness({profileConflict:true});assert.equal(await mergeWebRegistration(h.tx,'target','source'),false);assert.equal(h.deleted.length,0);assert.equal(h.updates.length,0);assert.equal(h.audit[0].metadata.reason,'both_accounts_have_different_completed_profiles');
});
