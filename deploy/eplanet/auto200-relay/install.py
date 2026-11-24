#!/usr/bin/env python3
"""Enable ePlanet deposit auto-check via the existing relay; explicit USD or fail closed.
Requires the already deployed worker safety fixes and recovery/worker-deploy tools.
No DB migration, no credential copies, no full project build.
"""
import os, sys, json, hashlib, stat, tempfile, subprocess, runpy, re
from pathlib import Path
ROOT=Path('/root/miniapp10x')
SRC=ROOT/'apps/api/src'
DIST=ROOT/'dist/apps/api/src'
POLICY=Path('/root/.eplanet-deposit-policy.json')
PARTNER=Path('/root/.config/mmtrade/eplanet-partner.json')
RELAY=Path('/root/.config/mmtrade/eplanet-relay.json')
BASE=Path('/root/MMTRADE_EPLANET_WORKER_DEPLOY/install.py')
TESTS=Path('/root/MMTRADE_EPLANET_WORKER_STAGE/tests.cjs')
UI_ROOTS=[ROOT/'public/miniapp/p74/eplanet',Path('/srv/tenx-public/miniapp/p74/eplanet')]
ENGINE='eplanet-deposit-vps-r2'
BALANCE='eplanet-balance-relay'
MEMBER='eplanet-member-check'
MARK='<!-- EPLANET_MANUAL_REVIEW_MODE: auto UI dormant until verified broker rollout -->'
SCRIPT='<script src="/miniapp/p74/eplanet/deposit-ui-vps-r2.js?v=RELAY_AUTO_200_USD_1"></script>'
def need(b,code):
 if not b:raise RuntimeError(code)
def once(s,a,b):
 need(s.count(a)==1,'SOURCE_ANCHOR_MISMATCH:'+a[:80])
 return s.replace(a,b,1)
def secure(p):
 s=p.lstat()
 need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and not s.st_mode&0o077,'UNSAFE_CONFIG:'+p.name)
 return json.loads(p.read_text())
def read(p):
 need(p.is_file() and not p.is_symlink(),'MISSING_OR_UNSAFE:'+str(p))
 return p.read_text()
def run(args,t=90):
 subprocess.run(args,cwd=ROOT,check=True,timeout=t,
   env={**os.environ,'NODE_OPTIONS':'--max-old-space-size=512'})
