import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {z} from 'zod';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('../../apps/api/src/index.ts',import.meta.url),'utf8');
const workflow=source.slice(source.indexOf('async function p37LockWorkflow('),source.indexOf('// END TENX_P37_SHARED_WORKFLOW_TX'));
const routesCode=source.slice(source.indexOf('const eplanetStoreKey ='),source.indexOf('// EPLANET_OFFICIAL_R2_END'));
export function eplanetDatabase(){
 let state={settings:{},users:{u:{id:'u',firstName:'User'}},workflows:{},audits:[]},tail=Promise.resolve(),depth=0,maxDepth=0;
 let failAudit='';
 const clone=x=>x==null?x:structuredClone(x);
 const db={systemSetting:{findUnique:async q=>state.settings[q.where.key]?{value:clone(state.settings[q.where.key])}:null,upsert:async q=>{const value=clone(q.update.value);state.settings[q.where.key]=value;return{key:q.where.key,value}}},
  user:{findUnique:async q=>state.users[q.where.id]?{...clone(state.users[q.where.id]),eplanetWorkflow:clone(state.workflows[q.where.id]||null)}:null,findMany:async q=>q.where.id.in.map(id=>state.users[id]).filter(Boolean).map(clone)},
  eplanetUserWorkflow:{findUnique:async q=>clone(state.workflows[q.where.userId]||null),createMany:async q=>{for(const item of q.data)if(!state.workflows[item.userId])state.workflows[item.userId]={id:'w-'+item.userId,userId:item.userId,version:0,accountId:null,accountCreated:false,depositCompleted:false,copyConnected:false,challengeParticipant:false};return{count:1}},updateMany:async q=>{const row=state.workflows[q.where.userId];if(!row||!Object.entries(q.where).every(([k,v])=>row[k]===v))return{count:0};for(const [k,v]of Object.entries(q.data))row[k]=v&&typeof v==='object'&&'increment'in v?row[k]+v.increment:v;return{count:1}}},
  auditLog:{create:async q=>{if(q.data.action===failAudit)throw Error('injected late audit failure');state.audits.push(clone(q.data));return q.data}},
  $transaction:async work=>{const prior=tail;let release;tail=new Promise(r=>release=r);await prior;const before=clone(state);depth++;maxDepth=Math.max(maxDepth,depth);try{return await work(db)}catch(e){state=before;throw e}finally{depth--;release()}}
 };
 return {db,get state(){return state},set state(next){state=next},failAudit:action=>{failAudit=action},maxDepth:()=>maxDepth};
}
export function eplanetHarness(database=eplanetDatabase()){
 const routes=new Map();let id=0;
 const context={prisma:database.db,z,mmChallengeHash:createHash,customPageRandomUUID:()=>`request-${++id}`,teamSteps:['ACCOUNT_CREATED','DEPOSIT_COMPLETED','COPY_CONNECTED','CHALLENGE_PARTICIPANT'],
  app:Object.fromEntries(['get','post','put'].map(method=>[method,(path,fn)=>routes.set(method.toUpperCase()+' '+path,fn)])),
  miniUser:async initData=>initData==='valid'?{id:'u'}:{code:401,error:'invalid_init_data'},
  p37SuperSession:async(req,reply)=>{if(!req.actor){reply.code(401).send({error:'unauthorized'});return null}if(req.actor.role!=='SUPER_ADMIN'){reply.code(403).send({error:'super_admin_required'});return null}return req.actor},
  URL,Date,Set,Map,Promise,console};
 vm.runInNewContext(ts.transpileModule(workflow+'\n'+routesCode,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 async function dispatch(method,path,body,role){
  const decision=/^\/miniapp\/eplanet\/admin\/requests\/([^/]+)\/decision$/.exec(path);
  const route=routes.get(method+' '+(decision?'/miniapp/eplanet/admin/requests/:id/decision':path));if(!route)throw Error('unknown route '+method+' '+path);
  const reply={status:200,data:undefined,header(){return this},code(n){this.status=n;return this},send(data){this.data=data;return data}};
  const result=await route({body,params:decision?{id:decodeURIComponent(decision[1])}:{},actor:role?{id:'admin',role}:null},reply);
  return {status:reply.status,data:reply.data??result};
 }
 return {database,dispatch,changeWorkflow:(id,change)=>context.p37ChangeWorkflow(id,change,{adminUserId:'admin'}),statuses:(w,r=[])=>context.eplanetStatuses(w,r),prune:r=>context.eplanetPrune(r)};
}
