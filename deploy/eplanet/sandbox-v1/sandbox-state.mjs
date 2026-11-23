/* MMTRADE ePlanet Sandbox pure model — no production API, broker, or database.
 * All accounts/balances and the virtual 61-second interval are simulated.
 */
export const SCENARIOS=Object.freeze({
 ENOUGH:{label:'موجودی کافی',availableBalance:250,partnerMatched:true,emailVerified:true,brokerOk:true},
 LOW:{label:'موجودی ناکافی',availableBalance:15,partnerMatched:true,emailVerified:true,brokerOk:true},
 PARTNER:{label:'Partner نامعتبر',availableBalance:250,partnerMatched:false,emailVerified:true,brokerOk:true},
 EMAIL:{label:'ایمیل تأییدنشده',availableBalance:250,partnerMatched:true,emailVerified:false,brokerOk:true},
 ERROR:{label:'خطای API بروکر',availableBalance:null,partnerMatched:null,emailVerified:true,brokerOk:false}
});
export const NAMES=['registration','deposit','connect','activation'];
export const TITLES=['Registration','Deposit','Connect to MMTrade','Activate Copy Trading'];
export const DESCRIPTIONS=['ثبت‌نام آزمایشی بدون ایجاد حساب واقعی','شبیه‌سازی استعلام موجودی از بروکر','اتصال آزمایشی بدون ارتباط با حساب معاملاتی','فعال‌سازی نمایشی بدون ایجاد معامله'];
export const THRESHOLD=100; // Fictional test-unit threshold. NOT a broker currency setting.
export function fresh(){
 return {sandbox:true,revision:1,flags:[false,false,false,false],accountId:'',email:'',
  scenario:'ENOUGH',lastStatus:'',lastMessage:'',lastBalance:null,checkCount:0,audit:[]};
}
export function steps(state){
 let blocked=false;
 return NAMES.map((key,i)=>{
  const complete=state.flags[i]===true;
  const status=complete?'completed':blocked?'locked':'available';
  if(!complete)blocked=true;
  return {key,status};
 });
}
const emailRx=/^[^\s@]+@[^\s@]+\.test$/i;
function eventLog(state,action,details={}){
 state.audit.push({seq:state.audit.length+1,action,details});
 if(state.audit.length>100)state.audit.shift();
}
export function transition(input,event){
 const state=structuredClone(input);
 const no=(message,status='BLOCKED')=>{state.lastStatus=status;state.lastMessage=message;eventLog(state,'REJECTED',{reason:status});return state;};
 if(!event||typeof event!=='object')return no('دستور آزمایشی نامعتبر است.');
 if(event.type==='RESET')return fresh();
 if(event.type==='SCENARIO'){
  if(!Object.hasOwn(SCENARIOS,event.value))return no('سناریوی نامعتبر.');
  state.scenario=event.value;
  state.flags[1]=state.flags[2]=state.flags[3]=false;
  state.lastBalance=null;state.checkCount=0;
  state.lastStatus='SCENARIO_CHANGED';
  state.lastMessage='سناریو تغییر کرد؛ نتیجه واریز و مراحل بعد بازنشانی شدند.';
  eventLog(state,'SCENARIO_CHANGED',{scenario:state.scenario});return state;
 }
 if(event.type==='REGISTER'){
  if(state.flags[0])return no('ثبت‌نام آزمایشی قبلاً انجام شده است.','ALREADY_COMPLETED');
  const accountId=String(event.accountId||'').trim();
  const email=String(event.email||'').trim().toLowerCase();
  if(!/^[a-zA-Z0-9_-]{3,40}$/.test(accountId))return no('شناسه ساختگی ۳ تا ۴۰ کاراکتر، فقط حروف لاتین، عدد، - و _ باشد.','INVALID_ACCOUNT');
  if(!emailRx.test(email)||email.length>120)return no('فقط ایمیل ساختگی با دامنه .test وارد کنید؛ مثلاً user@example.test','INVALID_EMAIL');
  state.accountId=accountId;state.email=email;state.flags[0]=true;
  state.lastStatus='REGISTERED';state.lastMessage='ثبت‌نام آزمایشی تأیید شد؛ Deposit باز شد.';
  eventLog(state,'REGISTRATION_MOCK_APPROVED',{accountId,email});return state;
 }
 if(event.type==='DEPOSIT'){
  if(!state.flags[0])return no('ابتدا ثبت‌نام آزمایشی را تکمیل کنید.','PREVIOUS_STEP_INCOMPLETE');
  if(state.flags[1])return no('Deposit قبلاً تأیید شده؛ ثبت تأیید تکراری انجام نشد.','ALREADY_COMPLETED');
  const broker=SCENARIOS[state.scenario];
  state.checkCount++;
  state.lastBalance=broker.availableBalance;
  if(!broker.emailVerified)return no('ایمیل ساختگی تأیید نشده؛ واریز تأیید نمی‌شود.','BROKER_EMAIL_UNVERIFIED');
  if(!broker.brokerOk)return no('پاسخ آزمایشی API بروکر با خطا مواجه شد؛ واریز تأیید نشد.','BROKER_API_ERROR');
  if(!broker.partnerMatched)return no('زیرمجموعه Partner مطابقت ندارد؛ واریز تأیید نشد.','BROKER_PARTNER_MISMATCH');
  if(broker.availableBalance<THRESHOLD)return no('موجودی ساختگی از حدنصاب آزمایشی کمتر است.','INSUFFICIENT_BALANCE');
  // Virtual broker reads #1 and #2 separated by simulated 61 seconds.
  eventLog(state,'BALANCE_CHECK_1',{amount:broker.availableBalance,virtualTimeMs:0});
  eventLog(state,'BALANCE_CHECK_2',{amount:broker.availableBalance,virtualTimeMs:61000});
  state.flags[1]=true;state.lastStatus='DEPOSIT_VERIFIED_MOCK';
  state.lastMessage='دو استعلام ساختگی با فاصله زمانی مجازی موفق شدند؛ Connect باز شد.';
  eventLog(state,'DEPOSIT_MOCK_APPROVED',{amount:broker.availableBalance,threshold:THRESHOLD});return state;
 }
 if(event.type==='CONNECT'){
  if(!state.flags[1])return no('ابتدا Deposit باید تأیید شود.','PREVIOUS_STEP_INCOMPLETE');
  if(state.flags[2])return no('اتصال آزمایشی تکراری انجام نشد.','ALREADY_COMPLETED');
  state.flags[2]=true;state.lastStatus='CONNECT_MOCK_DONE';state.lastMessage='اتصال آزمایشی انجام شد؛ Activation باز شد.';
  eventLog(state,'CONNECT_MOCK_APPROVED');return state;
 }
 if(event.type==='ACTIVATE'){
  if(!state.flags[2])return no('ابتدا اتصال آزمایشی را تکمیل کنید.','PREVIOUS_STEP_INCOMPLETE');
  if(state.flags[3])return no('فعال‌سازی آزمایشی تکراری انجام نشد.','ALREADY_COMPLETED');
  state.flags[3]=true;state.lastStatus='ACTIVATED_MOCK';state.lastMessage='مسیر آزمایشی چهارمرحله‌ای کامل شد؛ هیچ حساب واقعی تغییر نکرد.';
  eventLog(state,'ACTIVATION_MOCK_APPROVED');return state;
 }
 return no('دستور آزمایشی ناشناخته است.','INVALID_EVENT');
}
