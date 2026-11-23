/* MMTRADE_EPLANET_DEPOSIT_ENGINE_R1 -- additive, fail-closed server module. */
import { createHmac, createHash, randomUUID } from 'node:crypto';

const PREFIX='EPLANET_DEPOSIT_R1_';
const JOB=PREFIX+'JOB_';
const IDENTITY=PREFIX+'IDENTITY_';
const USER=PREFIX+'USER_';
const IDEM=PREFIX+'IDEM_';
const PARTNER_BASE='https://api-ib.eplanetbrokers.com';
const ELIGIBLE_STATES=new Set(['QUEUED','PENDING_CONFIRMATION','RETRYABLE_ERROR','RUNNING']);
const minute=60_000;
function finiteAmount(v:any):v is number {return typeof v==='number'&&Number.isFinite(v)&&v>=0;}
function digest(v:string){return createHash('sha256').update(v).digest('hex');}
function codeFor(status:string){
 return ({QUEUED:'CHECK_QUEUED',RUNNING:'CHECK_RUNNING',
 PENDING_CONFIRMATION:'BALANCE_CONFIRMATION_PENDING',
 INSUFFICIENT_BALANCE:'BALANCE_BELOW_THRESHOLD',PARTNER_MISMATCH:'BROKER_PARTNER_MISMATCH',
 INDETERMINATE:'BROKER_INDETERMINATE',RETRYABLE_ERROR:'BROKER_TEMPORARILY_UNAVAILABLE',
 VERIFIED:'DEPOSIT_VERIFIED',CONFIGURATION_ERROR:'BROKER_CONFIGURATION_ERROR'} as Record<string,string>)[status]||'BROKER_INDETERMINATE';
}
function options(){
 const partnerId=Number(process.env.EPLANET_DEPOSIT_PARTNER_ID);
 const threshold=Number(process.env.EPLANET_DEPOSIT_MIN_BALANCE);
 const key=process.env.EPLANET_DEPOSIT_API_KEY||'';
 const secret=process.env.EPLANET_DEPOSIT_API_SECRET||'';
 const unit=process.env.EPLANET_DEPOSIT_BALANCE_UNIT||'';
 const active=process.env.EPLANET_DEPOSIT_ENABLED==='1';
 const ready=active&&Number.isSafeInteger(partnerId)&&partnerId>0
  &&Number.isFinite(threshold)&&threshold>0&&threshold<=1_000_000_000
  &&Boolean(key)&&Boolean(secret)&&unit.length>0
  &&process.env.EPLANET_DEPOSIT_UNIT_CONFIRMED==='1';
 return {partnerId,threshold,key,secret,unit,active,ready,policy:digest(JSON.stringify({partnerId,threshold,unit}))};
}
async function get(db:any,key:string){const x=await db.systemSetting.findUnique({where:{key},select:{value:true}});return x?.value as any||null;}
async function put(db:any,key:string,value:any){await db.systemSetting.upsert({where:{key},create:{key,value},update:{value}});}
function err(reply:any,http:number,code:string,retryAfterSeconds?:number){
 if(retryAfterSeconds)reply.header('Retry-After',String(retryAfterSeconds));
 return reply.code(http).send({ok:false,code,...(retryAfterSeconds?{retryAfterSeconds}:{})});
}
function checkResult(job:any,completed:boolean){
 return {ok:true,code:codeFor(job.status),checkId:job.checkId,status:job.status,
 ...(job.checkedAt?{result:{partnerMatched:job.partnerMatched===true,
 ...(finiteAmount(job.availableBalance)?{availableBalance:job.availableBalance}:{}),
 requiredBalance:job.requiredBalance,checkedAt:job.checkedAt,
 confirmationCount:job.confirmationCount||0,confirmationRequired:2}}:{}),
 ...(job.nextCheckAfter?{nextCheckAfter:job.nextCheckAfter}:{}),
 workflow:{depositCompleted:completed,nextStep:completed?'connect':'deposit'}};
}
async function upstream(path:string,body:any,opt:ReturnType<typeof options>){
 const timestamp=String(Date.now());
 const signed={method:'POST',url:path,body,timestamp};
 const sorted=Object.fromEntries(Object.keys(signed).sort().map(k=>[k,(signed as any)[k]]));
 const signature=createHmac('sha256',opt.secret).update(JSON.stringify(sorted)).digest('hex');
 let response:Response;
 try{
  response=await fetch(PARTNER_BASE+path,{
   method:'POST',headers:{'content-type':'application/json','x-api-key':opt.key,
   'x-signature':signature,'x-timestamp':timestamp},
   body:JSON.stringify(body),signal:AbortSignal.timeout(8000),redirect:'error'
  });
 }catch{return {kind:'retry'} as const;}
 if(response.status===401||response.status===403)return {kind:'config'} as const;
 if(response.status===429||response.status>=500)return {kind:'retry'} as const;
 if(response.status!==200)return {kind:'unknown'} as const;
 let data:any;
 try{data=await response.json();}catch{return {kind:'unknown'} as const;}
 if(!data||typeof data!=='object'||Array.isArray(data))return {kind:'unknown'} as const;
 return {kind:'response',data} as const;
}
async function brokerCheck(email:string,opt:ReturnType<typeof options>){
 const member=await upstream('/api/partner/check-partner-id',{email,partnerId:opt.partnerId},opt);
 if(member.kind!=='response')return {state:member.kind==='config'?'CONFIGURATION_ERROR':member.kind==='retry'?'RETRYABLE_ERROR':'INDETERMINATE'} as any;
 if(member.data.success!==true){
  const d=member.data.details;
  if(member.data.success===false&&d&&typeof d==='object'
    &&Number.isSafeInteger(d.actualPartnerId)&&d.actualPartnerId!==opt.partnerId)
   return {state:'PARTNER_MISMATCH'} as any;
  return {state:'INDETERMINATE'} as any;
 }
 const balance=await upstream('/api/partner/check-balance-partner',
  {email,partnerId:opt.partnerId,balance:opt.threshold},opt);
 if(balance.kind!=='response')return {state:balance.kind==='config'?'CONFIGURATION_ERROR':balance.kind==='retry'?'RETRYABLE_ERROR':'INDETERMINATE'} as any;
 const b=balance.data;
 if(b.success===true&&b.hasEnoughBalance===true
   &&finiteAmount(b.availableBalance)&&b.availableBalance>=opt.threshold)
  return {state:'GOOD',amount:b.availableBalance,partnerMatched:true} as any;
 if(finiteAmount(b.availableBalance)&&b.availableBalance<opt.threshold
   &&b.hasEnoughBalance===false && (b.success===true||b.success===false))
  return {state:'INSUFFICIENT_BALANCE',amount:b.availableBalance,partnerMatched:true} as any;
 return {state:'INDETERMINATE'} as any;
}
export function registerEplanetDepositEngineR1(deps:any){
 const {app,prisma,miniUser,eplanetSerialize,p37LockWorkflow,superSession}=deps;
 async function authenticate(request:any,reply:any){
  const parsed=typeof request.body==='object'&&request.body&&!Array.isArray(request.body)?request.body:null;
  if(!parsed||typeof parsed.initData!=='string'||parsed.initData.length<1||parsed.initData.length>10000)return {error:err(reply,400,'INVALID_REQUEST')};
  const result=await miniUser(parsed.initData,false);
  if('code'in result)return {error:err(reply,401,'TELEGRAM_AUTH_INVALID')};
  return {user:result};
 }
 app.post('/miniapp/eplanet/deposit/check',async(request:any,reply:any)=>{
  reply.header('Cache-Control','no-store');
  const auth=await authenticate(request,reply);if(auth.error)return auth.error;
  const body=request.body as any;
  if(Object.keys(body).sort().join(',')!=='initData,requestId'||typeof body.requestId!=='string'
    ||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId))
   return err(reply,400,'INVALID_REQUEST');
  const userId=auth.user.id,opt=options();
  if(!opt.active)return err(reply,503,'ENGINE_DISABLED');
  if(!opt.ready)return err(reply,503,'BROKER_NOT_CONFIGURED');
  return eplanetSerialize(async(tx:any)=>{
   const user=await tx.user.findUnique({where:{id:userId},select:{eplanetWorkflow:true}});
   if(!user?.eplanetWorkflow?.accountCreated)return err(reply,409,'PREVIOUS_STEP_INCOMPLETE');
   if(user.eplanetWorkflow.depositCompleted)return reply.code(200).send({
    ok:true,code:'DEPOSIT_ALREADY_COMPLETED',status:'VERIFIED',
    checkId:(await get(tx,USER+userId))?.lastCheckId||'',workflow:{depositCompleted:true,nextStep:'connect'}
   });
   const identity=await get(tx,IDENTITY+userId);
   if(!identity?.verified||typeof identity.email!=='string'||!identity.proofRef||!identity.version)
    return err(reply,403,'BROKER_EMAIL_UNVERIFIED');
   const existingId=await get(tx,IDEM+userId+'_'+body.requestId);
   if(existingId?.checkId){
    const old=await get(tx,JOB+existingId.checkId);
    if(old?.userId===userId)return reply.code(202).send({ok:true,code:'CHECK_ALREADY_RUNNING',
     checkId:old.checkId,status:old.status,pollAfterSeconds:2});
   }
   const state=await get(tx,USER+userId)||{},last=state.lastCheckId?await get(tx,JOB+state.lastCheckId):null;
   if(last&&ELIGIBLE_STATES.has(last.status))
    return reply.code(202).send({ok:true,code:'CHECK_ALREADY_RUNNING',checkId:last.checkId,status:last.status,pollAfterSeconds:2});
   const now=Date.now(),day=new Date(now).toISOString().slice(0,10);
   if(state.lastManualAt&&now-Date.parse(state.lastManualAt)<minute)
    return err(reply,429,'CHECK_COOLDOWN',Math.max(1,Math.ceil((minute-(now-Date.parse(state.lastManualAt)))/1000)));
   if(state.day===day&&(state.count||0)>=20)return err(reply,429,'CHECK_LIMIT_REACHED',60);
   const checkId='depchk_'+randomUUID().replaceAll('-',''),job={
    userId,checkId,requestId:body.requestId,status:'QUEUED',attempts:0,
    confirmationCount:0,partnerMatched:false,requiredBalance:opt.threshold,
    identityVersion:identity.version,policyVersion:opt.policy,
    nextCheckAfter:new Date(now).toISOString(),createdAt:new Date(now).toISOString()
   };
   await put(tx,JOB+checkId,job);
   await put(tx,USER+userId,{lastCheckId:checkId,lastManualAt:job.createdAt,day,count:(state.day===day?state.count||0:0)+1});
   await put(tx,IDEM+userId+'_'+body.requestId,{checkId,createdAt:job.createdAt});
   return reply.code(202).send({ok:true,code:'CHECK_ACCEPTED',checkId,status:'QUEUED',pollAfterSeconds:2});
  });
 });
 app.post('/miniapp/eplanet/deposit/check/status',async(request:any,reply:any)=>{
  reply.header('Cache-Control','no-store');const auth=await authenticate(request,reply);if(auth.error)return auth.error;
  const body=request.body as any;
  if(Object.keys(body).sort().join(',')!=='checkId,initData'||typeof body.checkId!=='string'
    ||!/^depchk_[a-f0-9]{32}$/.test(body.checkId))return err(reply,400,'INVALID_REQUEST');
  const job=await get(prisma,JOB+body.checkId);
  if(!job||job.userId!==auth.user.id)return err(reply,404,'CHECK_NOT_FOUND');
  const user=await prisma.user.findUnique({where:{id:auth.user.id},select:{eplanetWorkflow:{select:{depositCompleted:true}}}});
  return checkResult(job,user?.eplanetWorkflow?.depositCompleted===true);
 });
 // Only superadmin can assert a separately verified broker email. This endpoint never self-verifies email.
 app.post('/miniapp/eplanet/deposit/admin/bind-email',async(request:any,reply:any)=>{
  const actor=await superSession(request,reply);if(!actor)return;
  const data=request.body as any;
  if(!data||Object.keys(data).sort().join(',')!=='email,proofRef,userId'
    ||typeof data.userId!=='string'||data.userId.length>100
    ||typeof data.email!=='string'||data.email.length>254
    ||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
    ||typeof data.proofRef!=='string'||data.proofRef.length<8||data.proofRef.length>200)
   return err(reply,400,'INVALID_REQUEST');
  const email=data.email.trim().toLowerCase();
  return eplanetSerialize(async(tx:any)=>{
   await p37LockWorkflow(tx,data.userId);
   const u=await tx.user.findUnique({where:{id:data.userId},select:{eplanetWorkflow:true}});
   if(!u?.eplanetWorkflow?.accountCreated)return err(reply,409,'PREVIOUS_STEP_INCOMPLETE');
   const old=await get(tx,IDENTITY+data.userId);
   if(old?.verified&&old.email!==email&&u.eplanetWorkflow.depositCompleted)
    return err(reply,409,'DEPOSIT_STEP_UNAVAILABLE');
   const identity={email,verified:true,proofRef:data.proofRef,version:randomUUID(),verifiedAt:new Date().toISOString(),adminUserId:actor.id};
   await put(tx,IDENTITY+data.userId,identity);
   await tx.auditLog.create({data:{adminUserId:actor.id,userId:data.userId,action:'EPLANET_BROKER_EMAIL_ATTESTED',
    entityType:'EplanetDepositIdentity',entityId:data.userId,metadata:{proofRef:data.proofRef}}});
   return {ok:true,code:'BROKER_EMAIL_BOUND'};
  });
 });
 app.get('/miniapp/eplanet/deposit/admin/health',async(request:any,reply:any)=>{
  const actor=await superSession(request,reply);if(!actor)return;
  const opt=options();return {ok:true,enabled:opt.active,configured:opt.ready,unit:opt.unit||null};
 });
 let busy=false;
 async function workerOne(checkId:string){
  const opt=options();if(!opt.ready)return;
  const lease=randomUUID(),now=Date.now();
  const claim=await eplanetSerialize(async(tx:any)=>{
   const job=await get(tx,JOB+checkId);
   if(!job||!ELIGIBLE_STATES.has(job.status)||!job.nextCheckAfter
      ||Date.parse(job.nextCheckAfter)>now
      ||(job.status==='RUNNING'&&Date.parse(job.leaseUntil||'')>now))return null;
   const identity=await get(tx,IDENTITY+job.userId);
   const u=await tx.user.findUnique({where:{id:job.userId},select:{eplanetWorkflow:true}});
   if(!identity?.verified||identity.version!==job.identityVersion
     ||!u?.eplanetWorkflow?.accountCreated||u.eplanetWorkflow.depositCompleted
     ||job.policyVersion!==opt.policy){
    job.status='INDETERMINATE';job.nextCheckAfter=null;await put(tx,JOB+checkId,job);return null;
   }
   job.status='RUNNING';job.lease=lease;job.leaseUntil=new Date(now+45000).toISOString();
   job.attempts=(job.attempts||0)+1;await put(tx,JOB+checkId,job);
   return {email:identity.email,userId:job.userId};
  });
  if(!claim)return;
  const upstreamResult=await brokerCheck(claim.email,opt);
  await eplanetSerialize(async(tx:any)=>{
   const job=await get(tx,JOB+checkId);if(!job||job.lease!==lease||job.status!=='RUNNING')return;
   const identity=await get(tx,IDENTITY+job.userId);
   if(!identity?.verified||identity.version!==job.identityVersion||job.policyVersion!==options().policy){
    job.status='INDETERMINATE';job.nextCheckAfter=null;await put(tx,JOB+checkId,job);return;
   }
   const stamp=Date.now();job.checkedAt=new Date(stamp).toISOString();
   job.partnerMatched=upstreamResult.partnerMatched===true;
   if(finiteAmount(upstreamResult.amount))job.availableBalance=upstreamResult.amount;
   if(upstreamResult.state==='GOOD'){
    if(job.confirmationCount===1&&job.firstSuccessAt
      &&stamp-Date.parse(job.firstSuccessAt)>=minute
      &&stamp-Date.parse(job.firstSuccessAt)<=10*minute){
     await p37LockWorkflow(tx,job.userId);
     const u=await tx.eplanetUserWorkflow.findUnique({where:{userId:job.userId}});
     if(!u?.accountCreated){job.status='INDETERMINATE';job.nextCheckAfter=null;}
     else if(u.depositCompleted){job.status='VERIFIED';job.nextCheckAfter=null;}
     else{
      const result=await tx.eplanetUserWorkflow.updateMany({
       where:{userId:job.userId,version:u.version,accountCreated:true,depositCompleted:false},
       data:{depositCompleted:true,version:{increment:1}}
      });
      if(result.count===1){
       job.status='VERIFIED';job.confirmationCount=2;job.nextCheckAfter=null;
       await tx.auditLog.create({data:{userId:job.userId,action:'EPLANET_DEPOSIT_AUTO_APPROVED',
        entityType:'EplanetUserWorkflow',entityId:u.id,
        metadata:{source:'SYSTEM_DEPOSIT_ENGINE',checkId,requiredBalance:opt.threshold,
          availableBalance:job.availableBalance,policyVersion:opt.policy}}});
      }else{job.status='INDETERMINATE';job.nextCheckAfter=null;}
     }
    }else{
     job.status='PENDING_CONFIRMATION';job.confirmationCount=1;
     job.firstSuccessAt=job.checkedAt;job.nextCheckAfter=new Date(stamp+minute).toISOString();
    }
   }else{
    job.confirmationCount=0;job.firstSuccessAt=null;job.status=upstreamResult.state;
    job.nextCheckAfter=upstreamResult.state==='RETRYABLE_ERROR'&&job.attempts<4
     ?new Date(stamp+Math.min(5*minute,minute*Math.pow(2,job.attempts-1))).toISOString():null;
   }
   delete job.lease;delete job.leaseUntil;
   await put(tx,JOB+checkId,job);
  });
 }
 async function tick(){
  if(busy||!options().ready)return;
  busy=true;
  try{
   // Small scale V1 queue. No banking/user data is ever logged.
   const items=await prisma.systemSetting.findMany({where:{key:{startsWith:JOB}},
    select:{key:true,value:true},orderBy:{updatedAt:'desc'},take:500});
   const now=Date.now();let processed=0;
   for(const row of items){
    const job=row.value as any;
    if(processed>=5)break;
    if(!job||!ELIGIBLE_STATES.has(job.status)||!job.nextCheckAfter)continue;
    if(Date.parse(job.nextCheckAfter)>now)continue;
    if(job.status==='RUNNING'&&Date.parse(job.leaseUntil||'')>now)continue;
    processed++;await workerOne(job.checkId);
   }
  }catch{/* Worker fail closed; error details must be inspected in server monitoring. */}
  finally{busy=false;}
 }
 const interval=setInterval(()=>void tick(),5000);interval.unref?.();
}
