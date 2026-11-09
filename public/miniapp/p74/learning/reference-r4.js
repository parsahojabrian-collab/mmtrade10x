/* MMTrade10X Stage 1 R4 layered hero — display only, leaves authenticated lessons/API untouched. */
(()=>{'use strict';
const A='./assets/MMTrade10X_Separated_Elements_R1/';
const catalog=[
 ['floor','07_neon_floor_rings.webp'],
 ['chart','05_candlestick_chart_red_green.webp'],
 ['globe','01_earth_globe.webp'],
 ['board','04_forex_crypto_xauusd_board.webp'],
 ['bitcoin','02_bitcoin_coin.webp'],
 ['gold','03_xauusd_gold_bars.webp'],
 ['euro','06_gold_euro_symbol.webp'],
 ['dollar','06b_gold_dollar_symbol.webp'],
 ['fog','08_emerald_fog.webp'],
 ['light','09_gold_light_streak.webp']
];
function mount(){
 const hero=document.getElementById('hero');
 if(!hero||hero.dataset.referenceR4==='ready')return;
 hero.classList.add('ref-r3-hero','ref-r4-scene');
 hero.setAttribute('aria-label','نمای تزئینی بازارها با کره زمین، بیت‌کوین، شمش طلا و کندل‌های قرمز و سبز؛ داده‌ها زنده نیستند');
 hero.dataset.referenceR4='ready';
 const oldArt=hero.querySelector('.ref-r3-art');if(oldArt)oldArt.remove();
 hero.querySelector('.ref-r3-candles')?.remove();
 for(const [name,file] of catalog){
   const img=document.createElement('img');img.className='ref-r4-piece ref-r4-'+name;
   img.src=A+file;img.alt='';img.setAttribute('aria-hidden','true');
   img.draggable=false;img.decoding='async';img.loading='eager';
   if(name==='globe'||name==='bitcoin'||name==='gold')img.fetchPriority='high';
   hero.append(img);
 }
 // Independent green/red candles (on top of the combined decorative chart).
 const candlePositions=[
  [42,70,'green'],[46,64,'red'],[50,57,'green'],[54,52,'green'],
  [58,60,'red'],[62,44,'green'],[66,41,'green'],[70,46,'red']
 ];
 for(let i=0;i<candlePositions.length;i++){
   const [x,y,color]=candlePositions[i];
   const img=document.createElement('img');img.className='ref-r4-piece ref-r4-candle';
   img.src=A+(color==='green'?'10_single_green_candle.webp':'11_single_red_candle.webp');
   img.alt='';img.setAttribute('aria-hidden','true');img.draggable=false;img.decoding='async';
   img.style.setProperty('--x',x+'%');img.style.setProperty('--y',y+'%');
   img.style.setProperty('--speed',(2.5+(i%4)*.45)+'s');img.style.setProperty('--offset',(-i*.32)+'s');
   img.style.setProperty('--candle-color',color==='green'?'#1fee91':'#f44855');
   hero.append(img);
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
