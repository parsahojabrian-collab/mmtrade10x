import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import Fastify from 'fastify';
import { z } from 'zod';
import { withSystemLock } from '../apps/api/src/transaction-lock.ts';
import { botMenuConflict } from '../packages/shared/src/bot-menu-validation.ts';
import { canonicalPhone, phoneVariants } from '../packages/shared/src/phone.ts';
import { ADMIN_ROLES, MIN_ADMIN_PASSWORD_LENGTH, canAccess } from '../packages/shared/src/admin-auth.ts';
import { withContentLock, contentRevision, assertContentRevision, ContentConflict } from '../apps/api/src/content-workflow.ts';

const source=readFileSync(process.env.MMTRADE_AUDIT_SOURCE || new URL('../apps/api/src/index.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('api.ts',source,ts.ScriptTarget.Latest,true);
function routeSource(method,url){let result;function walk(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='app.'+method&&n.arguments[0]?.text===url)result=n.getText(ast);ts.forEachChild(n,walk)}walk(ast);assert.ok(result,url);return result;}
function execute(code,context){return vm.runInNewContext(ts.transpile(code,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}),context);}
const copy=structuredClone;
function database(){
 let state={admins:[{id:'a',role:'SUPER_ADMIN',isActive:true},{id:'b',role:'SUPER_ADMIN',isActive:true}],users:[],consents:[],settings:{},logs:[],versions:[{id:'v1',pageSlug:'index',version:1,title:'Historical',blocks:[{type:'text',text:'old'}],status:'PUBLISHED'}],
 draft:{slug:'index',title:'Draft',blocks:[],updatedAt:'initial'},published:{slug:'index',title:'Public',blocks:[{type:'text',text:'live'}],status:'PUBLISHED'},
 tickets:[{id:'ticket',subject:'Question',messages:Array.from({length:45},(_,i)=>({id:String(i+1).padStart(3,'0'),ticketId:'ticket',senderType:'USER',body:'message '+(i+1),createdAt:new Date('2026-11-01T00:00:00Z')}))}]};
 let tail=Promise.resolve(),failAudit=false,clock=0;const lockKeys=[];
 const ordered=rows=>rows.slice().sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id));
 function client(s){return {
  systemSetting:{upsert:async({where,create,update})=>{lockKeys.push(where.key);const row=s.settings[where.key]?update:create;s.settings[where.key]=copy(row.value);return row}},
  adminUser:{findUnique:async({where})=>copy(s.admins.find(a=>a.id===where.id)||null),count:async({where})=>s.admins.filter(a=>a.role===where.role&&a.isActive&&a.id!==where.id.not).length,
    update:async({where,data})=>Object.assign(s.admins.find(a=>a.id===where.id),data)},
  user:{findFirst:async({where})=>copy(s.users.find(u=>where.phone.in.includes(u.phone))||null),create:async({data})=>{const u={id:'u'+s.users.length,...copy(data)};s.users.push(u);return u}},
  userConsent:{create:async({data})=>{s.consents.push(copy(data));return data}},registrationStageEvent:{create:async({data})=>data},
  auditLog:{create:async({data})=>{if(failAudit)throw Error('audit failure');s.logs.push(copy(data));return data}},
  contentPage:{findUnique:async()=>copy(s.published),upsert:async({update})=>{s.published={...s.published,...copy(update)};return copy(s.published)}},
  contentPageDraft:{findUnique:async()=>copy(s.draft),upsert:async({create,update})=>{s.draft={...(s.draft??create),...copy(update),updatedAt:'time-'+(++clock)};return copy(s.draft)}},
  contentPageVersion:{findFirst:async({where})=>copy(s.versions.find(v=>v.id===where.id&&v.pageSlug===where.pageSlug)||null),aggregate:async()=>({_max:{version:s.versions.length}}),create:async({data})=>{const row={id:'v'+(s.versions.length+1),...copy(data)};s.versions.push(row);return row}},
  supportTicket:{findUnique:async({where})=>s.tickets.find(t=>t.id===where.id)||null,
    findMany:async q=>s.tickets.map(t=>({...copy(t),messages:ordered(t.messages).slice(0,q.include.messages.take)}))},
  supportMessage:{findFirst:async({where})=>copy(s.tickets.flatMap(t=>t.messages).find(m=>m.ticketId===where.ticketId&&m.id===where.id)||null),
    findMany:async({where,take})=>ordered(s.tickets.flatMap(t=>t.messages).filter(m=>m.ticketId===where.ticketId&&(!where.OR||where.OR.some(w=>w.createdAt?.lt?m.createdAt<w.createdAt.lt:m.createdAt.getTime()===w.createdAt.getTime()&&m.id<w.id.lt)))).slice(0,take)}
 }}
 const db={get:()=>copy(state),failAudit:()=>{failAudit=true},lockKeys,
  $transaction(action){const result=tail.then(async()=>{const candidate=copy(state);const result=await action(client(candidate));state=candidate;return result});tail=result.catch(()=>{});return result}};
 for(const key of Object.keys(client(state)))db[key]=new Proxy({}, {get:(_,method)=>(...args)=>client(state)[key][method](...args)});
 return db;
}
async function harness(routes,extra={}){
 const app=Fastify(),db=database();
 const guard=async(req,reply)=>{if(!canAccess(req.headers['x-role']||'SUPER_ADMIN',req.method+' '+req.routeOptions.url)){reply.code(403).send({error:'forbidden'});return false}return true};
 app.setErrorHandler((e,req,reply)=>reply.code(e instanceof ContentConflict?409:500).send({error:e.code||e.message}));
 const defaults=['registration_status','academy','challenge','support','miniapp','membership_check','consent_yes','consent_no','share_phone'].map((id,i)=>({id,label:'default '+i,enabled:true,order:i+1}));
 const context={app,prisma:db,z,withSystemLock,botMenuConflict,withContentLock,contentRevision,assertContentRevision,ContentConflict,canonicalPhone,phoneVariants,mmChallengeHash:createHash,
  ADMIN_ROLES,MIN_ADMIN_PASSWORD_LENGTH,adminGuard:guard,botControlGuard:async(req,reply)=>{await guard(req,reply)},adminIdOf:()=>null,hashPassword:async()=> 'new hash',
  pick:(key,value)=>value===undefined?{}:{[key]:value},PAGE_SLUGS:['index'],blockSchema:z.object({type:z.literal('text'),text:z.string()}),toInputJson:x=>copy(x),BOT_CONFIG_KEY:'BOT_CONFIG',defaultBotConfig:{builtInButtons:defaults},...extra};
 for(const [method,url] of routes)execute(routeSource(method,url),context);
 await app.ready();return {app,db,defaults};
}

