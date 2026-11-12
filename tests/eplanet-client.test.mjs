import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {eplanetHarness} from './helpers/eplanet-harness.mjs';
class Node {
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attrs={};this.style={};this.listeners={};this.value='';this.disabled=false;this.hidden=false;this.inert=false;this.open=false;this._text='';const flags=new Set();this.classList={toggle:(k,v)=>v?flags.add(k):flags.delete(k),contains:k=>flags.has(k)}}
 set textContent(v){this._text=String(v??'');this.children=[]}get textContent(){return this._text+this.children.map(x=>x.textContent).join('')}
 set innerHTML(v){throw Error('Unsafe HTML assignment: '+v)}
 append(...nodes){this.children.push(...nodes)}replaceChildren(...nodes){this._text='';this.children=nodes}
 setAttribute(k,v){this.attrs[k]=String(v)}removeAttribute(k){delete this.attrs[k];delete this[k]}
 addEventListener(type,fn){this.listeners[type]=fn}click(){if(!this.disabled)return this.onclick?.()}
 querySelector(selector){if(this.selectors?.[selector])return this.selectors[selector];const field=/^\[data-f="([^"]+)"\]$/.exec(selector);for(const c of this.children){if(field?c.dataset.f===field[1]:c.tagName.toLowerCase()===selector)return c;const nested=c.querySelector(selector);if(nested)return nested}return null}
 showModal(){this.open=true}close(){this.open=false}
}
async function settled(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setImmediate(r))}assert.fail('UI did not settle')}
function api(h){const calls=[],fault={status:false,queue:false};return{calls,fault,fetch:async(path,options={})=>{calls.push({path,options});const failure=(fault.status&&path.endsWith('/status'))||(fault.queue&&path.endsWith('/admin/requests'));if(failure){fault.status=false;fault.queue=false;return{ok:false,status:503,json:async()=>({error:'temporary_failure'})}}const role=options.headers?.authorization==='Bearer good'?'SUPER_ADMIN':undefined;const r=await h.dispatch(options.method||'GET',path,options.body?JSON.parse(options.body):undefined,role);return{ok:r.status<400,status:r.status,json:async()=>structuredClone(r.data)}}}}
function client(file,network,{telegram=false,preview=false}={}){
 const ids={};const $=id=>ids[id]||(ids[id]=new Node());
 const cards=Array.from({length:4},()=>{const c=new Node('article');c.selectors={'button':new Node('button'),'h3':new Node('h3'),'.step-content p':new Node('p'),'.step-icon img':new Node('img'),'.state':new Node('span')};return c});
 const timeline=Array.from({length:4},()=>new Node('i'));const hero=new Node('img');$('stepDialog').selectors={'.dialog-close button':new Node('button')};
 const document={hidden:false,getElementById:$,createElement:tag=>new Node(tag),querySelector:selector=>selector==='.hero-coin'?hero:null,querySelectorAll:selector=>selector==='.step-card'?cards:selector==='.timeline i'?timeline:[],addEventListener(){}};
 const window={addEventListener(){},...(telegram?{Telegram:{WebApp:{initData:'valid',ready(){},expand(){}}}}:{})};
 vm.runInNewContext(readFileSync(new URL('../public/miniapp/p74/eplanet/'+file,import.meta.url),'utf8'),{document,window,location:{search:preview?'?visualPreview=1':''},URL,URLSearchParams,AbortController,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},fetch:network.fetch,console});
 return {$,ids,cards,document,window};
}
test('guest and studio preview render config with disabled actions and no private API calls',async()=>{
 const h=eplanetHarness();const config=(await h.dispatch('GET','/miniapp/eplanet/config')).data.config;config.title='Configured title';h.database.state.settings.EPLANET_ONBOARDING_V1={config,requests:[]};
 for(const preview of [false,true]){const network=api(h),ui=client('app.js',network,{preview,telegram:preview});await settled(()=>ui.$('pageTitle').textContent==='Configured title');assert.ok(ui.cards.every(c=>c.querySelector('button').disabled));ui.cards[0].onclick({target:{closest:()=>null}});assert.equal(ui.$('stepDialog').open,false);assert.equal(network.calls.some(c=>c.path.endsWith('/status')||c.path.endsWith('/submit')),false)}
});
test('submission is deduplicated and a failed refresh preserves the pending success state',async()=>{
 const h=eplanetHarness(),network=api(h),ui=client('app.js',network,{telegram:true});await settled(()=>!ui.cards[0].querySelector('button').disabled);
 ui.cards[0].querySelector('button').click();assert.equal(ui.$('stepDialog').open,true);ui.$('accountId').value='123';network.fault.status=true;
 ui.$('submitVerification').click();ui.$('submitVerification').click();await settled(()=>ui.$('flowNote').textContent.includes('درخواست ثبت شد؛'));
 assert.equal(network.calls.filter(c=>c.path.endsWith('/submit')).length,1);assert.equal(ui.cards[0].classList.contains('pending'),true);assert.equal(ui.$('stepDialog').open,false);
 const request=h.database.state.settings.EPLANET_ONBOARDING_V1.requests[0];await h.dispatch('POST','/miniapp/eplanet/admin/requests/'+request.id+'/decision',{approved:true},'SUPER_ADMIN');
 await ui.$('refreshStatus').click();assert.equal(ui.$('doneCount').textContent,'۱');assert.equal(ui.$('progressFill').style.width,'25%');assert.equal(ui.cards[1].querySelector('button').disabled,false);assert.equal(ui.cards[0].classList.contains('completed'),true);
 Object.assign(h.database.state.workflows.u,{depositCompleted:true,copyConnected:true,challengeParticipant:true});await ui.$('refreshStatus').click();assert.equal(ui.$('doneCount').textContent,'۴');assert.equal(ui.$('progressFill').style.width,'100%');assert.ok(ui.cards.every(c=>c.querySelector('button').disabled));
});
test('admin queue uses inert text, rejects invalid sessions, and reports a committed decision despite refresh failure',async()=>{
 const h=eplanetHarness();const malicious='<img src=x onerror="alert(1)">';h.database.state.users.u.firstName=malicious;await h.dispatch('POST','/miniapp/eplanet/submit',{initData:'valid',step:'registration',accountId:malicious});
 const network=api(h),ui=client('admin.js',network);ui.$('editor').hidden=true;ui.$('requests').hidden=true;ui.$('token').value='bad';await ui.$('load').click();assert.equal(ui.$('editor').hidden,true);assert.match(ui.$('msg').textContent,/نشست/);
 ui.$('token').value='good';ui.$('token').listeners.input();await ui.$('load').click();assert.equal(ui.$('editor').hidden,false);assert.ok(ui.$('queue').textContent.includes(malicious));assert.equal(ui.$('queue').querySelector('img'),null);
 const box=ui.$('queue').children[0],actions=box.children.at(-1);network.fault.queue=true;await actions.children[0].click();assert.match(ui.$('msg').textContent,/تصمیم ثبت شد؛/);assert.equal(h.database.state.workflows.u.accountCreated,true);
});
test('stale admin config remains editable and cannot overwrite another admin save',async()=>{
 const h=eplanetHarness(),a=client('admin.js',api(h)),b=client('admin.js',api(h));for(const ui of[a,b]){ui.$('token').value='good';await ui.$('load').click()}
 a.$('title').value='First edit';await a.$('save').click();b.$('title').value='Second edit';await b.$('save').click();assert.match(b.$('msg').textContent,/مدیر دیگری/);assert.equal(b.$('title').value,'Second edit');assert.equal(h.database.state.settings.EPLANET_ONBOARDING_V1.config.title,'First edit');
});
