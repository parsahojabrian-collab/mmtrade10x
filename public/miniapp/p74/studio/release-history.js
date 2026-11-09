/* Paired release history. Preview is read-only; restore writes drafts only. */
(() => {
 'use strict';
 const node=(tag,text,klass='')=>{const n=document.createElement(tag);n.textContent=text;n.className=klass;return n;};
 const button=(text,action,disabled=false)=>{const n=node('button',text,'minor');n.type='button';n.disabled=disabled;n.onclick=action;return n;};
 function create({api,context,setBusy,onPreview,onRestored,notify,confirm=window.confirm.bind(window)}){
  let request=0;
  const same=c=>{const now=context();return now.page===c.page&&now.session===c.session;};
  const path=c=>'/mmvs/releases/'+encodeURIComponent(c.page);
  function available(){const c=context();if(c.busy)throw Error('عملیات دیگری در حال انجام است؛ صبر کنید');return c;}
  async function load(){
   const c=context(),id=++request,host=document.getElementById('version-list');host.replaceChildren(node('p','در حال دریافت تاریخچه…','hint'));
   try{const result=await api(path(c));if(id!==request||!same(c))return;
    host.replaceChildren();for(const v of result.items||[]){
     const row=node('article','','version-item'),summary=node('div','');
     summary.append(node('strong','نسخه '+v.version+' · '+(v.paired?'محتوا و چیدمان':'فقط محتوای قدیمی')),
      node('small',new Date(v.createdAt).toLocaleString('fa-IR')+' · '+(v.createdBy?.email||'مدیر')));
     const actions=node('div','','release-actions');
     actions.append(button('پیش‌نمایش نسخه',()=>preview(v.id),!v.paired),button('بازیابی به پیش‌نویس',()=>restore(v.id),!v.paired));
     if(!v.paired)summary.append(node('small','چیدمان هم‌زمان این نسخه ثبت نشده است؛ بازیابی هماهنگ ممکن نیست.','release-warning'));
     row.append(summary,actions);host.append(row);
    }
    if(!host.children.length)host.append(node('p','هنوز نسخه‌ای ثبت نشده؛ از نسخه عمومی فعلی یک نقطه بازگشت بسازید.','hint'));
   }catch(e){if(id===request&&same(c))host.replaceChildren(node('p','دریافت تاریخچه انجام نشد: '+e.message,'release-warning'));}
  }
  async function preview(id){
   let c;try{c=available();setBusy(true,'در حال دریافت پیش‌نمایش…');const snapshot=await api(path(c)+'/'+encodeURIComponent(id));if(same(c))onPreview(snapshot);}
   catch(e){notify('پیش‌نمایش باز نشد: '+e.message,true)}finally{if(c)setBusy(false)}
  }
  async function restore(id){
   let c;try{c=available();if(!Number.isInteger(c.spatialRevision))throw Error('چیدمان هنوز آماده نیست');
    const question=(c.dirty?'تغییرات ذخیره‌نشده کنار گذاشته می‌شوند. ':'')+'محتوا و چیدمان این نسخه با هم به پیش‌نویس برگردند؟ نسخه عمومی تا انتشار تغییر نمی‌کند.';
    if(!confirm(question))return;setBusy(true,'در حال بازیابی پیش‌نویس…');
    await api(path(c)+'/'+encodeURIComponent(id)+'/restore','POST',{expectedRevision:c.revision,spatialExpectedRevision:c.spatialRevision});
    if(same(c)){await onRestored();notify('محتوا و چیدمان به پیش‌نویس برگشتند؛ پس از بررسی، انتشار را بزنید.');}
   }catch(e){notify('بازیابی انجام نشد: '+e.message,true)}finally{if(c)setBusy(false)}
  }
  async function checkpoint(){
   let c;try{c=available();setBusy(true,'در حال ثبت نقطه بازگشت…');
    const [editor,layout]=await Promise.all([api('/content/pages/'+encodeURIComponent(c.page)+'/editor'),api('/mmvs/layout/'+encodeURIComponent(c.page))]);
    if(!same(c))return;
    await api(path(c)+'/checkpoint','POST',{expectedPublishedRevision:editor.published.revision,spatialExpectedRevision:layout.revision});
    if(same(c)){notify('نسخه عمومی فعلی همراه چیدمانش ثبت شد؛ پیش‌نویس تغییر نکرد.');await load();}
   }catch(e){notify('ثبت نسخه انجام نشد: '+e.message,true)}finally{if(c)setBusy(false)}
  }
  return {load,preview,restore,checkpoint};
 }
 window.MMStudioReleaseHistory={create};
})();
