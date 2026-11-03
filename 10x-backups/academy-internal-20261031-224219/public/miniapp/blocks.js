(function(){if(new URLSearchParams(location.search).has('adminPreview'))return;var w=window.Telegram&&Telegram.WebApp,ID=(w&&w.initData)||'';if(!ID)return;
var slug=location.pathname==='/miniapp'?'index':((location.pathname.split('/').pop()||'index').replace(/\.html$/,'')||'index');
var css=document.createElement('style');css.textContent='.pbar{height:10px;background:#0e1729;border-radius:6px;overflow:hidden;margin:8px 0}.pbar i{display:block;height:100%;background:#39ff88}.bbtn{display:inline-block;background:#39ff88;color:#171717;padding:11px 18px;border-radius:10px;text-decoration:none;font-weight:bold;margin:6px 0}.bimg{max-width:100%;border-radius:14px;display:block;margin:8px 0}.bdiv{border:0;border-top:1px solid #2c3b59;margin:16px 0}.btxt{white-space:pre-wrap;line-height:2;font-size:14px}.pov{position:fixed;inset:0;background:#000a;display:flex;align-items:center;justify-content:center;z-index:99;padding:18px}.pbox{background:#151f34;border:1px solid #2c3b59;border-radius:20px;padding:20px;max-width:420px;width:100%}.pbox button.x{background:transparent;color:#aab8d0;border:1px solid #34445f;margin-inline-start:8px}';document.head.append(css);
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

if(slug==='index' && d.homeLinks && typeof d.homeLinks==='object'){
  document.querySelectorAll('[data-link-key]').forEach(function(a){
    var key=a.getAttribute('data-link-key');
    if(key==='home.progress.next')return;
    var href=d.homeLinks[key];
    if(typeof href!=='string' || !ok(href))return;
    a.setAttribute('href',href);
    if(/^https:\/\//i.test(href)){
      a.setAttribute('target','_blank');
      a.setAttribute('rel','noopener noreferrer');
    }else{
      a.removeAttribute('target');
      a.removeAttribute('rel');
    }
  });
}

try{window.dispatchEvent(new CustomEvent('tenx:data',{detail:d}))}catch(e){}
if(d.blocks&&d.blocks.length){
d.blocks.forEach(function(b){
if(b.type!=='element'||!b.selector)return;
try{
var target=document.querySelector(b.selector);
if(!target)return;
if(b.deleted===true){target.remove();return}
if(typeof b.text==='string'){
var textNodes=Array.from(target.childNodes).filter(function(n){return n.nodeType===3});
if(textNodes.length){
textNodes[0].nodeValue=b.text;
textNodes.slice(1).forEach(function(n){n.nodeValue=''});
}else{
target.insertBefore(document.createTextNode(b.text),target.firstChild);
}
}
if(typeof b.href==='string'&&target.tagName==='A')target.setAttribute('href',b.href);
if(typeof b.src==='string'&&target.tagName==='IMG')target.setAttribute('src',b.src);
if(typeof b.alt==='string'&&target.tagName==='IMG')target.setAttribute('alt',b.alt);
var styles={
color:b.color,
backgroundColor:b.background,
fontSize:b.fontSize!=null?b.fontSize+'px':undefined,
fontWeight:b.fontWeight,
borderRadius:b.borderRadius!=null?b.borderRadius+'px':undefined,
padding:b.padding!=null?b.padding+'px':undefined,
margin:b.margin!=null?b.margin+'px':undefined
};
Object.keys(styles).forEach(function(k){
if(styles[k]!==undefined)target.style[k]=styles[k];
});
var extra={
opacity:b.opacity,
lineHeight:b.lineHeight,
letterSpacing:b.letterSpacing!=null?b.letterSpacing+'px':undefined,
textAlign:b.textAlign,
width:b.width!=null?b.width+'px':undefined,
maxWidth:b.maxWidth!=null?b.maxWidth+'px':undefined,
minHeight:b.minHeight!=null?b.minHeight+'px':undefined,
border:b.borderWidth!=null?b.borderWidth+'px solid '+(b.borderColor||'#64748b'):undefined,
boxShadow:({
none:'none',
soft:'0 2px 10px rgba(0,0,0,.12)',
medium:'0 5px 18px rgba(0,0,0,.2)',
strong:'0 10px 30px rgba(0,0,0,.3)'
})[b.shadow]
};
Object.keys(extra).forEach(function(k){if(extra[k]!==undefined)target.style[k]=extra[k]});

}catch(e){}
});
var box=el('div');d.blocks.forEach(function(b){var e=block(b,d.progress);if(e)box.append(e)});
if(slug==='profile'){
var target=document.getElementById('profile-managed-content');
if(target)target.append(box);
}else{
var main=document.querySelector('main'),last=document.querySelector('main > section.card:last-of-type');
if(main){last?last.before(box):main.append(box)}
}}
if(d.popup)popup(d.popup)}).catch(function(){})})();
