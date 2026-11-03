(function(){'use strict';
const DATA=[{"id":"tenx_q09_lesson_01_01","title":"بازارهای مالی چگونه کار می‌کنند؟","course":"آشنایی با بازارهای مالی","scene":"network","number":1},{"id":"tenx_q09_lesson_01_02","title":"انواع بازارها و ابزارهای معاملاتی","course":"آشنایی با بازارهای مالی","scene":"market","number":2},{"id":"tenx_q09_lesson_01_03","title":"انتخاب بازار مناسب برای معامله‌گری","course":"آشنایی با بازارهای مالی","scene":"compass","number":3},{"id":"tenx_q09_lesson_02_01","title":"پیپ، لات و حجم معاملات","course":"مفاهیم پایه معامله‌گری","scene":"volume","number":4},{"id":"tenx_q09_lesson_02_02","title":"اسپرد، کمیسیون و اهرم معاملاتی","course":"مفاهیم پایه معامله‌گری","scene":"cost","number":5},{"id":"tenx_q09_lesson_02_03","title":"سفارش‌گذاری و مدیریت معاملات","course":"مفاهیم پایه معامله‌گری","scene":"orders","number":6},{"id":"tenx_q09_lesson_03_01","title":"ساختار نمودار و تایم‌فریم","course":"مبانی نمودارخوانی","scene":"timeline","number":7},{"id":"tenx_q09_lesson_03_02","title":"کندل‌شناسی مقدماتی","course":"مبانی نمودارخوانی","scene":"candles","number":8},{"id":"tenx_q09_lesson_03_03","title":"حمایت و مقاومت مقدماتی","course":"مبانی نمودارخوانی","scene":"levels","number":9},{"id":"tenx_q09_lesson_04_01","title":"ریسک و بازده در معامله‌گری","course":"مدیریت سرمایه مقدماتی","scene":"risk","number":10},{"id":"tenx_q09_lesson_04_02","title":"حد ضرر و حد سود","course":"مدیریت سرمایه مقدماتی","scene":"stops","number":11},{"id":"tenx_q09_lesson_04_03","title":"محاسبه حجم معامله","course":"مدیریت سرمایه مقدماتی","scene":"sizing","number":12},{"id":"tenx_q09_lesson_05_01","title":"ساختار بازار و روندها","course":"پرایس اکشن مقدماتی","scene":"trend","number":13},{"id":"tenx_q09_lesson_05_02","title":"سقف‌ها و کف‌های قیمتی","course":"پرایس اکشن مقدماتی","scene":"swings","number":14},{"id":"tenx_q09_lesson_05_03","title":"شکست ساختار بازار","course":"پرایس اکشن مقدماتی","scene":"breakout","number":15},{"id":"tenx_q09_lesson_05_04","title":"تشخیص نواحی مهم قیمت","course":"پرایس اکشن مقدماتی","scene":"zones","number":16},{"id":"tenx_q09_lesson_06_01","title":"روند و خطوط روند","course":"تحلیل تکنیکال کاربردی","scene":"trend","number":17},{"id":"tenx_q09_lesson_06_02","title":"سطوح حمایت و مقاومت پیشرفته","course":"تحلیل تکنیکال کاربردی","scene":"levels","number":18},{"id":"tenx_q09_lesson_06_03","title":"الگوهای قیمتی کاربردی","course":"تحلیل تکنیکال کاربردی","scene":"patterns","number":19},{"id":"tenx_q09_lesson_06_04","title":"تحلیل چند تایم‌فریمی","course":"تحلیل تکنیکال کاربردی","scene":"timeline","number":20},{"id":"tenx_q09_lesson_07_01","title":"مفهوم نقدینگی در بازار","course":"رفتار قیمت و نقدینگی","scene":"liquidity","number":21},{"id":"tenx_q09_lesson_07_02","title":"شکار نقدینگی و شکست‌های کاذب","course":"رفتار قیمت و نقدینگی","scene":"breakout","number":22},{"id":"tenx_q09_lesson_07_03","title":"ناحیه‌های عرضه و تقاضا","course":"رفتار قیمت و نقدینگی","scene":"zones","number":23},{"id":"tenx_q09_lesson_07_04","title":"تأیید ورود بر اساس رفتار قیمت","course":"رفتار قیمت و نقدینگی","scene":"signal","number":24},{"id":"tenx_q09_lesson_08_01","title":"شاخص‌های اقتصادی مهم","course":"تحلیل بنیادی و اخبار","scene":"macro","number":25},{"id":"tenx_q09_lesson_08_02","title":"نرخ بهره و سیاست پولی","course":"تحلیل بنیادی و اخبار","scene":"rates","number":26},{"id":"tenx_q09_lesson_08_03","title":"تأثیر اخبار بر طلا و ارز","course":"تحلیل بنیادی و اخبار","scene":"news","number":27},{"id":"tenx_q09_lesson_08_04","title":"ترکیب تحلیل بنیادی و تکنیکال","course":"تحلیل بنیادی و اخبار","scene":"macro","number":28},{"id":"tenx_q09_lesson_09_01","title":"اجزای یک استراتژی معاملاتی","course":"استراتژی‌سازی معاملاتی","scene":"strategy","number":29},{"id":"tenx_q09_lesson_09_02","title":"قوانین ورود و خروج","course":"استراتژی‌سازی معاملاتی","scene":"orders","number":30},{"id":"tenx_q09_lesson_09_03","title":"طراحی چک‌لیست معاملاتی","course":"استراتژی‌سازی معاملاتی","scene":"checklist","number":31},{"id":"tenx_q09_lesson_10_01","title":"اصول بک‌تست معتبر","course":"بک‌تست و ارزیابی عملکرد","scene":"backtest","number":32},{"id":"tenx_q09_lesson_10_02","title":"شاخص‌های ارزیابی استراتژی","course":"بک‌تست و ارزیابی عملکرد","scene":"metrics","number":33},{"id":"tenx_q09_lesson_10_03","title":"بیش‌برازش و خطاهای بک‌تست","course":"بک‌تست و ارزیابی عملکرد","scene":"overfit","number":34},{"id":"tenx_q09_lesson_10_04","title":"آزمون خارج از نمونه","course":"بک‌تست و ارزیابی عملکرد","scene":"timeline","number":35},{"id":"tenx_q09_lesson_11_01","title":"کنترل هیجان و تصمیم‌گیری","course":"روان‌شناسی معامله‌گری","scene":"mind","number":36},{"id":"tenx_q09_lesson_11_02","title":"انضباط و پایبندی به برنامه","course":"روان‌شناسی معامله‌گری","scene":"discipline","number":37},{"id":"tenx_q09_lesson_11_03","title":"مدیریت ضررهای متوالی","course":"روان‌شناسی معامله‌گری","scene":"risk","number":38},{"id":"tenx_q09_lesson_12_01","title":"ریسک تجمعی، افت سرمایه و هم‌بستگی معاملات","course":"مدیریت ریسک پیشرفته","scene":"risk","number":39},{"id":"tenx_q09_lesson_12_02","title":"تنظیم حجم بر اساس نوسان","course":"مدیریت ریسک پیشرفته","scene":"volatility","number":40},{"id":"tenx_q09_lesson_12_03","title":"طراحی محدودیت‌های حفاظتی","course":"مدیریت ریسک پیشرفته","scene":"shield","number":41},{"id":"tenx_q09_lesson_13_01","title":"معرفی چارچوب معاملاتی 10X","course":"مبانی سیستم 10X","scene":"strategy","number":42},{"id":"tenx_q09_lesson_13_02","title":"قوانین اصلی و پیش‌نیازهای سیستم","course":"مبانی سیستم 10X","scene":"checklist","number":43},{"id":"tenx_q09_lesson_14_01","title":"آماده‌سازی نمودار و ابزارها","course":"اجرای عملی سیستم 10X","scene":"chart","number":44},{"id":"tenx_q09_lesson_14_02","title":"تشخیص موقعیت معاملاتی","course":"اجرای عملی سیستم 10X","scene":"signal","number":45},{"id":"tenx_q09_lesson_14_03","title":"اجرای ورود و مدیریت معامله","course":"اجرای عملی سیستم 10X","scene":"orders","number":46},{"id":"tenx_q09_lesson_15_01","title":"ثبت و تحلیل معاملات سیستم","course":"ارزیابی عملکرد 10X","scene":"metrics","number":47},{"id":"tenx_q09_lesson_16_01","title":"طراحی برنامه تمرین","course":"توسعه مهارت با 10X","scene":"plan","number":48},{"id":"tenx_q09_lesson_16_02","title":"تحلیل اشتباهات معاملاتی","course":"توسعه مهارت با 10X","scene":"review","number":49},{"id":"tenx_q09_lesson_16_03","title":"بهینه‌سازی فرآیند تصمیم‌گیری","course":"توسعه مهارت با 10X","scene":"process","number":50}];
const byTitle=new Map(DATA.map(x=>[normalize(x.title),x]));
function normalize(s){return String(s||'').replace(/[\u200c\u200f\u200e]/g,' ').replace(/\s+/g,' ').trim().replace(/[؟?!.,،؛:]/g,'');}
const SVG='http://www.w3.org/2000/svg';
function el(tag,cls,text){const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;}
function svgEl(tag,attrs){const e=document.createElementNS(SVG,tag);Object.entries(attrs||{}).forEach(([k,v])=>e.setAttribute(k,String(v)));return e;}
function line(g,x1,y1,x2,y2,color='#39ff88',width=2,opacity=1){g.appendChild(svgEl('line',{x1,y1,x2,y2,stroke:color,'stroke-width':width,opacity,'stroke-linecap':'round'}));}
function rect(g,x,y,w,h,color,rx=4){g.appendChild(svgEl('rect',{x,y,width:w,height:h,rx,fill:color}));}
function circle(g,x,y,r,color){g.appendChild(svgEl('circle',{cx:x,cy:y,r,fill:color}));}
function path(g,d,color='#39ff88',width=3){g.appendChild(svgEl('path',{d,fill:'none',stroke:color,'stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round'}));}
function text(g,x,y,value,color='#d8f8e9',size=11){const e=svgEl('text',{x,y,fill:color,'font-size':size,'font-family':'sans-serif','text-anchor':'middle'});e.textContent=value;g.appendChild(e);}
function draw(g,type,seed){
 const gold='#e8bd60',green='#39ff88',red='#ff6377',blue='#55c9ff';
 for(let i=0;i<7;i++){line(g,15,25+i*24,325,25+i*24,'#3d8b75',.7,.18);line(g,20+i*50,20,20+i*50,172,'#3d8b75',.7,.18);}
 const candles=['candles','trend','swings','breakout','levels','zones','signal','timeline','patterns','liquidity','chart','orders','stops'];
 if(candles.includes(type)){
  const vals=[75,85,62,93,104,89,120,115,142,130,151,165];
  vals.forEach((v,i)=>{let h=18+((i*13+seed*7)%30),x=27+i*25,y=175-v*.67;line(g,x+6,y-9,x+6,y+h+8,i%4===2?red:green,2);rect(g,x,y,12,h,i%4===2?red:green,2);});
  if(['levels','zones','breakout','liquidity','stops'].includes(type)){rect(g,20,72,300,23,'#17483d',4);line(g,20,83,320,83,gold,2);text(g,270,68,'KEY LEVEL',gold,10);}
  if(type==='timeline'){line(g,20,122,320,122,blue,2);text(g,260,116,'M5 / H1 / D1',blue,11);}
  if(type==='patterns')path(g,'M25 140 L78 95 L130 140 L181 95 L235 140',gold,2);
 }else if(['risk','sizing','volume','volatility','metrics','backtest','overfit'].includes(type)){
  const bars=[48,72,57,108,89,131,115];bars.forEach((v,i)=>{rect(g,28+i*43,170-v,26,v,i%3===1?gold:green,5);text(g,41+i*43,186,String(i+1),'#8cb3a9',9);});
  if(type==='risk'||type==='volatility'){path(g,'M20 86 Q75 30 130 91 T240 80 T322 48',red,3);}
  if(type==='overfit'){path(g,'M20 145 L65 110 L115 78 L160 46 L205 28 L250 20 L315 18',green,3);path(g,'M20 145 L65 110 L115 95 L160 128 L205 90 L250 151 L315 136',red,3);}
 }else if(['network','market','macro','rates','news','strategy','checklist','process','plan','review','discipline','mind','shield','compass','cost'].includes(type)){
  const pts=[[65,55],[164,36],[268,62],[95,133],[226,134],[164,92]];
  const links=[[0,1],[1,2],[0,3],[3,5],[5,4],[4,2],[1,5],[0,5],[2,5]];
  links.forEach(([a,b])=>line(g,pts[a][0],pts[a][1],pts[b][0],pts[b][1],gold,2,.7));
  pts.forEach(([x,y],i)=>{circle(g,x,y,17,i===5?gold:'#12654d');circle(g,x,y,7,i===5?'#0b1c21':green);});
  if(type==='shield'){path(g,'M164 55 L211 73 L204 130 Q164 163 124 130 L117 73 Z',gold,4);}
  if(type==='mind'||type==='discipline')text(g,164,101,'FOCUS','#0b1c21',12);
 }else{
  path(g,'M24 140 Q88 40 145 92 T320 35',green,4);
  for(let i=0;i<5;i++)circle(g,45+i*57,115-(i*13),10,i%2?gold:green);
 }
}
const css=`
.tenx-lr-root .hx-hero .hx-scene{display:none!important}
.tenx-lr-root .hx-hero{grid-template-columns:minmax(0,1fr) 48%;min-height:230px}
.hx-topic-scene{position:relative;min-width:0;transform:perspective(850px) rotateY(-9deg) rotateX(5deg);filter:drop-shadow(0 15px 18px #0009);transition:transform .3s ease}
.hx-topic-scene:before{content:'';position:absolute;inset:8% 5%;background:radial-gradient(ellipse,#36ff8966,transparent 70%);filter:blur(18px)}
.hx-topic-scene svg{position:relative;display:block;width:100%;height:auto;overflow:visible;border:1px solid #39ff8840;border-radius:16px;background:linear-gradient(145deg,#0d3430dd,#08121fdd);box-shadow:inset 0 1px 0 #ffffff25,0 12px 25px #0009,0 0 22px #0ca55b22}
.hx-scene-caption{font:700 10px sans-serif;color:#e8bd60;letter-spacing:1px;text-align:center;margin-top:8px}
.hx-lesson-id{display:inline-block;font:700 11px sans-serif;color:#9af8bd;margin-top:7px}
@media(hover:hover){.hx-topic-scene:hover{transform:perspective(850px) rotateY(0deg) rotateX(0deg)}}
@media(max-width:430px){.tenx-lr-root .hx-hero{grid-template-columns:minmax(0,1fr) 44%;min-height:195px;gap:5px}.hx-topic-scene{transform:perspective(800px) rotateY(-5deg)}.hx-scene-caption{font-size:8px}}
@media(prefers-reduced-motion:reduce){.hx-topic-scene{transition:none}}
`;
function enhance(root){if(!root||root.dataset.hxD2==='1')return false;const hero=root.querySelector('.hx-hero');if(!hero)return false;
 const title=hero.querySelector('.hx-hero-title');const t=normalize(title&&title.textContent);const entry=byTitle.get(t);
 if(!entry)return false;
 const scene=el('div','hx-topic-scene');scene.setAttribute('role','img');scene.setAttribute('aria-label','نمودار مفهومی سه‌بعدی مرتبط با '+entry.title);
 const svg=svgEl('svg',{viewBox:'0 0 340 205','aria-hidden':'true',focusable:'false'});draw(svg,entry.scene,entry.number);scene.appendChild(svg);
 scene.appendChild(el('div','hx-scene-caption',entry.scene.toUpperCase()+' · 10X 3D'));
 hero.appendChild(scene);const copy=hero.querySelector('.hx-hero-copy');if(copy)copy.appendChild(el('span','hx-lesson-id','LESSON '+String(entry.number).padStart(2,'0')+' / 50'));
 root.dataset.hxD2='1';root.dataset.hxLesson=entry.id;return true;
}
function scan(){document.querySelectorAll('.tenx-lr-root').forEach(enhance)}
if(!document.getElementById('tenx-hybrid3d-scenes-style')){const style=el('style');style.id='tenx-hybrid3d-scenes-style';style.textContent=css;document.head.appendChild(style)}
let queued=false;function schedule(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;scan()})}
const obs=new MutationObserver(schedule);function start(){scan();obs.observe(document.body,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();