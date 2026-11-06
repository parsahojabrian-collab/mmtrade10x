/* MMTrade R10 published custom page renderer. Text-only DOM construction: no HTML evaluation. */
(function(){'use strict';
const box=document.getElementById('r10-content'),title=document.getElementById('r10-title');
const nav=document.getElementById('r10-bottom');
function navFromRegistry(data){
 if(!nav)return;
 const available=Array.isArray(data?.pages)?data.pages:[];
 const active=id=>available.find(p=>p.slug===id&&p.status==='PUBLISHED');
 const items=[['خانه',data.startPath||'/miniapp'],['آکادمی',active('academy')?.path],['پروفایل',active('profile')?.path]];
 nav.replaceChildren();
 for(const [label,path] of items){if(!path)continue;const a=node('a',label);a.href=path;nav.append(a)}
 const back=document.querySelector('.r10-back');if(back)back.href=data.startPath||'/miniapp';
}
fetch('/public/page-lifecycle',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(navFromRegistry).catch(()=>{if(nav){const a=node('a','خانه');a.href='/miniapp';nav.replaceChildren(a)}});
const slug=decodeURIComponent(location.pathname.split('/').filter(Boolean).pop()||'');
const validUrl=url=>typeof url==='string'&&(/^(\/(?!\/)[\w./?&=%#-]+|https:\/\/[^\s<>'"]+)$/.test(url));
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);return e};
function render(data){title.textContent=data.title||'MMTrade10X';document.title=title.textContent+' | MMTrade10X';box.replaceChildren();
 (Array.isArray(data.blocks)?data.blocks:[]).forEach(b=>{
  if(!b||typeof b!=='object')return;
  let section=node('section'),child=null;
  if(b.type==='heading')child=node('h2',b.text||'');
  else if(b.type==='text')child=node('p',b.text||'');
  else if(b.type==='image'&&validUrl(b.url)){child=node('img');child.src=b.url;child.alt=b.alt||'';child.loading='lazy';}
  else if(b.type==='button'&&validUrl(b.url)){child=node('a',b.text||'ادامه');child.href=b.url;child.className='r10-link';}
  else if(b.type==='banner'){section.className='r10-banner';section.append(node('h2',b.title||''),node('p',b.text||''));if(validUrl(b.url)){child=node('a','مشاهده');child.href=b.url;child.className='r10-link';}}
  else if(b.type==='divider')child=node('hr');
  if(child)section.append(child);if(section.childNodes.length)box.append(section);
 });
 if(!box.childNodes.length)box.append(node('p','هنوز محتوایی برای این صفحه منتشر نشده است.'));
}
if(!/^[a-z][a-z0-9-]{2,39}$/.test(slug)){box.textContent='آدرس صفحه معتبر نیست.';return;}
fetch('/public/page-lifecycle/content/'+encodeURIComponent(slug),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('page_not_found');return r.json()}).then(render).catch(()=>{box.replaceChildren(node('p','صفحه در دسترس نیست.'));box.classList.add('r10-error')});
})();
