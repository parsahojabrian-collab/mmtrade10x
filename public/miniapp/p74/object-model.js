/* MMTrade Object Studio — shared, bounded, no dynamic HTML or code execution. */
(function(root){'use strict';
if(root.MMTradeObjectModel)return;
const TYPES=['image','text','shape','light','flag'];
const ANIMATIONS=['none','float','pulse','spin','glow','sway','drift','fade-in','slide-up','twinkle'];
const SHAPES=['rectangle','circle','line'];
const clean=(s,max)=>String(s==null?'':s).replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max);
const number=(v,f,min,max)=>{if(v===null||v===undefined||v==='')return f;const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):f};
const hex=(s,def)=>/^#[a-f\d]{6}$/i.test(String(s||''))?String(s):def;
function assetUrl(input){
 const s=String(input||'').trim();
 if(s.length>360||s.includes('..')||/[\\\s<>"'?#]/.test(s))return '';
 /* MMVS_P74_PREVIEW_LIBRARY_R4: safe same-origin catalog image paths */
 const legacy=/^\/(?:miniapp\/p74\/assets|uploads\/home-studio)\/[A-Za-z0-9_./-]+$/;
 const catalog=/^\/(?:miniapp|uploads|assets)\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp|avif|gif)$/i;
 if(!legacy.test(s)&&!catalog.test(s))return '';
 return s;
}
const sequence=()=>[3,4,5,6,7,8];
function visibility(raw){if(raw==='all'||raw===undefined||raw===null)return 'all';
 if(!Array.isArray(raw))return 'all';return [...new Set(raw.map(Number).filter(n=>Number.isInteger(n)&&n>=3&&n<=8))];}
function normalizeObject(o,i){
 if(!o||typeof o!=='object'||!TYPES.includes(o.type))return null;
 const type=o.type,id=/^[a-zA-Z0-9_-]{1,48}$/.test(String(o.id||''))?o.id:'object_'+i;
 const x=number(o.x,25,0,99),y=number(o.y,48,0,99),w=number(o.w,18,2,100),h=number(o.h,10,1,100);
 const item={id,type,name:clean(o.name||type,48),visible:o.visible!==false,stages:visibility(o.stages),x:Math.min(x,100-w),y:Math.min(y,100-h),w,h,
   rotation:number(o.rotation,0,-360,360),opacity:number(o.opacity,1,0,1),z:number(o.z,i+1,0,99),
   animation:ANIMATIONS.includes(o.animation)?o.animation:'none',duration:number(o.duration,4,.3,30),delay:number(o.delay,0,0,30),
   content:clean(o.content||'',120),color:hex(o.color,'#e9c08a'),shape:SHAPES.includes(o.shape)?o.shape:'rectangle',src:assetUrl(o.src)};
 if(type==='image'&&!item.src)return null;
 return item;
}
const builtin=[
 {id:'legacy-cube',type:'image',name:'مکعب MM',src:'/miniapp/p74/assets/cube.webp',x:3,y:46,w:20,h:12,z:4,animation:'float',duration:5.5},
 {id:'legacy-coin',type:'image',name:'سکه طلایی',src:'/miniapp/p74/assets/coin.webp',x:72,y:60,w:23,h:13,z:4,animation:'float',duration:5.5,delay:2}
];
function normalizeObjects(raw){
 const items=raw===undefined?builtin:raw;
 if(!Array.isArray(items))return [];
 const seen=new Set();return items.slice(0,48).map((v,i)=>normalizeObject(v,i)).filter(v=>{if(!v||seen.has(v.id))return false;seen.add(v.id);return true});
}
function backgrounds(raw){const v=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};const out={};
 for(const n of sequence()){const p=assetUrl(v[String(n)]);if(p)out[String(n)]=p;}return out;}
function make(type){if(!TYPES.includes(type))type='image';const now='o'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
 const src=type==='image'?'/miniapp/p74/assets/cube.webp':'';
 return normalizeObject({id:now,type,name:({image:'تصویر جدید',text:'متن جدید',shape:'شکل جدید',light:'نور جدید',flag:'پرچم 10X'})[type],
    src,content:type==='text'?'متن جدید':type==='flag'?'10X':'',x:35,y:52,w:type==='light'?22:20,h:11,animation:type==='light'?'glow':'none'},0);
}
function allowedOn(item,stepCount){return item.visible&&(item.stages==='all'||item.stages.includes(stepCount));}
function validateConfig(raw){
 if(!raw||typeof raw!=='object')throw Error('تنظیمات آبجکت نامعتبر است');
 if(raw.objects!==undefined&&(!Array.isArray(raw.objects)||raw.objects.length>48))throw Error('حداکثر ۴۸ آبجکت مجاز است');
 const objs=normalizeObjects(raw.objects);
 if(Array.isArray(raw.objects)&&objs.length!==raw.objects.length)throw Error('آبجکت تکراری یا آدرس تصویر نامعتبر است');
 const result={...raw,objects:objs,backgrounds:backgrounds(raw.backgrounds)};
 if(JSON.stringify(result).length>42000)throw Error('حجم تنظیمات Home بیش از حد است');return result;
}
root.MMTradeObjectModel={TYPES,ANIMATIONS,SHAPES,normalizeObject,normalizeObjects,backgrounds,make,assetUrl,allowedOn,validateConfig,sequence};
})(window);
