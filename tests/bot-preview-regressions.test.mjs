import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as retry from '../apps/bot/src/notification-retry.ts';
import * as accountState from '../apps/bot/src/account-state.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const botSource=read('apps/bot/src/index.ts');
function botHarness({complete=false,users=[],notifications=[],send=async()=>{},failSupportMessage=false}={}){
 const settings=new Map([['ALLOW_NO_REQUIRED_CHANNELS',true],['BOT_CONTROL_CONFIG',{builtInButtons:[{id:'consent_yes',label:'تأیید جدید'},{id:'consent_no',label:'انصراف جدید'}]}]]);
 const stages=[],accounts=[],scans=[],sent=[],callbacks=new Map(),commands=new Map(),middleware=[],handlers=[],tickets=[],messages=[],consents=[],userWrites=[],replies=[];let connects=0,disconnects=0;let transactionQueue=Promise.resolve();
 let clock=1700000000000;
 const person={id:'u',telegramId:'42',registrationStatus:complete?'COMPLETE':'STARTED',registrationStage:complete?'COMPLETE':'STARTED',lastActivityAt:new Date(clock)};
 const prisma={
  user:{findUnique:async()=>person,upsert:async q=>{userWrites.push(q);return person},update:async({data})=>{stages.push(data.registrationStage);return Object.assign(person,data)},findMany:async q=>{scans.push(q);const start=q.cursor?users.findIndex(x=>x.id===q.cursor.id)+1:0;return users.slice(start,start+q.take)}},
  telegramAccount:{upsert:async q=>{accounts.push(q);return q}},
  registrationStageEvent:{create:async()=>({})},
  userConsent:{findFirst:async q=>consents.filter(c=>Object.entries(q.where).every(([k,v])=>c[k]===v)).sort((a,b)=>b.createdAt-a.createdAt)[0]||null,create:async q=>{const v={id:'c'+consents.length,...q.data};consents.push(v);return v}},
  supportTicket:{findFirst:async q=>tickets.filter(t=>t.userId===q.where.userId&&q.where.status.in.includes(t.status))[0]||null,create:async q=>{const row={id:'t'+tickets.length,...q.data};tickets.push(row);return row},update:async q=>Object.assign(tickets.find(t=>t.id===q.where.id),q.data)},
  supportMessage:{create:async q=>{if(failSupportMessage)throw Error('message storage failed');messages.push(q.data);return q.data}},
  followUpJob:{findFirst:async()=>({id:'recent'}),findMany:async()=>[],create:async()=>{throw Error('unexpected reminder creation')}},
  notification:{findMany:async q=>notifications.filter(n=>q.where.OR.some(o=>n.status===o.status&&(!o.id||o.id.in.includes(n.id)))).slice(0,q.take),updateMany:async q=>{const n=notifications.find(n=>n.id===q.where.id&&n.status===q.where.status);if(!n)return{count:0};Object.assign(n,q.data);return{count:1}},update:async q=>Object.assign(notifications.find(n=>n.id===q.where.id),q.data)},
  systemSetting:{findMany:async q=>[...settings].filter(([key])=>q.where.key.in?q.where.key.in.includes(key):key.startsWith(q.where.key.startsWith)).map(([key,value])=>({key,value})),upsert:async q=>{settings.set(q.where.key,q.update.value);return q},deleteMany:async q=>({count:settings.delete(q.where.key)?1:0})},
  $connect:async()=>{connects++},$disconnect:async()=>{disconnects++},
  $transaction:async action=>{
   if(Array.isArray(action))return Promise.all(action);
   const previous=transactionQueue;let release;transactionQueue=new Promise(r=>release=r);await previous;
   const saved={tickets:structuredClone(tickets),messages:structuredClone(messages),consents:structuredClone(consents),settings:structuredClone([...settings])};
   try{return await action(prisma)}catch(error){tickets.splice(0,tickets.length,...saved.tickets);messages.splice(0,messages.length,...saved.messages);consents.splice(0,consents.length,...saved.consents);settings.clear();for(const [k,v] of saved.settings)settings.set(k,v);throw error}finally{release()}
  }
 };
 class Keys{constructor(){this.labels=[]}text(x){this.labels.push(x);return this}row(){return this}resized(){return this}oneTime(){return this}requestContact(x){return this.text(x)}webApp(label,url){this.webAppUrl=url;return this.text(label)}}
 class Bot{constructor(){this.api={sendMessage:async(...args)=>{sent.push(args);return send(...args)}}}use(fn){middleware.push(fn)}on(filter,fn){handlers.push({filter,fn})}command(name,fn){commands.set(name,fn)}isRunning(){return false}async stop(){}callbackQuery(name,fn){callbacks.set(name,fn)}catch(){}}
 const DateMock=class extends Date{constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}};
 const context=vm.createContext({require:name=>name==='grammy'?{Bot,Keyboard:Keys,InlineKeyboard:Keys}:name==='@prisma/client'?{PrismaClient:class{constructor(){return prisma}}}:name==='./notification-retry.js'?retry:name==='./account-state.js'?accountState:{},exports:{},process:{env:{TELEGRAM_BOT_TOKEN:'test'},once(){}},console:{log(){},error(){}},URL,Date:DateMock,Set,setInterval,clearInterval});
 const code=botSource.replace('main().catch(async error =>','if(false)main().catch(async error =>');
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 const run=code=>vm.runInContext(code,context);
 const ctx={from:{id:42,first_name:'User'},chat:{id:42,type:'private'},reply:async(...args)=>{replies.push(args)},answerCallbackQuery:async()=>{}};context.ctx=ctx;
 async function dispatchText(text){ctx.message={text};const selected=handlers.filter(h=>['message:text','message'].includes(h.filter));const next=async i=>{if(i<selected.length)await selected[i].fn(ctx,()=>next(i+1))};await next(0)}
 return {context,run,ctx,person,prisma,stages,accounts,scans,sent,settings,notifications,callbacks,commands,middleware,handlers,tickets,messages,consents,userWrites,replies,dispatchText,connects:()=>connects,disconnects:()=>disconnects,tick:ms=>clock+=ms};
}
test('group updates cannot reach registration or support handlers',async()=>{
 const h=botHarness();let called=false;await h.middleware[0]({chat:{type:'supergroup'}},()=>{called=true});assert.equal(called,false);
 await h.middleware[0]({chat:{type:'private'}},()=>{called=true});assert.equal(called,true);
});
test('private destination derives from the Telegram user id even if a context has a group id',async()=>{
 const h=botHarness();h.ctx.chat.id=-100777;await h.run('upsertTelegramUser(ctx)');assert.equal(h.accounts[0].update.chatId,'42');
});
test('consent prompt displays exactly the configured action labels',async()=>{
 const h=botHarness();let labels;h.ctx.reply=async(_,opts)=>labels=opts.reply_markup.labels;await h.run('getBotSettings()');await h.run("sendConsentPrompt(ctx,'u')");
 assert.deepEqual(labels,['تأیید جدید','انصراف جدید']);
});
test('an old membership callback cannot regress a completed registration',async()=>{
 const h=botHarness({complete:true});await h.callbacks.get('check_membership')(h.ctx);assert.equal(h.stages.length,0);
});
test('old consent actions cannot regress completed registration',async()=>{
 const h=botHarness({complete:true});await h.callbacks.get('consent_yes')(h.ctx);await h.callbacks.get('consent_no')(h.ctx);assert.equal(h.stages.length,0);
});
test('reminder scans reach users after the first hundred and then wrap',async()=>{
 const users=Array.from({length:101},(_,i)=>({id:String(i).padStart(3,'0')}));const h=botHarness({users});
 await h.run('processDueAutomations()');await h.run('processDueAutomations()');await h.run('processDueAutomations()');
 assert.equal(h.scans[1].cursor.id,'099');assert.equal(h.scans[1].skip,1);assert.equal(h.scans[2].cursor,undefined);
});
test('transient notification failure persists a due time and retries only when due',async()=>{
 let attempts=0;const notification={id:'n',status:'PENDING',title:'Title',body:'Body',user:{telegramAccount:{telegramId:'42',chatId:'-100777'}}};
 const h=botHarness({notifications:[notification],send:async()=>{if(++attempts===1)throw Object.assign(Error('limited'),{error_code:429,parameters:{retry_after:120}})}});
 await h.run('processDueAutomations()');assert.equal(notification.status,'RETRY');assert.equal(h.sent[0][0],'42');
 assert.ok(h.settings.has(retry.NOTIFICATION_RETRY_PREFIX+'n'));
 h.tick(119999);await h.run('processDueAutomations()');assert.equal(attempts,1);
 h.tick(1);await h.run('processDueAutomations()');assert.equal(attempts,2);assert.equal(notification.status,'SENT');assert.equal(h.settings.has(retry.NOTIFICATION_RETRY_PREFIX+'n'),false);
});
test('notification retries stop for blocked users and exhausted attempts',()=>{
 assert.equal(retry.notificationRetry({error_code:403},1,0),null);assert.equal(retry.notificationRetry(Error('network'),5,0),null);
 assert.equal(retry.notificationRetry({error_code:429,parameters:{retry_after:3600}},1,1000).nextAttemptAt,3601000);
 assert.equal(retry.readNotificationRetry({attempts:-1,nextAttemptAt:0,lastError:''}),null);
});
const studio=read('public/miniapp/p74/studio/studio.js');
const popupFunction=studio.slice(studio.indexOf('async function previewPopup(){'),studio.indexOf('\nfunction bind(){'));
function popupHarness(confirmValue){
 const requests=[],tabs=[],scope={busy:false,page:'academy',ready:false,pendingPopup:null,window:{MMVS_Spatial:{isBusy:()=>false,isDirty:()=>false}},popupData:()=>({pageSlug:'support',title:'Popup'}),dirty:()=>true,confirm:()=>confirmValue,chooseTab:t=>tabs.push(t),loadPage:async p=>requests.push(p),toast(){}};
 vm.runInNewContext(popupFunction,scope);return{scope,requests,tabs};
}
test('cancelling cross-page popup preview preserves the editor and pending preview',async()=>{
 const h=popupHarness(false);await h.scope.previewPopup();assert.equal(h.requests.length,0);assert.equal(h.tabs.length,0);assert.equal(h.scope.pendingPopup,null);
});
test('confirmed cross-page popup preview retains its popup for the new frame handshake',async()=>{
 const h=popupHarness(true);await h.scope.previewPopup();assert.deepEqual(h.requests,['support']);assert.equal(h.scope.pendingPopup.title,'Popup');
});
const apiSource=read('apps/api/src/index.ts');
const stageRoutes=apiSource.slice(apiSource.indexOf('const mmStage2PreviewContent ='),apiSource.indexOf('// Stage 1 Object Studio:'));
function stageHarness(role){
 const routes=new Map();const scope={exports:{},app:{get:(p,f)=>routes.set('GET '+p,f),post:(p,f)=>routes.set('POST '+p,f)},adminGuard:async(_,r)=>{if(!role){r.code(401).send({error:'unauthorized'});return false}return true},mmStage1Body:{safeParse:()=>({success:true,data:{initData:'test'}})},miniUser:async()=>({id:'u'}),mmStage1State:async()=>({unlocked:false,done:0,total:7})};
 vm.runInNewContext(ts.transpileModule(stageRoutes,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,scope);
 const reply={status:200,body:null,header(){return this},code(n){this.status=n;return this},send(body){this.body=body;return body}};
 return{routes,reply,request:{admin:role?{role}:undefined}};
}
test('stage-two preview requires an authenticated superadmin',async()=>{
 for(const [role,status] of [[null,401],['CONTENT_MANAGER',403]]){const h=stageHarness(role);await h.routes.get('GET /admin/challenge/learning/stage2/preview')(h.request,h.reply);assert.equal(h.reply.status,status)}
 const h=stageHarness('SUPER_ADMIN');const data=await h.routes.get('GET /admin/challenge/learning/stage2/preview')(h.request,h.reply);assert.equal(data.steps.length,5);
});
test('public stage-two content remains locked for an incomplete user',async()=>{
 const h=stageHarness(null);await h.routes.get('POST /challenge/learning/stage2/content')({},h.reply);assert.equal(h.reply.status,403);assert.equal(h.reply.body.error,'stage1_incomplete');
});


test('disabled built-in buttons cannot execute hidden support actions',async()=>{
 const h=botHarness();h.settings.set('BOT_CONTROL_CONFIG',{builtInButtons:[{id:'support',label:'Disabled support',enabled:false}]});
 await h.dispatchText('Disabled support');assert.equal(h.tickets.length,0);assert.match(h.replies.at(-1)[0],/غیرفعال/);
});
test('resetting dynamic settings clears old cached button labels',async()=>{
 const h=botHarness();await h.run('getBotSettings()');assert.equal(h.run("builtinLabel('consent_yes')"),'تأیید جدید');
 h.settings.delete('BOT_CONTROL_CONFIG');h.tick(10001);await h.run('getBotSettings()');assert.equal(h.run("builtinLabel('consent_yes')"),'✅ موافقم و ادامه می‌دهم');
});
test('a newer denial supersedes an older consent and blocks contact registration',async()=>{
 const h=botHarness();await h.run("recordTelegramConsent('u',true)");await h.run("recordTelegramConsent('u',false)");
 assert.equal(h.consents.length,2);assert.equal((await h.run("latestTelegramConsent('u')")).granted,false);
 h.ctx.message={contact:{user_id:42,phone_number:'+989123456789'}};
 await h.handlers.find(x=>x.filter==='message:contact').fn(h.ctx);
 assert.notEqual(h.person.registrationStatus,'REGISTERED');assert.match(h.replies.at(-1)[0],/موافقت/);
 await h.run("recordTelegramConsent('u',true)");assert.equal((await h.run("latestTelegramConsent('u')")).granted,true);
 assert.ok(h.consents[2].createdAt>h.consents[1].createdAt);
});
test('phone-pending and consent-pending stages update the corresponding registration status',async()=>{
 const h=botHarness();await h.run("setStage('u','PHONE_PENDING')");assert.equal(h.person.registrationStatus,'PHONE_PENDING');
 await h.run("setStage('u','CONSENT_PENDING')");assert.equal(h.person.registrationStatus,'STARTED');
});
test('removing a Telegram username clears the stale database username',async()=>{
 const h=botHarness();await h.run('upsertTelegramUser(ctx)');assert.equal(h.userWrites[0].update.username,null);
});
test('support creation rolls back its ticket when the initial message fails',async()=>{
 const h=botHarness({failSupportMessage:true});await h.dispatchText('💬 پشتیبانی');assert.equal(h.tickets.length,0);assert.equal(h.messages.length,0);
 assert.match(h.replies.at(-1)[0],/انجام نشد/);
});
test('support create, write and close operations preserve one coherent conversation',async()=>{
 const h=botHarness();await h.dispatchText('💬 پشتیبانی');await h.dispatchText('💬 پشتیبانی');assert.equal(h.tickets.length,1);
 await h.dispatchText('A support message');assert.equal(h.messages.at(-1).body,'A support message');
 await h.commands.get('closesupport')(h.ctx);assert.equal(h.tickets[0].status,'CLOSED');assert.equal(h.messages.at(-1).senderType,'SYSTEM');
});
test('shutdown waits for the in-flight automation before disconnecting the database',async()=>{
 let release;const gate=new Promise(r=>release=r);const n={id:'n',status:'PENDING',title:'T',body:'B',user:{telegramAccount:{telegramId:'42'}}};
 const h=botHarness({notifications:[n],send:()=>gate});const work=h.run('processDueAutomations()');
 for(let i=0;i<20&&!h.sent.length;i++)await new Promise(r=>setImmediate(r));
 assert.equal(h.sent.length,1);const stopping=h.run('shutdown()');await new Promise(r=>setImmediate(r));assert.equal(h.disconnects(),0);
 release();await work;await stopping;assert.equal(h.disconnects(),1);assert.equal(n.status,'SENT');
 await h.run('processDueAutomations()');assert.equal(h.sent.length,1);
});
test('invalid startup mode fails before opening the database or sending reminders',async()=>{
 const h=botHarness();h.context.process.env.TELEGRAM_MODE='webhook';await assert.rejects(h.run('main()'),/polling/);assert.equal(h.connects(),0);assert.equal(h.sent.length,0);
});


test('mini-app-only mode removes the reply keyboard and shows exactly one Web App entry for /start',async()=>{
 const h=botHarness();h.settings.set('MINI_APP_URL','https://example.com/miniapp');h.settings.set('BOT_CONTROL_CONFIG',{miniAppOnly:true});
 h.ctx.message={text:'/start'};let reachedRegistration=false;
 await h.middleware[1](h.ctx,()=>{reachedRegistration=true});
 assert.equal(reachedRegistration,false);assert.equal(h.replies.length,2);
 assert.equal(h.replies[0][1].reply_markup.remove_keyboard,true);
 assert.deepEqual(h.replies[1][1].reply_markup.labels,['🚀 ورود به مینی‌اپ']);
 assert.equal(h.replies[1][1].reply_markup.webAppUrl,'https://example.com/miniapp');
 assert.equal(h.stages.length,0);assert.equal(h.consents.length,0);
});
test('mini-app-only mode intercepts old buttons, custom commands and contacts before hidden actions run',async()=>{
 for(const message of [{text:'💬 پشتیبانی'},{text:'/menu'},{text:'/closesupport'},{text:'Custom menu'},{contact:{user_id:42,phone_number:'09121234567'}}]){
  const h=botHarness();h.settings.set('MINI_APP_URL','https://example.com/app');h.settings.set('BOT_CONTROL_CONFIG',{miniAppOnly:true});h.ctx.message=message;
  let called=false;await h.middleware[1](h.ctx,()=>{called=true});
  assert.equal(called,false);assert.equal(h.tickets.length,0);assert.equal(h.stages.length,0);assert.equal(h.consents.length,0);
 }
});
test('mini-app-only mode acknowledges obsolete consent callbacks without accepting consent',async()=>{
 const h=botHarness();h.settings.set('MINI_APP_URL','https://example.com/app');h.settings.set('BOT_CONTROL_CONFIG',{miniAppOnly:true});
 h.ctx.callbackQuery={data:'consent_yes'};let acknowledged=0;h.ctx.answerCallbackQuery=async()=>{acknowledged++};
 let next=false;await h.middleware[1](h.ctx,()=>{next=true});
 assert.equal(acknowledged,1);assert.equal(next,false);assert.equal(h.consents.length,0);assert.equal(h.stages.length,0);
});
test('turning mini-app-only off restores the original menus after the settings cache refreshes',async()=>{
 const h=botHarness();h.settings.set('MINI_APP_URL','https://example.com/app');h.settings.set('BOT_CONTROL_CONFIG',{miniAppOnly:true});h.ctx.message={text:'/menu'};
 await h.middleware[1](h.ctx,()=>assert.fail('mode should intercept'));
 h.settings.set('BOT_CONTROL_CONFIG',{miniAppOnly:false});h.tick(10001);
 let next=false;await h.middleware[1](h.ctx,()=>{next=true});assert.equal(next,true);
 h.replies.length=0;h.ctx.testPerson=h.person;await h.run('showMainMenu(ctx,ctx.testPerson)');assert.ok(h.replies[0][1].reply_markup.labels.includes('💬 پشتیبانی'));assert.equal(h.replies[0][1].reply_markup.webAppUrl,undefined);
});
test('a missing or unsafe Mini App URL removes the old keyboard and sends setup guidance',async()=>{
 for(const url of ['', 'http://example.com/app','https://user:secret@example.com/app']){
  const h=botHarness();h.settings.set('MINI_APP_URL',url);h.settings.set('BOT_CONTROL_CONFIG',{miniAppOnly:true});h.ctx.message={text:'/menu'};
  await h.middleware[1](h.ctx,()=>assert.fail('must not expose normal menu'));
  assert.equal(h.replies[0][1].reply_markup.remove_keyboard,true);assert.match(h.replies.at(-1)[0],/تنظیم/);
  assert.equal(h.replies.at(-1)[1],undefined);
 }
});