OPTIONS="""function secureDepositConfig(path:string):any {
 const s=lstatSync(path);
 if(!s.isFile()||s.uid!==0||(s.mode&0o077)!==0)throw Error('CONFIG_PERMISSIONS');
 return JSON.parse(readFileSync(path,'utf8'));
}
function options(){
 const partnerId=574882,threshold=200,unit='USD';
 let active=false,ready=false;
 try{
  const p=secureDepositConfig('/root/.eplanet-deposit-policy.json');
  active=p.enabled===true;
  const partner=secureDepositConfig('/root/.config/mmtrade/eplanet-partner.json');
  const relay=secureDepositConfig('/root/.config/mmtrade/eplanet-relay.json');
  const u=new URL(relay.url);
  ready=active&&p.partnerId===partnerId&&p.minimumBalanceUSD===threshold
   &&p.requestedCurrency===unit&&p.requireExplicitUsd===true
   &&partner.partnerId===partnerId&&u.protocol==='https:'&&u.hostname.endsWith('.workers.dev')
   &&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&u.pathname==='/';
 }catch{/* fail closed */}
 return {partnerId,threshold,unit,active,ready,
  policy:digest(JSON.stringify({partnerId,threshold,unit,currencyGuard:1}))};
}
export function eplanetDepositRuntimeStatus(){
 const {active,ready,partnerId,threshold,unit}=options();
 return {active,ready,partnerId,threshold,unit,currencyGuard:'EXPLICIT_USD'};
}
"""
UPSTREAM="""async function upstream(path:string,body:any,opt:ReturnType<typeof options>){
 let response:Response|undefined;
 if(!opt.ready||opt.partnerId!==574882||opt.threshold!==200||body.partnerId!==opt.partnerId)
  return {kind:'config'} as const;
 const verify=path==='/api/partner/check-partner-id'?relayMember:
  path==='/api/partner/check-balance-partner'&&body.balance===200?relayBalance:null;
 if(!verify)return {kind:'config'} as const;
 try{
  await verify(body.email,{transport:async(url,init)=>{
   const res=await fetch(url,init);response=res.clone();return res;
  }});
 }catch(e:any){
  if(!response)return {kind:e?.code==='EPLANET_RELAY_UNREACHABLE'?'retry':'config'} as const;
 }
 if(!response)return {kind:'unknown'} as const;
 const res=response as Response;
 if(res.status===401||res.status===403)return {kind:'config'} as const;
 if(res.status===429||res.status>=500)return {kind:'retry'} as const;
 if(res.status!==200)return {kind:'unknown'} as const;
 try{
  const raw=await res.text();
  if(raw.length>100000)return {kind:'unknown'} as const;
  const data=JSON.parse(raw);
  if(!data||typeof data.success!=='boolean')return {kind:'unknown'} as const;
  return {kind:'response',data} as const;
 }catch{return {kind:'unknown'} as const;}
}
"""
COMPILE=r'''const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const [root,stage]=process.argv.slice(2);process.chdir(root);
const req=createRequire(path.join(root,'package.json')),ts=req('typescript');
const config=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile);
if(config.error)throw Error('TS_CONFIG');
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);
if(parsed.errors.length)throw Error('TS_CONFIG_DIAGNOSTICS');
const names=['eplanet-deposit-vps-r2','eplanet-balance-relay'];
const sources=new Map(names.map(n=>[path.join(root,'apps/api/src',n+'.ts'),fs.readFileSync(path.join(stage,n+'.ts'),'utf8')]));
const opts={...parsed.options,noEmit:true,incremental:false,composite:false};
if(!opts.typeRoots)opts.typeRoots=[path.dirname(path.dirname(req.resolve('@types/node/package.json'))),path.join(root,'node_modules/@types')];
const host=ts.createCompilerHost(opts),rf=host.readFile.bind(host),fe=host.fileExists.bind(host);
host.readFile=p=>sources.get(path.resolve(p))??rf(p);
host.fileExists=p=>sources.has(path.resolve(p))||fe(p);
host.getCurrentDirectory=()=>root;
const pg=ts.createProgram([...sources.keys()],opts,host);
const errors=ts.getPreEmitDiagnostics(pg).filter(d=>d.category===ts.DiagnosticCategory.Error);
if(errors.length){for(const e of errors.slice(0,6))console.error(ts.flattenDiagnosticMessageText(e.messageText,' '));process.exit(1)}
for(const n of names){
 const f=path.join(root,'apps/api/src',n+'.ts');
 const out=ts.transpileModule(sources.get(f),{fileName:f,compilerOptions:{...parsed.options,module:ts.ModuleKind.ES2022,moduleResolution:ts.ModuleResolutionKind.Bundler,noEmit:false,sourceMap:false,inlineSourceMap:false,declaration:false,incremental:false,composite:false},reportDiagnostics:true});
 if((out.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error))throw Error('EMIT_FAILED');
 fs.writeFileSync(path.join(stage,n+'.mjs'),out.outputText);
}
console.log('TYPECHECK=PASS ESM_EMIT=PASS');
'''
def make_tests():
 s=read(TESTS)
 s=once(s,"new Function('require','exports',out.outputText)(require,exp);",'''const mockFs={
 lstatSync:()=>({isFile:()=>true,uid:0,mode:0o600}),
 readFileSync:p=>JSON.stringify(p.includes('policy')?{
 enabled:process.env.EPLANET_DEPOSIT_ENABLED==='1',partnerId:574882,
 minimumBalanceUSD:200,requestedCurrency:'USD',requireExplicitUsd:true
 }:p.includes('partner.json')?{partnerId:574882}:{url:'https://mock.workers.dev'})
};
const fakeRelay=p=>({eplanetVerifyOwnership:async(email,opts)=>{
 try{return await opts.transport('https://mock.workers.dev/api/partner/'+p,{
 method:'POST',body:JSON.stringify({email,partnerId:574882,...(p==='check-balance-partner'?{balance:200}:{})})
 })}catch{throw Object.assign(Error('mock'),{code:'EPLANET_RELAY_UNREACHABLE'})}
}});
const mockRequire=n=>n==='node:fs'?mockFs:n==='./eplanet-member-check.js'?fakeRelay('check-partner-id'):n==='./eplanet-balance-relay.js'?fakeRelay('check-balance-partner'):require(n);
new Function('require','exports',out.outputText)(mockRequire,exp);''')
 s=once(s,"JSON.stringify({partnerId:7,threshold:100,unit:'TEST'})","JSON.stringify({partnerId:574882,threshold:200,unit:'USD',currencyGuard:1})")
 s=s.replace("requiredBalance:100","requiredBalance:200")
 a=s.index('globalThis.fetch=async(url)=>{');b=s.index('const realInterval=',a)
 s=s[:a]+'''globalThis.fetch=async(url,init)=>{
 reads++;
 assert.ok(url.startsWith('https://mock.workers.dev/api/partner/'));
 const request=JSON.parse(init.body);assert.equal(request.partnerId,574882);
 if(mode==='retry')return new Response('{}',{status:503});
 if(url.endsWith('check-partner-id'))return new Response(JSON.stringify({success:true}),{status:200});
 assert.equal(request.balance,200);
 if(mode==='disable')process.env.EPLANET_DEPOSIT_ENABLED='0';
 const data={success:true,hasEnoughBalance:true,availableBalance:250,currency:'USD'};
 if(mode==='no-unit')delete data.currency;
 if(mode==='wrong-unit')data.currency='USC';
 if(mode==='conflict-unit')data.balanceCurrency='EUR';
 if(mode==='insufficient'){data.availableBalance=199;data.hasEnoughBalance=false}
 return new Response(JSON.stringify(data),{status:200});
};
'''+s[b:]
 s=once(s,"console.log('BACKEND_MOCK_TESTS=PASS REAL_BROKER_CALLS=0 REAL_DB_WRITES=0');",'''for(const [i,m,expected] of [[1002,'no-unit','INDETERMINATE'],[1003,'wrong-unit','INDETERMINATE'],[1004,'conflict-unit','INDETERMINATE'],[1005,'insufficient','INSUFFICIENT_BALANCE']]){
 reset();const j=job(i,{status:'PENDING_CONFIRMATION',confirmationCount:1,firstSuccessAt:due});
 rows.set(J+j.checkId,j);mode=m;
 for(let n=0;n<4&&rows.get(J+j.checkId).status!==expected;n++)await tick();
 assert.equal(rows.get(J+j.checkId).status,expected);assert.equal(workflow.depositCompleted,false);assert.equal(audit.length,0);
 console.log('TEST_'+m.toUpperCase()+'=PASS');
}
console.log('BACKEND_MOCK_TESTS=PASS REAL_BROKER_CALLS=0 REAL_DB_WRITES=0');''')
 return s
