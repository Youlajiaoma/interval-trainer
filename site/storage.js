/* IndexedDB is the single durable store. Synchronous adapter keeps the v1.4
 * question/review engine unchanged; each setItem opens an immediate IDB transaction.
 * localStorage is READ ONLY during first-time migration from legacy HTML versions.
 */
(function (root) {
  'use strict';
  const DATABASE = 'interval-trainer-offline';
  const OBJECT_STORE = 'settings-and-history';
  const DB_VERSION = 1;
  const REVIEW_KEY = 'interval-trainer-review-v1';
  const SETTINGS_KEY = 'interval-trainer-settings';
  const MELODY_KEY = 'interval-trainer-review-melodic-v1';
  const SIGHT_TREBLE_KEY = 'interval-trainer-review-sight-treble-v1';
  const SIGHT_BASS_KEY = 'interval-trainer-review-sight-bass-v1';
  const SIGHT_SETTINGS_KEY = 'interval-trainer-sight-settings-v1';
  const SIGHT_SESSION_KEY = 'interval-trainer-sight-session-v1';
  const KEYS = [REVIEW_KEY, SETTINGS_KEY, MELODY_KEY, SIGHT_TREBLE_KEY, SIGHT_BASS_KEY, SIGHT_SETTINGS_KEY, SIGHT_SESSION_KEY];

  const req = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('数据库读取失败'));
  });
  const transact = (db, mode, build) => new Promise((resolve, reject) => {
    let result;
    const tx = db.transaction(OBJECT_STORE, mode);
    const store = tx.objectStore(OBJECT_STORE);
    try { result = build(store); } catch (e) { try { tx.abort(); } catch {} reject(e); return; }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('数据库事务失败'));
    tx.onabort = () => reject(tx.error || new Error('数据库事务被取消'));
  });
  function openDatabase() {
    if (!('indexedDB' in root)) return Promise.reject(new Error('该浏览器不支持 IndexedDB'));
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(DATABASE, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains(OBJECT_STORE)) db.createObjectStore(OBJECT_STORE);
      };
      r.onsuccess = () => { const db = r.result; db.onversionchange = () => db.close(); resolve(db); };
      r.onerror = () => reject(r.error || new Error('数据库打开失败'));
      r.onblocked = () => reject(new Error('数据库被其他标签页占用，请关闭其他页面后刷新'));
    });
  }
  async function initialize() {
    let db;
    const cache = new Map();
    const pending = new Set();
    let failure = '';
    let migrated = false;
    let migratedKeys = [];
    try {
      db = await openDatabase();
      for (const key of KEYS) {
        const value = await req(db.transaction(OBJECT_STORE, 'readonly').objectStore(OBJECT_STORE).get(key));
        if (typeof value === 'string') cache.set(key, value);
      }
      // Preserve data already saved by the PWA: never overwrite with old localStorage.
      // Imported v1.3/v1.4 JSON data is handled separately below.
      const legacy = [];
      for (const key of KEYS) {
        if (cache.has(key)) continue;
        let old = null;
        try { old = root.localStorage?.getItem(key); } catch { /* file or privacy mode */ }
        if (!old) continue;
        try {
          const parsed = JSON.parse(old);
          if ([REVIEW_KEY, MELODY_KEY, SIGHT_TREBLE_KEY, SIGHT_BASS_KEY].includes(key)) root.IntervalReview.normalizeStore(parsed, [SIGHT_TREBLE_KEY,SIGHT_BASS_KEY].includes(key)?62:12);
          if (key === SETTINGS_KEY && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) continue;
          legacy.push([key, old]);
        } catch { continue; }
      }
      if (legacy.length) {
        await transact(db, 'readwrite', store => { for (const [key, value] of legacy) store.put(value, key); });
        for (const [key, value] of legacy) { cache.set(key, value); migratedKeys.push(key); }
        migrated = true;
      }
    } catch (e) {
      failure = `IndexedDB 无法使用：${e.message}。当前练习数据无法可靠保存，请检查浏览器设置。`;
      if (db) db.close();
      db = null;
    }
    // Fail loudly after a failed IDB commit. Do not silently fall back to localStorage.
    function track(operation) {
      pending.add(operation);
      operation.catch(e => {
        failure = `学习数据保存失败：${e.message}；请勿继续依赖当前记录，优先导出备份。`;
        try { root.dispatchEvent(new CustomEvent('interval-trainer-storage-error', {detail:failure})); } catch {}
      });
      operation.finally(() => pending.delete(operation)).catch(() => {});
    }
    const adapter = {
      get available() { return Boolean(db) && !failure; },
      get failureMessage() { return failure; },
      migrated,
      migratedKeys,
      getItem(key) { return cache.has(key) ? cache.get(key) : null; },
      setItem(key, value) {
        if (!db || failure) throw new Error(failure || 'IndexedDB 未就绪');
        value = String(value);
        cache.set(key, value);
        track(transact(db, 'readwrite', store => { store.put(value, key); }));
      },
      removeItem(key) {
        if (!db || failure) throw new Error(failure || 'IndexedDB 未就绪');
        cache.delete(key);
        track(transact(db, 'readwrite', store => { store.delete(key); }));
      },
      async flush() {
        const tasks = [...pending];
        await Promise.all(tasks);
        if (failure) throw new Error(failure);
      },
      async replaceBoth(settingsJson, reviewJson) {
        if (!db || failure) throw new Error(failure || 'IndexedDB 未就绪');
        // Caller validates content before write. Commit settings + review atomically.
        await this.flush();
        await transact(db, 'readwrite', store => {
          store.put(String(settingsJson), SETTINGS_KEY);
          store.put(String(reviewJson), REVIEW_KEY);
        });
        cache.set(SETTINGS_KEY, String(settingsJson));
        cache.set(REVIEW_KEY, String(reviewJson));
      },
      async replaceWithSight(settingsJson, harmonicJson, melodicJson, trebleJson, bassJson, sightSettingsJson) {
        if (!db || failure) throw new Error(failure || 'IndexedDB 未就绪');
        await this.flush();
        const rows = [[SETTINGS_KEY,settingsJson],[REVIEW_KEY,harmonicJson],[MELODY_KEY,melodicJson],
          [SIGHT_TREBLE_KEY,trebleJson],[SIGHT_BASS_KEY,bassJson],[SIGHT_SETTINGS_KEY,sightSettingsJson]];
        await transact(db, 'readwrite', store => { for(const [key,value] of rows) store.put(String(value),key); });
        for(const [key,value] of rows) cache.set(key,String(value));
      },
      async replaceAll(settingsJson, harmonicJson, melodicJson) {
        if (!db || failure) throw new Error(failure || 'IndexedDB 未就绪');
        await this.flush();
        await transact(db, 'readwrite', store => {
          store.put(String(settingsJson), SETTINGS_KEY);
          store.put(String(harmonicJson), REVIEW_KEY);
          store.put(String(melodicJson), MELODY_KEY);
        });
        cache.set(SETTINGS_KEY, String(settingsJson));
        cache.set(REVIEW_KEY, String(harmonicJson));
        cache.set(MELODY_KEY, String(melodicJson));
      }
    };
    // Persistent-storage request may be denied; app still works in best-effort mode.
    if (db && root.navigator?.storage?.persist) {
      root.navigator.storage.persist().catch(() => {});
    }
    return adapter;
  }
  root.IntervalPwaStorage = Object.freeze({initialize, REVIEW_KEY, MELODY_KEY, SETTINGS_KEY, SIGHT_TREBLE_KEY, SIGHT_BASS_KEY, SIGHT_SETTINGS_KEY, SIGHT_SESSION_KEY, DATABASE});
})(window);
