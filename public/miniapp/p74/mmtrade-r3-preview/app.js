(() => {
  'use strict';
  const stages = [...document.querySelectorAll('.mm-stage')];
  // Native <details>/<summary> keeps keyboard and accessibility behavior.
  stages.forEach(stage => {
    stage.addEventListener('toggle', () => {
      if (!stage.open) return;
      stages.forEach(other => { if (other !== stage) other.open = false; });
    });
  });
  document.querySelectorAll('[data-next]').forEach(button => {
    button.addEventListener('click', () => {
      const next = document.getElementById('stage-' + button.dataset.next);
      if (!next) return;
      next.open = true;
      next.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start'});
    });
  });
  document.getElementById('start-challenge')?.addEventListener('click', () => {
    const toast = document.getElementById('mm-toast');
    toast.hidden = false;
    // Explicitly no fake sign-up or backend request.
  });
})();
