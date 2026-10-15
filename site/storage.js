/* IndexedDB is the single durable store. The synchronous cache gives immediate
 * feedback; review updates read and change the latest value in one transaction.
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
  const STAFF_REVIEW_KEY = 'tonaloom-staff-interval-review-v1';
  const STAFF_SESSION_KEY = 'tonaloom-staff-interval-v1';
  const KEYS = [REVIEW_KEY, SETTINGS_KEY, MELODY_KEY, SIGHT_TREBLE_KEY, SIGHT_BASS_KEY, SIGHT_SETTINGS_KEY, SIGHT_SESSION_KEY, STAFF_REVIEW_KEY, STAFF_SESSION_KEY];

  const transact = (db, mode, build) => new Promise((resolve, reject) => {
    let result;
    const tx = db.transaction(OBJECT_STORE, mode);
    const store = tx.objectStore(OBJECT_STORE);
    const fail = e => { try { tx.abort(); } catch {} reject(e); };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('数据库事务失败'));
    tx.onabort = () => reject(tx.error || new Error('数据库事务被取消'));
    try { result = build(store, fail); } catch (e) { fail(e); }
  });
  async function readEntries(db) {
    const values = new Map();
    await transact(db, 'readonly', store => {
      for (const key of KEYS) {
        const r = store.get(key);
        r.onsuccess = () => values.set(key, typeof r.result === 'string' ? r.result : null);
      }
    });
    return values;
  }
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
    const changes = new Map();
    let channel = null, refreshing = null, refreshRequested = false;
    let failure = '';
    let migrated = false;
    let migratedKeys = [];
    try {
      db = await openDatabase();
      for (const [key, value] of await readEntries(db)) if (value !== null) cache.set(key, value);
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
          if ([REVIEW_KEY, MELODY_KEY, SIGHT_TREBLE_KEY, SIGHT_BASS_KEY, STAFF_REVIEW_KEY].includes(key)) root.IntervalReview.normalizeStore(parsed, [SIGHT_TREBLE_KEY,SIGHT_BASS_KEY].includes(key)?62:12);
          if (key === SETTINGS_KEY && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) continue;
          legacy.push([key, old]);
        } catch { continue; }
      }
      if (legacy.length) {
        const restored = new Map();
        await transact(db, 'readwrite', (store, fail) => {
          for (const [key, value] of legacy) {
            const r = store.get(key);
            r.onsuccess = () => {
              try {
                // A second window may have saved new data since initialization.
                if (typeof r.result === 'string') restored.set(key, r.result);
                else { store.put(value, key); restored.set(key, value); migratedKeys.push(key); }
              } catch (e) { fail(e); }
            };
          }
        });
        for (const [key, value] of restored) cache.set(key, value);
        migrated = migratedKeys.length > 0;
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
    function setCached(key, value) {
      if (value === null) cache.delete(key); else cache.set(key, value);
    }
    function reconcile(key, saved) {
      const before = cache.get(key) ?? null;
      for (const change of changes.get(key) || []) saved = change.apply(saved);
      setCached(key, saved);
      return before !== saved;
    }
    function notify(keys) {
      if (keys.length) root.dispatchEvent?.(new CustomEvent('interval-trainer-storage-updated', {detail:keys}));
    }
    function broadcast(keys) {
      const known = keys.filter(key => KEYS.includes(key));
      if (known.length) try { channel?.postMessage(known); } catch { /* focus refresh is also available */ }
    }
    function updateItem(key, update) {
      if (!db || failure) throw new Error(failure || 'IndexedDB 未就绪');
      const optimistic = update(cache.get(key) ?? null);
      const queue = changes.get(key) || [];
      const change = {apply:update};
      queue.push(change); changes.set(key, queue);
      setCached(key, optimistic);
      let saved;
      const operation = transact(db, 'readwrite', (store, fail) => {
        const r = store.get(key);
        r.onsuccess = () => {
          try {
            // Keep the read and write in the same transaction. Other windows
            // cannot insert an intervening write to this object store.
            const previous = typeof r.result === 'string' ? r.result : null;
            saved = update(previous);
            if (saved !== previous) {
              if (saved === null) store.delete(key); else store.put(saved, key);
            }
          } catch (e) { fail(e); }
        };
      }).then(() => {
        queue.splice(queue.indexOf(change), 1);
        if (!queue.length) changes.delete(key);
        if (reconcile(key, saved)) notify([key]);
        broadcast([key]);
      });
      track(operation);
      return optimistic;
    }
    const adapter = {
      get available() { return Boolean(db) && !failure; },
      get failureMessage() { return failure; },
      migrated,
      migratedKeys,
      getItem(key) { return cache.has(key) ? cache.get(key) : null; },
      setItem(key, value) {
        value = String(value);
        updateItem(key, () => value);
      },
      removeItem(key) {
        updateItem(key, () => null);
      },
      updateItem,
      async flush() {
        while (pending.size) await Promise.all([...pending]);
        if (failure) throw new Error(failure);
      },
      refresh() {
        refreshRequested = true;
        if (!refreshing) refreshing = (async () => {
          do {
            refreshRequested = false;
            await this.flush();
            if (!db) throw new Error('IndexedDB 未就绪');
            const updated = [];
            for (const [key, value] of await readEntries(db)) if (reconcile(key, value)) updated.push(key);
            notify(updated);
          } while (refreshRequested);
        })().finally(() => { refreshing = null; });
        return refreshing;
      },
      async replaceEntries(entries) {
        if (!db || failure) throw new Error(failure || 'IndexedDB 未就绪');
        // Callers prepare every entry first. Update the cache only after the whole
        // transaction commits, so a rejected import leaves both copies unchanged.
        const rows = entries.map(([key, value]) => [key, String(value)]);
        await this.flush();
        await transact(db, 'readwrite', store => {
          for (const [key, value] of rows) store.put(value, key);
        });
        const updated = [];
        for (const [key, value] of rows) if (reconcile(key, value)) updated.push(key);
        notify(updated); broadcast(rows.map(([key]) => key));
      },
      async replaceBoth(settingsJson, reviewJson) {
        return this.replaceEntries([[SETTINGS_KEY, settingsJson], [REVIEW_KEY, reviewJson]]);
      },
      async replaceWithSight(settingsJson, harmonicJson, melodicJson, trebleJson, bassJson, sightSettingsJson) {
        return this.replaceEntries([[SETTINGS_KEY,settingsJson],[REVIEW_KEY,harmonicJson],[MELODY_KEY,melodicJson],
          [SIGHT_TREBLE_KEY,trebleJson],[SIGHT_BASS_KEY,bassJson],[SIGHT_SETTINGS_KEY,sightSettingsJson]]);
      },
      async replaceAll(settingsJson, harmonicJson, melodicJson) {
        return this.replaceEntries([[SETTINGS_KEY,settingsJson],[REVIEW_KEY,harmonicJson],[MELODY_KEY,melodicJson]]);
      }
    };
    // Messages only request a fresh database read; correctness of writes does
    // not depend on message delivery or BroadcastChannel support.
    const refresh = () => { adapter.refresh().catch(() => {}); };
    if (db && root.BroadcastChannel) {
      try { channel = new root.BroadcastChannel(DATABASE); channel.onmessage = refresh; } catch {}
    }
    root.addEventListener?.('focus', refresh);
    // Persistent-storage request may be denied; app still works in best-effort mode.
    if (db && root.navigator?.storage?.persist) {
      root.navigator.storage.persist().catch(() => {});
    }
    return adapter;
  }
  root.IntervalPwaStorage = Object.freeze({initialize, REVIEW_KEY, MELODY_KEY, SETTINGS_KEY, SIGHT_TREBLE_KEY, SIGHT_BASS_KEY, SIGHT_SETTINGS_KEY, SIGHT_SESSION_KEY, STAFF_REVIEW_KEY, STAFF_SESSION_KEY, DATABASE});
})(window);