test('simultaneous administrator deactivations retain an active owner and audit exactly one change',async t=>{
 const {app,db}=await harness([['patch','/admin/admins/:id']]);t.after(()=>app.close());
 const result=await Promise.all(['a','b'].map(id=>app.inject({method:'PATCH',url:'/admin/admins/'+id,payload:{isActive:false}})));
 assert.deepEqual(result.map(r=>r.statusCode).sort(),[200,409]);assert.equal(db.get().admins.filter(a=>a.isActive&&a.role==='SUPER_ADMIN').length,1);assert.equal(db.get().logs.length,1);
 assert.deepEqual(db.lockKeys,['ADMIN_SUPER_ROLE_LOCK_V1','ADMIN_SUPER_ROLE_LOCK_V1']);
});
test('administrator role changes roll back if their audit fails',async t=>{
 const {app,db}=await harness([['patch','/admin/admins/:id']]);t.after(()=>app.close());db.failAudit();
 assert.equal((await app.inject({method:'PATCH',url:'/admin/admins/a',payload:{isActive:false}})).statusCode,500);assert.equal(db.get().admins.filter(a=>a.isActive).length,2);
});
test('concurrent equivalent phone formats register once and cannot add consent to an existing user',async t=>{
 const {app,db}=await harness([['post','/public/pre-register']]);t.after(()=>app.close());
 const body={firstName:'Test',lastName:'User',privacyConsent:true,smsConsent:true};
 const results=await Promise.all(['09121234567','+989121234567'].map(phone=>app.inject({method:'POST',url:'/public/pre-register',payload:{...body,phone}})));
 assert.deepEqual(results.map(r=>r.statusCode),[201,201]);assert.equal(db.get().users.length,1);assert.equal(db.get().consents.length,2);assert.equal(new Set(db.lockKeys).size,1);
 await app.inject({method:'POST',url:'/public/pre-register',payload:{...body,firstName:'Changed',phone:'09121234567'}});
 assert.equal(db.get().users[0].firstName,'Test');assert.equal(db.get().consents.length,2);
});
test('failed registration leaves neither user nor consent',async t=>{
 const {app,db}=await harness([['post','/public/pre-register']]);t.after(()=>app.close());db.failAudit();
 assert.equal((await app.inject({method:'POST',url:'/public/pre-register',payload:{firstName:'Test',lastName:'User',phone:'09121234567',privacyConsent:true}})).statusCode,500);assert.equal(db.get().users.length,0);assert.equal(db.get().consents.length,0);
});
test('tickets show the newest messages and page back without gaps or duplicates, including equal timestamps',async t=>{
 const {app}=await harness([['get','/admin/tickets'],['get','/admin/tickets/:id/messages']]);t.after(()=>app.close());
 const headers={'x-role':'SUPPORT'};const list=await app.inject({url:'/admin/tickets',headers});assert.equal(list.statusCode,200);
 const ticket=list.json().items[0];assert.equal(ticket.messages.at(-1).body,'message 45');assert.equal(ticket.messages.length,20);
 let ids=ticket.messages.map(m=>m.id),cursor=ticket.nextMessagesCursor;
 while(cursor){const r=await app.inject({url:'/admin/tickets/ticket/messages?cursor='+cursor,headers});assert.equal(r.statusCode,200);const page=r.json();ids=page.items.map(m=>m.id).concat(ids);cursor=page.nextCursor;}
 assert.equal(ids.length,45);assert.equal(new Set(ids).size,45);assert.deepEqual(ids,ids.slice().sort());
 assert.equal((await app.inject({url:'/admin/tickets/ticket/messages?cursor=foreign',headers})).statusCode,400);
 assert.equal((await app.inject({url:'/admin/tickets/ticket/messages',headers:{'x-role':'ANALYST'}})).statusCode,403);
});
test('legacy content writes are refused and canonical saves require revision tokens',async t=>{
 const {app,db}=await harness([['put','/admin/content/pages/:slug'],['put','/admin/content/pages/:slug/draft']]);t.after(()=>app.close());const before=db.get();
 assert.equal((await app.inject({method:'PUT',url:'/admin/content/pages/index',payload:{status:'PUBLISHED',blocks:[]}})).statusCode,409);
 assert.equal((await app.inject({method:'PUT',url:'/admin/content/pages/index/draft',payload:{title:'Stale',blocks:[]}})).statusCode,400);
 assert.deepEqual(db.get(),before);
});
test('legacy published history restores only the draft and detects concurrent changes',async t=>{
 const {app,db}=await harness([['post','/admin/content/pages/:slug/rollback']]);t.after(()=>app.close());const before=db.get();const expectedRevision=contentRevision(before.draft);
 const result=await app.inject({method:'POST',url:'/admin/content/pages/index/rollback',payload:{versionId:'v1',expectedRevision}});
 assert.equal(result.statusCode,200,result.body);assert.equal(result.json().status,'DRAFT');assert.equal(db.get().draft.title,'Historical');assert.deepEqual(db.get().published,before.published);assert.equal(db.get().versions.at(-1).status,'DRAFT');
 const after=db.get();assert.equal((await app.inject({method:'POST',url:'/admin/content/pages/index/rollback',payload:{versionId:'v1',expectedRevision}})).statusCode,409);assert.deepEqual(db.get(),after);
});
test('legacy draft restoration rolls back on audit failure',async t=>{
 const {app,db}=await harness([['post','/admin/content/pages/:slug/rollback']]);t.after(()=>app.close());db.failAudit();const before=db.get();
 assert.equal((await app.inject({method:'POST',url:'/admin/content/pages/index/rollback',payload:{versionId:'v1',expectedRevision:contentRevision(before.draft)}})).statusCode,500);assert.deepEqual(db.get(),before);
});
test('bot configuration rejects duplicate identifiers and labels, including renamed and legacy aliases',async t=>{
 const {app,db,defaults}=await harness([['put','/admin/bot/config']]);t.after(()=>app.close());
 const body={enabled:true,welcomeMessage:'Hello',autoReplies:[],customMenu:[],builtInButtons:copy(defaults)};
 const save=payload=>app.inject({method:'PUT',url:'/admin/bot/config',payload});assert.equal((await save(body)).statusCode,200);
 const duplicateId=copy(body);duplicateId.builtInButtons[1].id=duplicateId.builtInButtons[0].id;assert.equal((await save(duplicateId)).statusCode,400);
 const duplicateLabel=copy(body);duplicateLabel.builtInButtons[6].label=duplicateLabel.builtInButtons[5].label;assert.equal((await save(duplicateLabel)).statusCode,400);
 const alias=copy(body);alias.builtInButtons[5].label='Membership';alias.builtInButtons[6].label=defaults[5].label;assert.equal((await save(alias)).statusCode,400);
 const custom=copy(body);custom.builtInButtons[5].label='Membership';custom.customMenu=[{label:'Membership',enabled:true}];assert.equal((await save(custom)).statusCode,400);
 assert.deepEqual(db.get().settings.BOT_CONFIG,body);
});
test('the early route manager directs the bot academy URL to the current academy homepage',async t=>{
 const app=Fastify();t.after(()=>app.close());
 const hook=ast.statements.find(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='app.addHook'&&n.getText(ast).includes('rm6RouteEntries'));
 const info=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='rm6PageInfo'));
 execute(info.getText(ast)+'\n'+hook.getText(ast),{app,rm6Protected:new Set(),rm6State:async()=>({}),rm6RouteEntries:()=>[{path:'/academy',target:vm.runInNewContext(ts.transpile(info.getText(ast)+'\nrm6PageInfo.academy.target;',{target:ts.ScriptTarget.ES2022}),{}),aliases:[]}]});
 app.get('/academy',async(req,reply)=>reply.redirect('/old-handler'));
 const r=await app.inject('/academy');assert.equal(r.statusCode,302);assert.equal(r.headers.location,'/miniapp/p74/learning/academy-home.html');
});
