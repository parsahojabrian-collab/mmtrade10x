/* Shared leave protection for the admin shell and its same-origin editors. */
(() => {
  'use strict';
  const guards = new Map();
  const active = () => [...guards.values()].filter(g => !g.active || g.active());
  const isDirty = () => active().some(g => g.dirty?.());
  const isBusy = () => active().some(g => g.busy?.());
  window.MMAdminWorkspace = {
    register(key, guard) { guards.set(key, guard); return () => guards.delete(key); },
    isDirty, isBusy,
    canLeave() {
      if (isBusy()) { window.alert('عملیات ذخیره یا انتشار در حال انجام است؛ لطفاً صبر کنید.'); return false; }
      return !isDirty() || window.confirm('تغییرات ذخیره‌نشده دارید. بدون ذخیره خارج می‌شوید؟');
    }
  };
  window.addEventListener('beforeunload', event => {
    if (isDirty() || isBusy()) { event.preventDefault(); event.returnValue = ''; }
  });
})();
