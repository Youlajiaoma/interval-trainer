(function () {
  'use strict';
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {scope:'./', updateViaCache:'none'});
      // Quietly check for an update; it activates on the next full app close/reopen.
      if (navigator.onLine) registration.update().catch(() => {});
    } catch (error) {
      console.warn('离线缓存注册失败；请使用 HTTPS 或 localhost 访问。', error);
    }
  });
})();
