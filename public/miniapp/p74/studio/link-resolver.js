/* MMTrade10X R6 • Resolve legacy and current links to the published canonical page URL. */
(function(){'use strict';
if(window.__MMTRADE_LINK_RESOLVER_R6__)return;window.__MMTRADE_LINK_RESOLVER_R6__=true;
let translations=[];
function mapLink(raw){
 if(typeof raw!=='string'||!raw||raw[0]==='#'||/^(mailto:|tel:|javascript:|data:)/i.test(raw))return raw;
 let u;try{u=new URL(raw,location.origin)}catch{return raw}
 if(u.origin!==location.origin)return raw;
 const isAbsolute=/^https:\/\//i.test(raw);
 for(const entry of translations){
  const prev=new URL(entry.from,location.origin);
  if(u.pathname!==prev.pathname)continue;
  if(prev.search){if(u.search!==prev.search)continue;}
  else if(prev.pathname==='/miniapp/index.html'&&u.searchParams.has('view'))continue;
  const next=entry.to+(prev.search?'':u.search)+u.hash;
  return isAbsolute?location.origin+next:next;
 }
 return raw;
}
function scan(){
 document.querySelectorAll('a[href],form[action],[data-href],[data-url],button[formaction]').forEach(e=>{
  for(const attr of ['href','action','data-href','data-url','formaction']){
   if(!e.hasAttribute(attr))continue;
   const raw=e.getAttribute(attr),mapped=mapLink(raw);
   if(raw!==mapped)e.setAttribute(attr,mapped);
  }
 });
}
function refresh(){fetch('/public/page-routes',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('no-routes');return r.json()}).then(x=>{
 translations=[];
 (x.pages||[]).forEach(p=>{(p.aliases||[]).forEach(from=>{if(typeof from==='string'&&from!==p.path)translations.push({from,to:p.path})})});
 translations.sort((a,b)=>b.from.length-a.from.length);
 scan();
 }).catch(()=>{});}
// Correct link target immediately on click, including links added after page load.
document.addEventListener('click',event=>{
 const a=event.target&&event.target.closest?event.target.closest('a[href]'):null;
 if(a){const raw=a.getAttribute('href'),mapped=mapLink(raw);if(raw!==mapped)a.setAttribute('href',mapped)}
},true);
let queued=false;
new MutationObserver(mutations=>{
 if(!mutations.some(m=>m.addedNodes.length||m.type==='attributes'))return;
 if(queued)return;queued=true;queueMicrotask(()=>{queued=false;scan()});
}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['href','action','data-href','data-url','formaction']});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();
