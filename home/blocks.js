(function(){var w=window.Telegram&&Telegram.WebApp,ID=(w&&w.initData)||'';if(!ID)return;
var slug=(location.pathname.split('/').pop()||'index').replace(/\.html$/,'')||'index';
var css=document.createElement('style');css.textContent='.pbar{height:10px;background:#0e1729;border-radius:6px;overflow:hidden;margin:8px 0}.pbar i{display:block;height:100%;background:#f0c86a}.bbtn{display:inline-block;background:#f0c86a;color:#171717;padding:11px 18px;border-radius:10px;text-decoration:none;font-weight:bold;margin:6px 0}.bimg{max-width:100%;border-radius:14px;display:block;margin:8px 0}.bdiv{border:0;border-top:1px solid #2c3b59;margin:16px 0}.btxt{white-space:pre-wrap;line-height:2;font-size:14px}.pov{position:fixed;inset:0;background:#000a;display:flex;align-items:center;justify-content:center;z-index:99;padding:18px}.pbox{background:#151f34;border:1px solid #2c3b59;border-radius:20px;padding:20px;max-width:420px;width:100%}.pbox button.x{background:transparent;color:#aab8d0;border:1px solid #34445f;margin-inline-start:8px}';document.head.append(css);
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function ok(u){return /^(https:\/\/\S+|\/(?!\/)\S*)$/.test(u||'')}
function link(a,u){a.href=u;if(/^https:/.test(u)){a.target='_blank';a.rel='noopener noreferrer'}return a}
var REG={STARTED:'شروع',CHANNELS_PENDING:'عضویت در کانال‌ها',CONSENT_PENDING:'رضایت‌نامه',PHONE_PENDING:'تأیید شماره',REGISTERED:'ثبت‌نام انجام شد',MINI_APP_PENDING:'ورود به Mini App',COMPLETE:'تکمیل شد'};
function bar(title,pct,note){var c=el('section','card');c.append(el('h2','',title||''));var b=el('div','pbar'),i=el('i');i.style.width=Math.max(0,Math.min(100,pct))+'%';b.append(i);c.append(b,el('p','muted',pct+'٪'+(note?' · '+note:'')));return c}
function block(b,pr){switch(b.type){
case 'heading':return el('h2','',b.text);
case 'text':return el('p','muted btxt',b.text);
case 'divider':return el('hr','bdiv');
case 'image':if(!ok(b.url))return null;var im=el('img','bimg');im.src=b.url;im.alt=b.alt||'';return im;
case 'button':if(!ok(b.url))return null;return link(el('a','bbtn',b.text),b.url);
case 'banner':var c=el('section','card');c.append(el('h2','gold',b.title));if(b.text)c.append(el('p','muted btxt',b.text));if(b.url&&ok(b.url))c.append(link(el('a','bbtn','مشاهده'),b.url));return c;
case 'progress':if(b.kind==='registration')return bar(b.title||'پیشرفت ثبت‌نام',pr.registration.pct,REG[pr.registration.stage]||'');
if(b.kind==='academy')return bar(b.title||'پیشرفت آکادمی',pr.academy.pct,pr.academy.done+' از '+pr.academy.total+' درس');return null}return null}
function post(p,x){return fetch(p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.assign({initData:ID},x))}).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||'error');return d})})}
function popup(p){var ov=el('div','pov'),bx=el('div','pbox');bx.append(el('h2','gold',p.title));if(p.imageUrl&&ok(p.imageUrl)){var im=el('img','bimg');im.src=p.imageUrl;im.alt='';bx.append(im)}
bx.append(el('p','muted btxt',p.body));var close=function(){ov.remove();post('/content/popup/'+encodeURIComponent(p.id)+'/seen').catch(function(){})};
if(p.buttonText&&p.buttonUrl&&ok(p.buttonUrl)){var a=link(el('a','bbtn',p.buttonText),p.buttonUrl);a.addEventListener('click',close);bx.append(a)}
var x=el('button','x','بستن');x.onclick=close;bx.append(x);ov.append(bx);document.body.append(ov)}
post('/content/page',{slug:slug}).then(function(d){
try{window.dispatchEvent(new CustomEvent('tenx:data',{detail:d}))}catch(e){}
if(d.blocks&&d.blocks.length){var box=el('div');d.blocks.forEach(function(b){var e=block(b,d.progress);if(e)box.append(e)});
var main=document.querySelector('main'),last=document.querySelector('main > section.card:last-of-type');if(main){last?last.before(box):main.append(box)}}
if(d.popup)popup(d.popup)}).catch(function(){})})();
