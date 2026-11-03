
(function () {
'use strict';

var CSS = `
.tenx-lr-root{
  --hx-green:#39ff88;
  --hx-gold:#e8bd60;
  color:#edf7f5;
  background:linear-gradient(145deg,#08151b,#09131a 65%,#061d18);
  border:1px solid rgba(57,255,136,.18);
  border-radius:22px;
  padding:16px;
  position:relative;
  isolation:isolate;
  overflow:hidden;
  font-family:inherit;
}
.tenx-lr-root *{box-sizing:border-box}
.tenx-lr-root:before{
  content:"";
  position:absolute;
  inset:0;
  background:radial-gradient(ellipse at 10% 0%,
    rgba(57,255,136,.10),transparent 48%);
  pointer-events:none;
  z-index:-1;
}
.hx-hero{
  position:relative;
  min-height:220px;
  border-radius:22px;
  overflow:hidden;
  padding:22px 18px;
  margin-bottom:24px;
  background:
    radial-gradient(circle at 28% 42%,rgba(57,255,136,.17),transparent 45%),
    linear-gradient(125deg,#061c1b,#0b1423 65%,#121a21);
  border:1px solid rgba(57,255,136,.3);
  display:grid;
  grid-template-columns:minmax(0,1fr) 42%;
  align-items:center;
  gap:8px;
}
.hx-hero-copy{position:relative;z-index:2}
.hx-eyebrow{
  color:var(--hx-gold);
  font-size:11px;
  letter-spacing:1px;
  font-weight:800;
}
.hx-hero-title{
  font-size:clamp(17px,4.4vw,27px);
  font-weight:900;
  line-height:1.6;
  margin:8px 0;
  color:#fff;
}
.hx-hero-sub{
  font-size:12px;
  line-height:1.9;
  color:#c6d7d5;
}
.hx-scene{
  width:100%;
  aspect-ratio:1;
  position:relative;
  perspective:600px;
  display:grid;
  place-items:center;
  transform-style:preserve-3d;
}
.hx-orb{
  width:77%;
  aspect-ratio:1;
  border-radius:50%;
  position:relative;
  transform:rotate(-16deg);
  background:
    radial-gradient(circle at 28% 25%,#9afbd0 0%,#19b878 14%,
      #07654b 37%,#062b35 64%,#030c16 85%);
  box-shadow:
    inset -15px -15px 25px #010b16,
    inset 8px 8px 18px rgba(196,255,221,.35),
    0 0 36px rgba(57,255,136,.32),
    0 22px 32px rgba(0,0,0,.6);
  animation:hx-float 7s ease-in-out infinite;
}
.hx-orb:before,.hx-orb:after{
  content:"";
  position:absolute;
  inset:-15%;
  border:2px solid rgba(232,189,96,.7);
  border-radius:50%;
  transform:rotateX(70deg) rotate(-22deg);
  box-shadow:0 0 12px rgba(232,189,96,.3);
}
.hx-orb:after{
  inset:-27%;
  border-color:rgba(57,255,136,.65);
  transform:rotateX(65deg) rotate(37deg);
}
.hx-candles{
  position:absolute;
  inset:22% 4% 8%;
  display:flex;
  align-items:flex-end;
  justify-content:space-around;
  transform:rotate(-8deg);
  filter:drop-shadow(0 0 8px rgba(57,255,136,.4));
}
.hx-candle{
  width:10%;
  min-width:4px;
  height:var(--h);
  position:relative;
  border-radius:2px;
  background:linear-gradient(90deg,#006f4b,#4eff9a,#0b8d58);
  box-shadow:0 0 10px rgba(57,255,136,.35);
}
.hx-candle:nth-child(3n){
  background:linear-gradient(90deg,#a82c42,#ff5b65,#a22a40);
}
.hx-candle:before{
  content:"";
  position:absolute;
  width:2px;
  height:145%;
  left:calc(50% - 1px);
  top:-22%;
  background:inherit;
}
.hx-hero[data-theme="risk"] .hx-orb{
  filter:hue-rotate(35deg);
}
.hx-hero[data-theme="psychology"] .hx-orb{
  filter:hue-rotate(95deg);
}
.hx-hero[data-theme="technical"] .hx-orb{
  filter:hue-rotate(-12deg);
}
.tenx-lr-heading{
  color:#f6f9f8;
  border-right:3px solid var(--hx-green);
  padding-right:12px;
  font-size:clamp(16px,4vw,21px);
}
.tenx-lr-paragraph{
  color:#d0dcdf;
  font-size:14px;
  line-height:2.15;
}
.tenx-lr-callout,.tenx-lr-summary,
.tenx-lr-interactive,.tenx-lr-chart{
  background:linear-gradient(140deg,
    rgba(11,39,38,.95),rgba(11,23,35,.95));
  border:1px solid rgba(57,255,136,.25);
  border-radius:18px;
  box-shadow:0 12px 30px rgba(0,0,0,.16),
    inset 0 1px 0 rgba(255,255,255,.035);
}
.tenx-lr-callout{
  border-right:3px solid var(--hx-gold);
}
.tenx-lr-summary{
  border-color:rgba(232,189,96,.45);
  background:linear-gradient(120deg,#0d2d23,#111c22);
}
.tenx-lr-chart{
  position:relative;
  overflow:hidden;
}
.tenx-lr-chart:after{
  content:"";
  position:absolute;
  width:140px;height:140px;
  left:-60px;top:-70px;
  background:radial-gradient(circle,
    rgba(57,255,136,.15),transparent 70%);
  pointer-events:none;
}
.tenx-lr-track{
  height:14px;
  border:1px solid rgba(57,255,136,.15);
  box-shadow:inset 0 2px 5px rgba(0,0,0,.5);
}
.tenx-lr-fill{
  background:linear-gradient(90deg,#067e56,#39ff88,#a6ffd1);
  box-shadow:0 0 15px rgba(57,255,136,.5);
}
.tenx-lr-interactive input[type=range]{
  accent-color:#39ff88;
  cursor:pointer;
}
.tenx-lr-figure img{
  border:1px solid rgba(232,189,96,.25);
  box-shadow:0 14px 35px rgba(0,0,0,.35);
}
.hx-block-label{
  display:inline-flex;
  align-items:center;
  gap:7px;
  font-size:11px;
  font-weight:700;
  color:var(--hx-gold);
  margin-bottom:8px;
}
.hx-card-tilt{
  transform:perspective(850px) rotateX(1deg);
  transition:transform .25s ease,box-shadow .25s ease;
}
@media(hover:hover){
  .hx-card-tilt:hover{
    transform:perspective(850px) rotateX(0) translateY(-3px);
    box-shadow:0 18px 40px rgba(0,0,0,.3);
  }
}
@keyframes hx-float{
  0%,100%{transform:translateY(0) rotate(-16deg)}
  50%{transform:translateY(-9px) rotate(-12deg)}
}
@media(max-width:430px){
  .tenx-lr-root{padding:12px;border-radius:16px}
  .hx-hero{grid-template-columns:minmax(0,1fr) 38%;
    min-height:190px;padding:16px 12px}
  .hx-hero-sub{font-size:11px}
}
@media(prefers-reduced-motion:reduce){
  .hx-orb{animation:none}
  .hx-card-tilt{transition:none}
}
`;

function element(tag, cls, value) {
  var e=document.createElement(tag);
  if(cls)e.className=cls;
  if(value!==undefined)e.textContent=String(value);
  return e;
}

function themeFor(title) {
  if(/ریسک|سرمایه|ضرر|بازده|حجم/.test(title))
    return 'risk';
  if(/روان|هیجان|انضباط|اشتباه/.test(title))
    return 'psychology';
  if(/نمودار|کندل|روند|قیمت|تکنیکال|ساختار/.test(title))
    return 'technical';
  return 'market';
}

function createHero(title, subtitle) {
  var hero=element('section','hx-hero');
  hero.dataset.theme=themeFor(title);

  var copy=element('div','hx-hero-copy');
  copy.appendChild(element('div','hx-eyebrow','10X · HYBRID 3D LEARNING'));
  copy.appendChild(element('div','hx-hero-title',title));
  copy.appendChild(element('div','hx-hero-sub',subtitle));

  var scene=element('div','hx-scene');
  scene.setAttribute('aria-hidden','true');
  scene.appendChild(element('div','hx-orb'));

  var candles=element('div','hx-candles');
  [24,40,33,59,48,78,62,90].forEach(function(h){
    var candle=element('span','hx-candle');
    candle.style.setProperty('--h',h+'%');
    candles.appendChild(candle);
  });
  scene.appendChild(candles);

  hero.append(copy,scene);
  return hero;
}

function enhance(target) {
  if(!target || target.dataset.hybrid3d==='1')return;

  var card=target.closest('.card') || target.parentElement;
  var titleNode=card && card.querySelector('.academy-lesson-title');
  var summaryNode=card && card.querySelector('.academy-lesson-summary');

  var title=titleNode ? titleNode.textContent.trim() : 'آموزش 10X';
  var subtitle=summaryNode ? summaryNode.textContent.trim() :
    'آموزش کاربردی بازارهای مالی';

  target.prepend(createHero(title,subtitle));

  target.querySelectorAll(
    '.tenx-lr-callout,.tenx-lr-summary,'+
    '.tenx-lr-chart,.tenx-lr-interactive'
  ).forEach(function(block){
    block.classList.add('hx-card-tilt');
    var label='';
    if(block.classList.contains('tenx-lr-chart'))
      label='◈ نمودار آموزشی';
    else if(block.classList.contains('tenx-lr-interactive'))
      label='◉ تمرین تعاملی';
    else if(block.classList.contains('tenx-lr-summary'))
      label='✦ نکات کلیدی';
    else label='✧ نکته آموزشی';

    block.prepend(element('div','hx-block-label',label));
  });

  target.dataset.hybrid3d='1';
}

var style=document.createElement('style');
style.id='tenx-hybrid3d-style';
style.textContent=CSS;
document.head.appendChild(style);

function install() {
  var renderer=window.TenxLessonRenderer;
  if(!renderer || typeof renderer.render!=='function')
    return false;

  if(renderer.__hybrid3d)return true;

  var original=renderer.render;

  renderer.render=function(target,raw){
    var ok=original.call(renderer,target,raw);
    if(ok)enhance(target);
    return ok;
  };

  renderer.__hybrid3d=true;
  return true;
}

if(!install()){
  document.addEventListener('DOMContentLoaded',install,{once:true});
}
})();
