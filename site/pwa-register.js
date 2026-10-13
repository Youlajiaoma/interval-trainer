/* v1.8 PWA lifecycle: foreground/online/periodic checks, user-confirmed update. No storage deletion. */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  const CHECK_INTERVAL = 15 * 60 * 1000; // Background checks when the app stays open.
  const FOREGROUND_THROTTLE = 30 * 1000;
  const APPLY_TIMEOUT = 12000;
  let registration = null;
  let lastCheck = 0;
  let checkRunning = null;
  let applying = false;
  let reloading = false;
  let pendingWorker = null;
  let notice = null;
  let messageNode = null;
  let applyButton = null;
  let timeoutId = null;
  const watchedWorkers = new WeakSet();

  function destroyNotice() {
    if (notice) notice.remove();
    notice = null;
    messageNode = null;
    applyButton = null;
  }

  function showUpdate(worker) {
    if (!worker || worker.state !== 'installed' || !navigator.serviceWorker.controller) return;
    pendingWorker = worker;
    if (applying) return;
    if (notice) {
      messageNode.textContent = '发现新版本，可立即更新';
      applyButton.disabled = false;
      return;
    }
    notice = document.createElement('div');
    notice.id = 'pwa-update-notice';
    notice.className = 'pwa-update-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    messageNode = document.createElement('span');
    messageNode.className = 'pwa-update-message';
    messageNode.textContent = '发现新版本，可立即更新';
    applyButton = document.createElement('button');
    applyButton.type = 'button';
    applyButton.textContent = '立即更新';
    const laterButton = document.createElement('button');
    laterButton.type = 'button';
    laterButton.textContent = '稍后';
    laterButton.addEventListener('click', () => destroyNotice());
    applyButton.addEventListener('click', () => {
      if (applying) return;
      const target = registration?.waiting || pendingWorker;
      if (!target || target.state !== 'installed') {
        messageNode.textContent = '更新包尚未就绪，请稍后重试';
        return;
      }
      applying = true;
      applyButton.disabled = true;
      applyButton.textContent = '正在更新…';
      messageNode.textContent = '正在激活新版，请勿关闭页面';
      try {
        target.postMessage({ type: 'SKIP_WAITING' });
      } catch (error) {
        console.warn('PWA 激活新版失败', error);
        applying = false;
        applyButton.disabled = false;
        applyButton.textContent = '重试更新';
        messageNode.textContent = '激活失败，请联网重试';
        return;
      }
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (reloading) return;
        applying = false;
        applyButton.disabled = false;
        applyButton.textContent = '重试更新';
        messageNode.textContent = '未能完成切换，请关闭其他已打开的音程听辨窗口后重试';
      }, APPLY_TIMEOUT);
    });
    notice.append(messageNode, applyButton, laterButton);
    (document.body || document.documentElement).appendChild(notice);
  }

  function watchWorker(worker) {
    if (!worker || watchedWorkers.has(worker)) return;
    watchedWorkers.add(worker);
    function inspect() {
      if (worker.state === 'installed') showUpdate(worker);
    }
    worker.addEventListener('statechange', inspect);
    inspect();
  }

  function inspectRegistration() {
    if (!registration) return;
    if (registration.waiting) showUpdate(registration.waiting);
    if (registration.installing) watchWorker(registration.installing);
  }

  async function checkForUpdates(force) {
    if (!registration || !navigator.onLine) return;
    const now = Date.now();
    if (!force && now - lastCheck < FOREGROUND_THROTTLE) {
      inspectRegistration();
      return;
    }
    if (checkRunning) return checkRunning;
    lastCheck = now;
    checkRunning = (async () => {
      try {
        await registration.update();
      } catch (error) {
        // A brief loss of connectivity must not interrupt ongoing practice.
        console.info('PWA 更新检查暂不可用', error);
      } finally {
        checkRunning = null;
        inspectRegistration();
      }
    })();
    return checkRunning;
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only reload automatically after the user has explicitly chosen "立即更新".
    if (applying && !reloading) {
      reloading = true;
      clearTimeout(timeoutId);
      window.location.reload();
    }
  });

  async function start() {
    try {
      registration = await navigator.serviceWorker.register('./sw.js', {
        scope: './', updateViaCache: 'none'
      });
      registration.addEventListener('updatefound', () => watchWorker(registration.installing));
      inspectRegistration();
      await checkForUpdates(true);
      // Checking at a modest frequency is sufficient for a practice app.
      setInterval(() => {
        if (document.visibilityState === 'visible') checkForUpdates(false);
      }, CHECK_INTERVAL);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdates(false);
      });
      window.addEventListener('focus', () => checkForUpdates(false));
      window.addEventListener('online', () => checkForUpdates(true));
    } catch (error) {
      console.warn('PWA 离线服务注册失败。请使用 HTTPS 访问。', error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();
