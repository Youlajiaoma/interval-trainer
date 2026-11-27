/* Remove the launch overlay after its final fade, or immediately for reduced motion. */
(function () {
  'use strict';
  function start() {
    const splash = document.getElementById('splash-screen');
    if (!splash) return;
    const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const forcePreview = new URLSearchParams(window.location.search).has('previewSplash');
    const remove = () => splash.remove();

    if (forcePreview) splash.classList.add('splash-preview-force');
    if (motionPreference?.matches && !forcePreview) {
      remove();
      return;
    }

    splash.addEventListener('animationend', event => {
      if (event.target === splash && event.animationName === 'splash-exit') remove();
    });
    splash.addEventListener('animationcancel', event => {
      if (event.target === splash && event.animationName === 'splash-exit') remove();
    });
    motionPreference?.addEventListener?.('change', event => { if (event.matches && !forcePreview) remove(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();
