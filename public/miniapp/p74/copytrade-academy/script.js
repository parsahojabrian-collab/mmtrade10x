/* MMTrade 10X — no-scroll lesson navigator. The original assets/style identity are preserved. */
(() => {
  'use strict';
  const image = Object.freeze({
    book:'book.webp',pair:'pair.webp',swap:'swap.webp',laptop:'laptop.webp',
    candles:'candles.webp',tether:'tether.webp',mag:'mag.webp'
  });
  const index = document.querySelector('.s1');
  const screen = document.getElementById('D');
  const notice = document.getElementById('notice');
  const state = { lesson:-1, slide:0, completed:new Set(), bookmarks:new Set() };
  const fa = (n) => Number(n).toLocaleString('fa-IR');
  const esc = (x) => String(x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const asset = (name) => 'assets/' + (image[name] || 'book.webp');
  const savedKey='mmtrade.copytrade.bookmarks.v2';
  try { state.bookmarks = new Set(JSON.parse(localStorage.getItem(savedKey) || '[]').filter(Number.isInteger)); } catch (_) {}

  function showIndex() {
    state.lesson=-1;
    screen.hidden=true;
    screen.replaceChildren();
    index.hidden=false;
    renderMarks();
    document.body.classList.remove('lesson-open');
  }
  function renderMarks() {
    document.querySelectorAll('.row[data-k]').forEach(btn => {
      const k=Number(btn.dataset.k);
      btn.classList.toggle('is-complete',state.completed.has(k));
      btn.setAttribute('aria-label',`${LESSONS[k].title}${state.completed.has(k)?'، مطالعه‌شده':''}`);
    });
  }
  function showLesson(k, s=0) {
    if (!Number.isInteger(k) || k<0 || k>=LESSONS.length) return showIndex();
    state.lesson=k;
    state.slide=Math.max(0,Math.min(LESSONS[k].slides.length-1,s));
    index.hidden=true;
    screen.hidden=false;
    document.body.classList.add('lesson-open');
    renderLesson();
  }
  function renderLesson() {
    const k=state.lesson, n=state.slide, lesson=LESSONS[k], page=lesson.slides[n];
    const first=n===0, last=n===lesson.slides.length-1;
    const prevText=(k===0&&first)?'فهرست':'بخش قبل';
    const nextText=last?(k===LESSONS.length-1?'پایان دوره':'درس بعد'):'ادامه درس';
    const rows=page.items.map(([t,d],i)=>`<li class="item"><span class="item-number" aria-hidden="true">${fa(i+1)}</span><span class="item-copy"><strong id="mmct-lesson-${k}-${n}-item-${i}-title">${esc(t)}</strong><span id="mmct-lesson-${k}-${n}-item-${i}-detail">${esc(d)}</span></span></li>`).join('');
    const tabs=lesson.slides.map((_,i)=>`<button type="button" class="mini-dot${i===n?' is-current':''}" data-action="slide" data-slide="${i}" aria-label="بخش ${fa(i+1)} از ${fa(lesson.slides.length)}" aria-current="${i===n?'step':'false'}"></button>`).join('');
    const bookmarked=state.bookmarks.has(k);
    const btn=page.action ? '<button type="button" class="connect-cta" data-action="connect">اتصال حساب کپی‌ترید <span aria-hidden="true">↗</span></button>' : '';
    screen.innerHTML=`
      <article id="mmct-lesson-${k}-${n}" class="lesson-card" data-lesson="${k}" data-slide="${n}">
        <header class="lesson-top">
          <button class="round-btn" type="button" data-action="index" aria-label="بازگشت به فهرست">←</button>
          <div class="lesson-position"><span>درس ${fa(k+1)} از ${fa(LESSONS.length)}</span><div class="lesson-line"><i style="width:${(k+1)/LESSONS.length*100}%"></i></div></div>
          <button class="round-btn bookmark ${bookmarked?'is-bookmarked':''}" type="button" data-action="bookmark" aria-label="${bookmarked?'حذف نشانک':'نشانک‌گذاری این درس'}" aria-pressed="${bookmarked}"><img src="assets/bm.webp" alt=""></button>
        </header>
        <div class="lesson-hero${first?'':' compact-hero'}"><img id="mmct-lesson-icon-${k}" src="${asset(lesson.icon)}" alt=""><span class="hero-tag">${esc(page.eyebrow)}</span></div>
        <section class="lesson-intro"><h2 id="mmct-lesson-${k}-${n}-heading">${esc(page.heading)}</h2><p id="mmct-lesson-${k}-${n}-lead">${esc(page.lead)}</p></section>
        <section class="lesson-panel" aria-label="نکات آموزشی این بخش">
          <div class="lesson-panel-heading"><strong>${esc(lesson.short)}</strong><span>${fa(n+1)} / ${fa(lesson.slides.length)} بخش</span></div>
          <ol class="lesson-items">${rows}</ol>
          <div class="note"><img id="mmct-lesson-${k}-${n}-note-icon" src="assets/info.webp" alt=""><p id="mmct-lesson-${k}-${n}-note">${esc(page.note)}</p></div>
          ${btn}
        </section>
        <footer class="lesson-footer">
          <button type="button" class="nav-btn prev-btn" data-action="prev"><span aria-hidden="true">←</span><span dir="rtl">${prevText}</span></button>
          <div class="page-status"><span>درس ${fa(k+1)} / ${fa(LESSONS.length)}</span><div class="mini-dots">${tabs}</div></div>
          <button type="button" class="nav-btn next-btn" data-action="next"><span dir="rtl">${nextText}</span><span aria-hidden="true">→</span></button>
        </footer>
      </article>`;
    // No scroll manipulation: screens are strictly viewport-fitted.
  }
  function next() {
    const k=state.lesson, n=state.slide;
    if (n<LESSONS[k].slides.length-1) showLesson(k,n+1);
    else {state.completed.add(k); if(k<LESSONS.length-1) showLesson(k+1,0); else showIndex();}
  }
  function prev() {
    const k=state.lesson,n=state.slide;
    if (n>0) showLesson(k,n-1);
    else if(k>0) showLesson(k-1,LESSONS[k-1].slides.length-1);
    else showIndex();
  }
  function bookmark() {
    const k=state.lesson;
    if(state.bookmarks.has(k)) state.bookmarks.delete(k); else state.bookmarks.add(k);
    try {localStorage.setItem(savedKey,JSON.stringify([...state.bookmarks]));}catch(_){}
    renderLesson();
  }
  function connect() {
    const url=String(window.MMTRADE_CONFIG?.copyConnectUrl||'').trim();
    // Only real, configured internal routes or secure https targets are accepted.
    if ((url.startsWith('/') && !url.startsWith('//')) || /^https:\/\/[^\s]+$/i.test(url)) {
      window.location.assign(url); return;
    }
    notice.hidden=false;
    document.getElementById('close-notice').focus();
  }
  document.addEventListener('click', e => {
    const row=e.target.closest('.row[data-k]');
    if(row) return showLesson(Number(row.dataset.k));
    const control=e.target.closest('[data-action]');
    if(!control || state.lesson<0) return;
    const action=control.dataset.action;
    if(action==='index') showIndex();
    else if(action==='next') next();
    else if(action==='prev') prev();
    else if(action==='bookmark') bookmark();
    else if(action==='slide') showLesson(state.lesson,Number(control.dataset.slide));
    else if(action==='connect') connect();
  });
  document.getElementById('close-notice').addEventListener('click', () => {notice.hidden=true;});
  notice.addEventListener('click',e => {if(e.target===notice)notice.hidden=true;});
  document.addEventListener('keydown',e=>{
    if(!notice.hidden){if(e.key==='Escape')notice.hidden=true;return;}
    if(state.lesson<0) return;
    if(e.key==='Escape')showIndex();
    if(e.key==='ArrowLeft')next();
    if(e.key==='ArrowRight')prev();
  });
  showIndex();
  if (new URLSearchParams(location.search).get('visualPreview')==='1') {
    window.addEventListener('message', e => {
      if(e.origin!==location.origin||e.source!==window.parent||e.data?.type!=='MMCT_STUDIO_NAV')return;
      const k=e.data.lesson,n=e.data.slide;
      if(k===-1)return showIndex();
      if(Number.isInteger(k)&&k>=0&&k<LESSONS.length&&Number.isInteger(n)&&n>=0&&n<LESSONS[k].slides.length)showLesson(k,n);
    });
  }
  // Read-only inspection object, useful for browser / deployment verification.
  window.MMTRADE_LESSON_STATUS=()=>({lesson:state.lesson,slide:state.slide,total:LESSONS.length,complete:[...state.completed]});
})();
