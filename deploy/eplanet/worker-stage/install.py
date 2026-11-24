#!/usr/bin/env python3
"""Prepare and test the actual VPS deposit module without modifying production.
No network to broker, no database, no service restart, no secret access.
"""
from pathlib import Path
import hashlib,json,os,subprocess,sys,tempfile
ROOT=Path('/root/miniapp10x')
MODULE=ROOT/'apps/api/src/eplanet-deposit-vps-r2.ts'
R2=Path('/root/MMTRADE_EPLANET_DEPOSIT_VPS_R2/state.json')
WORK=Path('/root/MMTRADE_EPLANET_WORKER_STAGE')
def sha(v):return hashlib.sha256(v).hexdigest()
def once(s,old,new):
 if s.count(old)!=1:raise RuntimeError('UNEXPECTED_SOURCE_ANCHOR:'+old[:90])
 return s.replace(old,new,1)
def patch(s):
 s=once(s,"const minute=60_000;",'''const minute=60_000;
 // Terminal retries have no scheduled check. An expired lease remains reclaimable.
 function scheduled(job:any):boolean {
  return Boolean(job&&ELIGIBLE_STATES.has(job.status)&&typeof job.nextCheckAfter==='string'
   &&Number.isFinite(Date.parse(job.nextCheckAfter)));
 }''')
 s=once(s,"if(last&&ELIGIBLE_STATES.has(last.status))",
          "if(last&&last.userId===userId&&scheduled(last))")
 s=once(s,"if(!job||!ELIGIBLE_STATES.has(job.status)||!job.nextCheckAfter\n      ||Date.parse(job.nextCheckAfter)>now",
          "if(!scheduled(job)\n      ||Date.parse(job.nextCheckAfter)>now")
 s=once(s,"if(!identity?.verified||identity.version!==job.identityVersion||job.policyVersion!==options().policy){",
          "const current=options();\n   if(!current.ready||!identity?.verified||identity.version!==job.identityVersion||job.policyVersion!==current.policy){")
 s=once(s,"if(finiteAmount(upstreamResult.amount))job.availableBalance=upstreamResult.amount;",
          "if(finiteAmount(upstreamResult.amount))job.availableBalance=upstreamResult.amount;\n   else delete job.availableBalance;")
 s=once(s,"job.nextCheckAfter=upstreamResult.state==='RETRYABLE_ERROR'&&job.attempts<4",
          "if(upstreamResult.state==='RETRYABLE_ERROR'&&job.attempts>=4)job.status='INDETERMINATE';\n    job.nextCheckAfter=upstreamResult.state==='RETRYABLE_ERROR'&&job.attempts<4")
 s=once(s,"let busy=false;", "let busy=false;\n let scanAfter:string|undefined;")
 old="""   const items=await prisma.systemSetting.findMany({where:{key:{startsWith:JOB}},
    select:{key:true,value:true},orderBy:{updatedAt:'desc'},take:500});
   const now=Date.now();let processed=0;
   for(const row of items){
    const job=row.value as any;
    if(processed>=5)break;
    if(!job||!ELIGIBLE_STATES.has(job.status)||!job.nextCheckAfter)continue;
    if(Date.parse(job.nextCheckAfter)>now)continue;
    if(job.status==='RUNNING'&&Date.parse(job.leaseUntil||'')>now)continue;
    processed++;await workerOne(job.checkId);
   }"""
 new="""   // Bounded rotating key scan: stable order, no fixed newest-500 cutoff.
   const items=await prisma.systemSetting.findMany({
    where:{key:{startsWith:JOB,...(scanAfter?{gt:scanAfter}:{})}},
    select:{key:true,value:true},orderBy:{key:'asc'},take:100});
   if(!items.length){scanAfter=undefined;return;}
   const now=Date.now();let processed=0;
   for(const row of items){
    if(processed>=5)break;
    scanAfter=row.key;
    const job=row.value as any;
    if(!scheduled(job)||row.key!==JOB+job.checkId)continue;
    if(Date.parse(job.nextCheckAfter)>now)continue;
    if(job.status==='RUNNING'&&Date.parse(job.leaseUntil||'')>now)continue;
    processed++;
    // A single broken row must not prevent all later rows from running.
    try{await workerOne(job.checkId);}catch{/* lease expires; fail closed */}
   }"""
 s=once(s,old,new)
 return s
