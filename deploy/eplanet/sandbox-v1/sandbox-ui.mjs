/* MMTRADE ePlanet Sandbox — isolated static UI adapter.
 * NO fetch, XHR, real Telegram initData, API, DB, deposit or account calls.
 */
import {fresh,steps,transition,SCENARIOS,NAMES,TITLES,DESCRIPTIONS,THRESHOLD} from './sandbox-state.mjs';
const KEY='MMTRADE_EPLANET_SANDBOX_V1_ONLY';
const $=id=>document.getElementById(id);
const cards=Array.from(document.querySelectorAll('.step-card[data-step]'));
const dialog=$('stepDialog'),submit=$('submitVerification'),description=$('dialogDescription');
const progressFill=$('progressFill'),hint=$('progressHint'),flow=$('flowNote');
function make(tag,className,textValue){
 const el=document.createElement(tag);
 if(className)el.className=className;
 if(textValue!==undefined)el.textContent=textValue;
 return el;
}
function restore(){
 try{
  const value=JSON.parse(sessionStorage.getItem(KEY)||'null');
  if(!value||value.sandbox!==true||value.revision!==1||!Array.isArray(value.flags)||
     value.flags.length!==4||value.flags.some(v=>typeof v!=='boolean')||
     !Object.hasOwn(SCENARIOS,value.scenario)||!Array.isArray(value.audit))return fresh();
  // Status is not allowed to skip a step from a stale/corrupt snapshot.
  if(value.flags.some((v,i)=>v && i>0&&!value.flags[i-1]))return fresh();
  return value;
 }catch{return fresh()}
}
let state=restore(),active=-1;
function save(){
 try{sessionStorage.setItem(KEY,JSON.stringify(state))}catch{}
}
function dispatch(event){
 state=transition(state,event);save();render();return state;
}
const banner=make('section','sandbox-banner');
banner.setAttribute('role','region');banner.setAttribute('aria-label','آزمایشگاه ePlanet');
const tag=make('div','sandbox-tag','SANDBOX / DEMO • هیچ حساب یا واریز واقعی وجود ندارد');
const subtitle=make('p','sandbox-subtitle','همین چیدمان صفحه زنده، با داده ساختگی و بدون ارتباط با API یا دیتابیس اصلی.');
const controls=make('div','sandbox-controls');
const scenarioLabel=make('label','sandbox-control-label','سناریوی بروکر (شبیه‌سازی)');
const select=make('select','sandbox-select');
select.id='sandboxScenario';
for(const [id,details] of Object.entries(SCENARIOS)){
 const item=make('option','',details.label);
 item.value=id;select.append(item);
}
scenarioLabel.append(select);
const reset=make('button','sandbox-reset','بازنشانی تست');
reset.type='button';reset.id='sandboxReset';
const full=make('button','sandbox-run','اجرای کامل ۴ مرحله');
full.type='button';full.id='sandboxRunAll';
controls.append(scenarioLabel,reset,full);
const mockBalance=make('div','sandbox-balance');
const mockStatus=make('p','sandbox-current-status');
banner.append(tag,subtitle,controls,mockBalance,mockStatus);
const header=document.querySelector('.topbar');
if(header)header.insertAdjacentElement('afterend',banner);
else document.body.prepend(banner);
const auditPanel=make('details','sandbox-audit');
const auditTitle=make('summary','', 'لاگ رویدادهای آزمایشی');
const auditText=make('pre','sandbox-audit-pre');
auditPanel.append(auditTitle,auditText);
const footer=document.querySelector('footer');
if(footer)footer.insertAdjacentElement('beforebegin',auditPanel);
else document.body.append(auditPanel);
const registration=make('div','sandbox-registration');
const accountLabel=make('label','sandbox-field','شناسه حساب ساختگی');
const account=make('input','sandbox-input');
account.id='sandboxAccount';account.type='text';account.maxLength=40;
account.placeholder='DEMO_1001';account.autocomplete='off';
const emailLabel=make('label','sandbox-field','ایمیل ساختگی با دامنه .test');
const email=make('input','sandbox-input');
email.id='sandboxEmail';email.type='text';email.maxLength=120;
email.placeholder='tester@example.test';email.autocomplete='off';
accountLabel.append(account);emailLabel.append(email);
registration.append(accountLabel,emailLabel);
if(description)description.insertAdjacentElement('afterend',registration);
if($('accountField'))$('accountField').hidden=true;
if($('externalAction')){
 $('externalAction').hidden=true;
 $('externalAction').removeAttribute('href');
}
const fields=()=>{account.value=state.accountId||'DEMO_1001';email.value=state.email||'tester@example.test'};
const fa=n=>String(n).replace(/\d/g,x=>'۰۱۲۳۴۵۶۷۸۹'[Number(x)]);
function render(){
 const completed=state.flags.filter(Boolean).length;
 const statuses=steps(state);
 const next=statuses.findIndex(x=>x.status==='available');
 if($('pageTitle'))$('pageTitle').textContent='آزمایشگاه ePlanet • MMTRADE';
 if($('pageSubtitle'))$('pageSubtitle').textContent='شبیه‌سازی امن چهار مرحله بدون حساب و پول واقعی';
 if($('doneCount'))$('doneCount').textContent=fa(completed);
 if(progressFill)progressFill.style.width=completed*25+'%';
 if(hint)hint.textContent=completed===4?'تست چهار مرحله با موفقیت کامل شد.':'این وضعیت فقط در همین تب مرورگر ذخیره می‌شود.';
 if(flow)flow.textContent=state.lastMessage || 'مرحله اول را تکمیل کنید یا گزینه «اجرای کامل ۴ مرحله» را بزنید.';
 const badge=SCENARIOS[state.scenario];
 select.value=state.scenario;
 mockBalance.textContent='سناریو: '+badge.label+'  |  موجودی ساختگی: '+
   (badge.availableBalance===null?'نامشخص':String(badge.availableBalance))+
   ' واحد فرضی  |  حدنصاب آزمایشی: '+THRESHOLD;
 mockStatus.textContent='نتیجه: '+(state.lastStatus||'آماده تست')+' · همه نتایج ساختگی‌اند.';
 const timeline=Array.from(document.querySelectorAll('.timeline i'));
 for(let i=0;i<cards.length;i++){
  const card=cards[i],status=statuses[i]?.status||'locked';
  for(const cls of ['completed','locked','pending','rejected','current'])
   card.classList.toggle(cls,cls===status||(cls==='current'&&i===next));
  const name=card.querySelector('h3');if(name)name.textContent=TITLES[i];
  const text=card.querySelector('.step-content p');if(text)text.textContent=DESCRIPTIONS[i];
  const result=card.querySelector('.state');
  if(result)result.textContent={completed:'تأیید آزمایشی',available:'آماده تست',locked:'قفل آزمایشی'}[status];
  const button=card.querySelector('button.step-action')||card.querySelector('button');
  if(button){
   button.disabled=status!=='available';
   button.textContent=status==='completed'?'✓':status==='available'?'تست مرحله':'🔒';
  }
  if(timeline[i]){timeline[i].classList.toggle('active',status==='available');timeline[i].classList.toggle('done',status==='completed')}
 }
 if($('refreshStatus'))$('refreshStatus').disabled=false;
 auditText.textContent=state.audit.length?state.audit.map(x=>
  '#'+x.seq+' '+x.action+' '+JSON.stringify(x.details||{})).join('\n'):'هنوز رویدادی ثبت نشده است.';
}
function openStage(i){
 if(steps(state)[i]?.status!=='available')return;
 active=i;
 if($('dialogKicker'))$('dialogKicker').textContent='مرحله '+fa(i+1)+' از ۴ • SANDBOX';
 if($('dialogTitle'))$('dialogTitle').textContent=TITLES[i];
 if(description)description.textContent=DESCRIPTIONS[i];
 if($('dialogStatus'))$('dialogStatus').textContent='این عملیات صرفاً شبیه‌سازی است و هیچ داده‌ای به سرور ارسال نمی‌شود.';
 registration.hidden=i!==0;
 fields();
 if(submit){
  submit.hidden=false;
  submit.disabled=false;
  submit.textContent=['تکمیل ثبت‌نام ساختگی','استعلام موجودی ساختگی','اتصال ساختگی','فعال‌سازی ساختگی'][i];
 }
 if(dialog&&!dialog.open){
  try{dialog.showModal()}catch{dialog.setAttribute('open','')}
 }
}
function closeStage(){
 if(dialog?.open){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open')}
 active=-1;
}
if(cards.length===4&&submit&&dialog){
 for(let i=0;i<cards.length;i++){
  const card=cards[i],button=card.querySelector('button.step-action')||card.querySelector('button');
  card.addEventListener('click',event=>{
   if(event.target.closest('a'))return;
   openStage(i);
  });
  if(button)button.addEventListener('click',event=>event.stopPropagation()||openStage(i));
 }
 submit.addEventListener('click',()=>{
  const before=state.flags.slice();
  const action=[
   {type:'REGISTER',accountId:account.value,email:email.value},
   {type:'DEPOSIT'}, {type:'CONNECT'}, {type:'ACTIVATE'}
  ][active];
  if(!action)return;
  dispatch(action);
  if(state.flags[active]&&!before[active])closeStage();
  else if($('dialogStatus'))$('dialogStatus').textContent=state.lastMessage;
 });
 dialog.addEventListener('close',()=>{active=-1;});
}
select.addEventListener('change',()=>{closeStage();dispatch({type:'SCENARIO',value:select.value})});
reset.addEventListener('click',()=>{closeStage();dispatch({type:'RESET'})});
full.addEventListener('click',()=>{
 closeStage();
 dispatch({type:'RESET'});
 dispatch({type:'REGISTER',accountId:'DEMO_1001',email:'tester@example.test'});
 dispatch({type:'SCENARIO',value:'ENOUGH'});
 dispatch({type:'DEPOSIT'});
 dispatch({type:'CONNECT'});
 dispatch({type:'ACTIVATE'});
});
$('refreshStatus')?.addEventListener('click',()=>{state.lastMessage='وضعیت آزمایشی تازه‌سازی شد؛ هیچ درخواستی به سرور ارسال نشد.';render()});
document.querySelector('.topbar .back')?.addEventListener('click',()=>{closeStage();dispatch({type:'RESET'})});
render();
