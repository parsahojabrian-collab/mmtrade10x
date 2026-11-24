#!/usr/bin/env node
// Read-only IB queries. Stage a disabled local policy; never load into systemd.
import fs from 'node:fs';
import {createHmac,randomUUID} from 'node:crypto';
const credentials='/root/.eplanet-deposit-credentials.json';
const policy='/root/.eplanet-deposit-policy.json';
const base='https://api-ib.eplanetbrokers.com';
const expected=574882;
function fail(code){console.log('ERROR='+code);process.exitCode=1;}
async function main(){
 const st=fs.lstatSync(credentials);
 if(!st.isFile()||st.isSymbolicLink()||st.uid!==0||(st.mode&0o077)!==0)
  throw Error('CREDENTIAL_FILE_UNSAFE');
 const c=JSON.parse(fs.readFileSync(credentials,'utf8'));
 if(typeof c.apiKey!=='string'||!c.apiKey.trim()||typeof c.apiSecret!=='string'||!c.apiSecret.trim()||c.partnerId!==expected)
  throw Error('CREDENTIAL_CONFIG_INVALID');
 if(!fs.existsSync(policy)){
  const fd=fs.openSync(policy,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify({partnerId:expected,minimumBalanceUSD:10,requestedCurrency:'USD',brokerUnitConfirmed:false,enabled:false},null,2)+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 }else{
  const p=fs.lstatSync(policy);
  if(!p.isFile()||p.isSymbolicLink()||p.uid!==0||(p.mode&0o077)!==0)throw Error('POLICY_FILE_UNSAFE');
  const saved=JSON.parse(fs.readFileSync(policy,'utf8'));
  if(saved.partnerId!==expected||saved.minimumBalanceUSD!==10||saved.requestedCurrency!=='USD'||saved.brokerUnitConfirmed!==false||saved.enabled!==false)throw Error('EXISTING_POLICY_DIFFERS');
 }
 console.log('POLICY_SAVED=YES MIN_BALANCE_USD=10');
 console.log('ENGINE_ACTIVATION=NOT_PERFORMED BROKER_UNIT_CONFIRMED=NO');
 const email='mmtrade-probe-'+randomUUID()+'@example.com';
 async function probe(label,path,body){
  // Exact signing convention of deployed R2 module.
  const timestamp=String(Date.now());
  const signed=JSON.stringify({body,method:'POST',timestamp,url:path});
  const signature=createHmac('sha256',c.apiSecret).update(signed).digest('hex');
  try{
   const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json','x-api-key':c.apiKey,'x-signature':signature,'x-timestamp':timestamp},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(8000)});
   console.log(label+'_HTTP='+r.status);
   let d;
   try{d=await r.json()}catch{console.log(label+'_JSON=NO');return r.status}
   console.log(label+'_JSON='+((d&&typeof d==='object'&&!Array.isArray(d))?'YES':'NO'));
   if(d&&typeof d==='object'){
    for(const k of ['success','hasEnoughBalance']){
     if(typeof d[k]==='boolean')console.log(label+'_'+k.toUpperCase()+'='+String(d[k]).toUpperCase());
    }
    console.log(label+'_BALANCE_FIELD='+((typeof d.availableBalance==='number'&&Number.isFinite(d.availableBalance))?'NUMBER':'ABSENT_OR_OTHER'));
    // Only fixed currency names; never print arbitrary response fields, email or balances.
    const unit=d.currency??d.balanceCurrency??d.unit;
    if(typeof unit==='string'&&['USD','USC','EUR','CENT','CENTS','USDT','usd','usc','eur'].includes(unit))
     console.log(label+'_REPORTED_UNIT='+unit.toUpperCase());
   }
   if(r.status===401||r.status===403)console.log(label+'_AUTH=REJECTED_OR_FORBIDDEN');
   else if(r.status===200)console.log(label+'_AUTH=NOT_REJECTED_HTTP_200');
   else console.log(label+'_AUTH=UNCONFIRMED');
   return r.status;
  }catch{console.log(label+'_NETWORK=FAILED_OR_TIMEOUT');return 0}
 }
 const a=await probe('PARTNER','/api/partner/check-partner-id',{email,partnerId:expected});
 if(a===401||a===403||a===429||a===0){console.log('BALANCE_PROBE=SKIPPED');}
 else await probe('BALANCE','/api/partner/check-balance-partner',{email,partnerId:expected,balance:10});
 console.log('PROBE_EMAIL=RESERVED_TEST_ADDRESS NO_REAL_ACCOUNT_USED=YES');
 console.log('REAL_BALANCE_VALIDATION=PENDING BROKER_UNIT_CONFIRMED=NO');
 console.log('NO_PRODUCTION_CHANGES=YES NO_RESTART=YES NO_DB_WRITES=YES');
}
try{await main()}catch(e){
 const known=['CREDENTIAL_FILE_UNSAFE','CREDENTIAL_CONFIG_INVALID','POLICY_FILE_UNSAFE','EXISTING_POLICY_DIFFERS'];
 fail(known.includes(e.message)?e.message:'LOCAL_SETUP_FAILED');
}