TEST=r'''const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {createRequire}=require('node:module');
const path=require('node:path');
const root=process.argv[2],input=process.argv[3];
const requireFromRoot=createRequire(path.join(root,'package.json'));
const ts=requireFromRoot('typescript');
const source=fs.readFileSync(input,'utf8');
const out=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});
if((out.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error))throw Error('TS_TRANSPILE_DIAGNOSTICS');
const exp={};
new Function('require','exports',out.outputText)(require,exp);
const P='EPLANET_DEPOSIT_R1_',J=P+'JOB_',U=P+'USER_',I=P+'IDENTITY_';
const env={EPLANET_DEPOSIT_ENABLED:'1',EPLANET_DEPOSIT_PARTNER_ID:'7',EPLANET_DEPOSIT_MIN_BALANCE:'100',EPLANET_DEPOSIT_API_KEY:'TEST_ONLY',EPLANET_DEPOSIT_API_SECRET:'TEST_ONLY',EPLANET_DEPOSIT_BALANCE_UNIT:'TEST',EPLANET_DEPOSIT_UNIT_CONFIRMED:'1'};
Object.assign(process.env,env);
const policy=createHash('sha256').update(JSON.stringify({partnerId:7,threshold:100,unit:'TEST'})).digest('hex');
const rows=new Map(),workflow={id:'mock-flow',userId:'u',accountCreated:true,depositCompleted:false,version:1};
const routes={},audit=[];
let intervalFn,reads=0,mode='retry',queries=0;
const clock=Date.now(),due=new Date(clock-120000).toISOString();
const jobId=n=>'depchk_'+n.toString(16).padStart(32,'0');
function job(n,extra={}){return {userId:'u',checkId:jobId(n),status:'QUEUED',attempts:0,nextCheckAfter:due,identityVersion:'test-version',policyVersion:policy,requiredBalance:100,confirmationCount:0,...extra}}
const clone=v=>JSON.parse(JSON.stringify(v));
const db={
 systemSetting:{
  async findUnique(q){return rows.has(q.where.key)?{value:clone(rows.get(q.where.key))}:null},
  async upsert(q){rows.set(q.where.key,clone(q.update.value));return {key:q.where.key}},
  async findMany(q){
   queries++;
   const where=q.where.key;
   return [...rows.keys()].filter(k=>k.startsWith(where.startsWith)&&(!where.gt||k>where.gt)).sort().slice(0,q.take).map(key=>({key,value:clone(rows.get(key))}))
  }
 },
 user:{async findUnique(){return {eplanetWorkflow:clone(workflow)}}},
 eplanetUserWorkflow:{async findUnique(){return clone(workflow)},async updateMany(q){
  if(workflow.depositCompleted||q.where.version!==workflow.version)return {count:0};
  workflow.depositCompleted=true;workflow.version++;return {count:1}
 }},
 auditLog:{async create(q){audit.push(q.data);return q.data}},
 async $transaction(fn){return fn(db)}
};
globalThis.fetch=async(url)=>{
 reads++;
 assert.ok(url.startsWith('https://api-ib.eplanetbrokers.com/api/partner/'));
 if(mode==='retry')return {status:503};
 if(url.endsWith('check-partner-id'))return {status:200,json:async()=>({success:true})};
 if(mode==='disable'){process.env.EPLANET_DEPOSIT_ENABLED='0'}
 return {status:200,json:async()=>({success:true,hasEnoughBalance:true,availableBalance:250})}
};
const realInterval=globalThis.setInterval;
globalThis.setInterval=fn=>{intervalFn=fn;return {unref(){}}};
exp.registerEplanetDepositEngineR1({app:{post:(p,f)=>routes[p]=f,get:(p,f)=>routes[p]=f},prisma:db,miniUser:async()=>({id:'u'}),superSession:async()=>({id:'admin'})});
globalThis.setInterval=realInterval;
function reset(){rows.clear();audit.length=0;workflow.depositCompleted=false;workflow.version=1;rows.set(I+'u',{verified:true,email:'mock@example.test',proofRef:'MOCK_ONLY',version:'test-version'});process.env.EPLANET_DEPOSIT_ENABLED='1';mode='retry'}
function reply(){return {status:200,header(){return this},code(n){this.status=n;return this},send(body){this.body=body;return this}}}
async function submit(id){const rep=reply();await routes['/miniapp/eplanet/deposit/check']({body:{initData:'MOCK_ONLY',requestId:'00000000-0000-4000-8000-'+String(id).padStart(12,'0')}},rep);return rep}
async function tick(){intervalFn();for(let i=0;i<15;i++)await new Promise(setImmediate)}
(async()=>{
 reset();
 const terminal=job(1,{status:'RETRYABLE_ERROR',nextCheckAfter:null,attempts:4});
 rows.set(J+terminal.checkId,terminal);rows.set(U+'u',{lastCheckId:terminal.checkId,lastManualAt:due});
 const rep=await submit(1);
 assert.equal(rep.status,202);assert.equal(rep.body.code,'CHECK_ACCEPTED');assert.notEqual(rep.body.checkId,terminal.checkId);
 console.log('TEST_TERMINAL_RETRY_CAN_REQUEUE=PASS');
 reset();
 const j=job(2,{status:'RETRYABLE_ERROR',attempts:3,availableBalance:250});
 rows.set(J+j.checkId,j);
 for(let n=0;n<3&&rows.get(J+j.checkId).status!=='INDETERMINATE';n++)await tick();
 assert.equal(rows.get(J+j.checkId).status,'INDETERMINATE');
 assert.equal(rows.get(J+j.checkId).nextCheckAfter,null);assert.equal('availableBalance' in rows.get(J+j.checkId),false);
 console.log('TEST_FOURTH_RETRY_TERMINATES_AND_CLEARS_STALE_BALANCE=PASS');
 reset();
 for(let n=10;n<610;n++){const j=job(n,{status:'INDETERMINATE',nextCheckAfter:null});rows.set(J+j.checkId,j)}
 const tail=job(999);rows.set(J+tail.checkId,tail);
 const before=reads;
 for(let n=0;n<12&&reads===before;n++)await tick();
 assert.ok(reads>before);assert.equal(rows.get(J+tail.checkId).attempts,1);
 console.log('TEST_QUEUE_BEYOND_500=PASS');
 reset();
 const good=job(1000,{status:'PENDING_CONFIRMATION',confirmationCount:1,firstSuccessAt:due});
 rows.set(J+good.checkId,good);mode='good';
 for(let n=0;n<4&&!workflow.depositCompleted;n++)await tick();
 assert.equal(workflow.depositCompleted,true);assert.equal(audit.length,1);
 await tick();assert.equal(audit.length,1);
 console.log('TEST_TWO_CONFIRMATIONS_CAS_AND_SINGLE_AUDIT=PASS');
 reset();
 const denied=job(1001,{status:'PENDING_CONFIRMATION',confirmationCount:1,firstSuccessAt:due});
 rows.set(J+denied.checkId,denied);mode='disable';
 for(let n=0;n<4&&rows.get(J+denied.checkId).status!=='INDETERMINATE';n++)await tick();
 assert.equal(rows.get(J+denied.checkId).status,'INDETERMINATE');
 assert.equal(workflow.depositCompleted,false);assert.equal(audit.length,0);
 console.log('TEST_DISABLE_DURING_CHECK_FAILS_CLOSED=PASS');
 console.log('BACKEND_MOCK_TESTS=PASS REAL_BROKER_CALLS=0 REAL_DB_WRITES=0');
})().catch(e=>{console.error(e);process.exitCode=1});
'''
def main():
 if len(sys.argv)!=2 or sys.argv[1]!='stage':raise RuntimeError('USAGE: install.py stage')
 raw=MODULE.read_bytes()
 expected=json.loads(R2.read_text())['installed']['module']
 if sha(raw)!=expected:raise RuntimeError('VPS_MODULE_HASH_CHANGED_REFUSE_PATCH')
 updated=patch(raw.decode()).encode()
 WORK.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='worker-stage-',dir=WORK) as d:
  stage=Path(d)/MODULE.name
  stage.write_bytes(updated)
  test=Path(d)/'test.cjs';test.write_text(TEST)
  clean_env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'NODE_OPTIONS':'--max-old-space-size=384'}
  proc=subprocess.run(['node',str(test),str(ROOT),str(stage)],env=clean_env,cwd=d,timeout=45)
  if proc.returncode:raise RuntimeError('BACKEND_TESTS_FAILED_NO_PRODUCTION_CHANGES')
  (WORK/'candidate.ts').write_bytes(updated)
  (WORK/'tests.cjs').write_text(TEST)
  (WORK/'manifest.json').write_text(json.dumps({'before':sha(raw),'candidate':sha(updated),'scope':'stage-only'},indent=2))
 print('STAGE=PASS PRODUCTION_WRITES=NO BUILD=NO RESTART=NO')
 print('CANDIDATE='+str(WORK/'candidate.ts'))
 print('ENGINE_ACTIVATION=NOT_PERFORMED')
if __name__=='__main__':
 try:main()
 except Exception as e:print('ERROR='+str(e),flush=True);sys.exit(1)