def main():
 need(os.geteuid()==0,'ROOT_REQUIRED')
 need(sys.argv[1:]==['deploy'],'USAGE: install.py deploy')
 old=runpy.run_path(str(BASE));old['guard']()
 p=secure(POLICY);pc=secure(PARTNER);rc=secure(RELAY)
 need(p.get('enabled') is False and p.get('partnerId')==574882 and p.get('minimumBalanceUSD')==200 and p.get('requestedCurrency')=='USD','POLICY_MISMATCH')
 need(pc.get('partnerId')==574882,'PARTNER_MISMATCH')
 need(isinstance(rc.get('url'),str) and re.fullmatch(r'https://[a-zA-Z0-9.-]+\.workers\.dev/?',rc['url']),'RELAY_CONFIG_INVALID')
 engine=read(SRC/(ENGINE+'.ts'));member=read(SRC/(MEMBER+'.ts'))
 need(read(DIST/(MEMBER+'.js')) and all(x in engine for x in ['function scheduled(job:any)','!current.ready','delete job.availableBalance','EPLANET_DEPOSIT_VPS_R2_TX_LOCK']),'WORKER_BASELINE_MISMATCH')
 balance=once(member,'/api/partner/check-partner-id','/api/partner/check-balance-partner')
 balance=once(balance,'const body={email,partnerId:partner.partnerId};','const body={email,partnerId:partner.partnerId,balance:200};')
 # Keep the existing stage-one module and its relay signing untouched.
 # Enforce the partner ID against both independently read broker configs.
 balance=once(balance,'const body={email,partnerId:partner.partnerId,balance:200};',"if(partner.partnerId!==574882)throw new EplanetVerifyError('EPLANET_PARTNER_REJECTED');\n  const body={email,partnerId:partner.partnerId,balance:200};")
 a=engine.index('function options(){');b=engine.index('async function get(',a)
 engine=engine[:a]+OPTIONS+engine[b:]
 a=engine.index('async function upstream(');b=engine.index('async function brokerCheck(',a)
 engine=engine[:a]+UPSTREAM+engine[b:]
 engine=once(engine,'const b=balance.data;',"""const b=balance.data;
 const currencies=[b.currency,b.balanceCurrency].filter(v=>v!==undefined&&v!==null);
 if(!currencies.length||currencies.some(v=>v!=='USD'))
  return {state:'INDETERMINATE'} as any;""")
 engine=once(engine,'if(member.data.success!==true){',"""if(member.data.success===true&&member.data.details&&
  Number.isSafeInteger(member.data.details.actualPartnerId)&&member.data.details.actualPartnerId!==opt.partnerId)
  return {state:'PARTNER_MISMATCH'} as any;
 if(member.data.success!==true){""")
 engine="import {lstatSync,readFileSync} from 'node:fs';\nimport {eplanetVerifyOwnership as relayMember} from './eplanet-member-check.js';\nimport {eplanetVerifyOwnership as relayBalance} from './eplanet-balance-relay.js';\n"+engine
 # Verify the UI is the identical existing R3 script on both source/live.
 html=read(UI_ROOTS[0]/'index.html');ui=read(UI_ROOTS[0]/'deposit-ui-vps-r2.js')
 need(read(UI_ROOTS[1]/'index.html')==html and read(UI_ROOTS[1]/'deposit-ui-vps-r2.js')==ui,'UI_SOURCE_LIVE_MISMATCH')
 need('MMTRADE_EPLANET_DEPOSIT_VPS_R3' in ui and 'function legacy(reason)' in ui,'UI_BASELINE_MISMATCH')
 html=once(html,MARK,SCRIPT)
 a=ui.index(' function legacy(reason)');b=ui.index(' function render()',a)
 ui=ui[:a]+""" function legacy(reason){
  fallback=false;stop();wrap.hidden=false;submit.hidden=true;btn.hidden=false;
  notify(reason+'؛ تأیید خودکار تا دریافت پاسخ معتبر انجام نمی‌شود.');
 }
"""+ui[b:]
 ui=once(ui,"heading.textContent='بررسی خودکار موجودی ePlanet';","heading.textContent='بررسی خودکار موجودی ۲۰۰ دلاری ePlanet';")
 work=Path(tempfile.mkdtemp(prefix='MMTRADE_EPLANET_AUTO200_',dir='/root'));os.chmod(work,0o700)
 (work/(ENGINE+'.ts')).write_text(engine);(work/(BALANCE+'.ts')).write_text(balance)
 (work/'compile.cjs').write_text(COMPILE);(work/'tests.cjs').write_text(make_tests());(work/'ui.js').write_text(ui)
 run(['node',str(work/'tests.cjs'),str(ROOT),str(work/(ENGINE+'.ts'))],60)
 run(['node',str(work/'compile.cjs'),str(ROOT),str(work)],100)
 for n in [ENGINE,BALANCE]:run(['node','--check',str(work/(n+'.mjs'))],15)
 run(['node','--check',str(work/'ui.js')],15)
 p.update(enabled=True,requireExplicitUsd=True,brokerUnitConfirmed=False)
 changes={}
 for n in [ENGINE,BALANCE]:
  changes[SRC/(n+'.ts')]=(work/(n+'.ts')).read_bytes()
  changes[DIST/(n+'.js')]=(work/(n+'.mjs')).read_bytes()
 for d in UI_ROOTS:
  changes[d/'index.html']=html.encode();changes[d/'deposit-ui-vps-r2.js']=ui.encode()
 changes[POLICY]=json.dumps(p,indent=2).encode()
 for path in [SRC/(BALANCE+'.ts'),DIST/(BALANCE+'.js')]:
  need(not path.exists() and not path.is_symlink(),'BALANCE_MODULE_ALREADY_EXISTS')
 backups={};manifest=[]
 for i,(path,data) in enumerate(changes.items()):
  need(not path.is_symlink(),'SYMLINK_TARGET')
  original=path.read_bytes() if path.exists() else None
  mode=stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o644
  backups[path]=(original,mode)
  name='backup-'+str(i)
  if original is not None:
   (work/name).write_bytes(original);os.chmod(work/name,0o600)
  manifest.append({'path':str(path),'backup':name if original is not None else None,'mode':mode,'after_sha256':hashlib.sha256(data).hexdigest()})
 (work/'manifest.json').write_text(json.dumps(manifest,indent=2))
 print('BACKUP='+str(work),flush=True)
 touched=[]
 try:
  for path,data in changes.items():
   before,mode=backups[path]
   need((path.read_bytes() if path.exists() else None)==before,'CONCURRENT_CHANGE')
   old['atomic'](path,data,mode);touched.append(path)
  old['restart']()
  check="import {eplanetDepositRuntimeStatus as s} from './dist/apps/api/src/eplanet-deposit-vps-r2.js'; const r=s(); if(!r.active||!r.ready||r.threshold!==200)process.exit(1);console.log(JSON.stringify(r));"
  run(['node','--input-type=module','-e',check],15)
  need(old['healthy'](),'API_HEALTH_FAILED')
  for path,data in changes.items():need(path.read_bytes()==data,'POST_DEPLOY_FILE_MISMATCH')
 except BaseException:
  print('DEPLOY_FAILED_ROLLBACK=START',flush=True)
  for path in reversed(touched):
   before,mode=backups[path]
   need(path.read_bytes()==changes[path],'ROLLBACK_CONCURRENT_CHANGE')
   if before is None:path.unlink()
   else:old['atomic'](path,before,mode)
  old['restart']()
  print('ROLLBACK=PASS',flush=True)
  raise
 print('AUTO_ENGINE=ENABLED MIN_USD=200 RELAY=EXISTING EXPLICIT_USD_REQUIRED=YES',flush=True)
 print('USER_UI=AUTO_CHECK REAL_ACCOUNT_VALIDATION=PENDING STAGE1_VERIFIED_IDENTITY_REQUIRED=YES',flush=True)
 print('NO_DB_MIGRATION=YES NO_FULL_BUILD=YES MANUAL_ADMIN_OVERRIDE_UNCHANGED=YES',flush=True)
if __name__=='__main__':
 try:main()
 except Exception as e:print('ERROR='+str(e),flush=True);sys.exit(1)
