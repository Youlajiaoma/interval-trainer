/* Daily goals reuse existing per-day answer totals; each settings drawer edits one module. */
(function (root) {
  'use strict';
  const modules = root.TonaloomModules, key = modules.dailyTasksKey;
  const $ = id => document.getElementById(id), maximum = Math.floor(Number.MAX_SAFE_INTEGER / 10) * 10;
  const relevant = new Set([key,...modules.reviewDefinitions.map(item => item.key)]), counts = new Map();
  let storage, editingId = 'harmonic', draftTarget = 0, saving = false, midnightTimer;
  function validTarget(value) { return Number.isSafeInteger(value) && value >= 0 && value <= maximum && value % 10 === 0; }
  function normalize(value) {
    return Object.fromEntries(modules.list.map(module => {
      const item = value?.[module.id], enabled = item?.enabled === true;
      const target = enabled && validTarget(item?.target) && item.target > 0 ? item.target : 0;
      return [module.id,{enabled:target > 0,target}];
    }));
  }
  function settings() {
    try { return normalize(JSON.parse((storage || root.IntervalPwaStorageAdapter)?.getItem(key) || 'null')); }
    catch { return normalize(null); }
  }
  function answered(module, now) {
    const today = root.IntervalReview.dayKey(now);
    return module.reviews.reduce((total,item) => {
      const saved = storage?.getItem(item.key), previous = counts.get(item.key);
      if (previous && previous.saved === saved && previous.day === today) return total + previous.count;
      let count = 0;
      try {
        const value = JSON.parse(saved || 'null')?.daily?.[today]?.answered;
        if (Number.isSafeInteger(value) && value >= 0) count = value;
      } catch { /* Existing record recovery handles invalid saved data. */ }
      counts.set(item.key,{saved,day:today,count});
      return total + count;
    },0);
  }
  function progress(id, now = Date.now(), config = settings()) {
    const module = modules.get(id), goal = config[id], count = goal.enabled ? answered(module,now) : 0;
    return {...goal,count,complete:goal.enabled && count >= goal.target};
  }
  function description(item) {
    return `今日任务${item.complete ? '已完成' : '未完成'}：${item.count}/${item.target} 题`;
  }
  function render() {
    if (!storage) return;
    const config = settings();
    for (const module of modules.list) {
      const item = progress(module.id,Date.now(),config), marker = $(module.homeId + '-marker');
      marker.textContent = item.complete ? '✓' : '→';
      marker.classList.toggle('daily-complete',item.complete);
      $(module.homeId).setAttribute('aria-label',module.name + (item.enabled ? '，' + description(item) : ''));
      $(module.homeId).setAttribute('title',item.enabled ? description(item) : module.name);
    }
    const active = modules.list.map(module => modules.get(module.id)).find(module => module.isActive?.());
    const item = active ? progress(active.id,Date.now(),config) : null, indicator = $('daily-practice-check');
    indicator.classList.toggle('hidden',!item?.enabled);
    indicator.classList.toggle('is-complete',Boolean(item?.complete));
    indicator.setAttribute('aria-label',item?.enabled ? description(item) : '');
    indicator.setAttribute('title',item?.enabled ? description(item) : '');
  }
  function renderForm() {
    for (const module of modules.list) {
      const section = $('daily-' + module.id + '-settings'), prefix = 'daily-' + module.id;
      section.classList.toggle('hidden',module.id !== editingId);
      $(prefix + '-target').textContent = String(module.id === editingId ? draftTarget : settings()[module.id].target);
      $(prefix + '-minus').disabled = saving || (module.id === editingId && draftTarget === 0);
      $(prefix + '-plus').disabled = saving || (module.id === editingId && draftTarget >= maximum);
      $(prefix + '-save').disabled = saving;
      $(prefix + '-error').classList.toggle('hidden',module.id !== editingId || !$(prefix + '-error').textContent);
    }
  }
  function open(id) {
    if (!modules.list.some(module => module.id === id)) return;
    editingId = id; draftTarget = settings()[id].target;
    const error = $('daily-' + id + '-error'); error.textContent = '';
    renderForm();
  }
  async function save(id) {
    if (saving || id !== editingId) return;
    saving = true; renderForm();
    try {
      const config = settings();
      config[id] = {enabled:draftTarget > 0,target:draftTarget};
      await storage.replaceEntries([[key,JSON.stringify(config)]]);
      render();
    } catch {
      const error = $('daily-' + id + '-error');
      error.textContent = '任务设置保存失败，请重试或检查浏览器存储权限。';
      error.classList.remove('hidden');
    } finally { saving = false; renderForm(); }
  }
  function backupEntries(backup) {
    if (backup.dailyTasks === undefined) return [];
    const value = backup.dailyTasks;
    if (!value || typeof value !== 'object' || Array.isArray(value) || modules.list.some(module => {
      const item = value[module.id];
      // Backups made before the singing module have no goal for this module.
      if (item === undefined && module.optionalGoal) return false;
      return !item || typeof item.enabled !== 'boolean' || !validTarget(item.target) || (item.enabled && item.target === 0);
    })) throw Error('每日任务设置不正确');
    const restored = normalize(value), current = settings();
    for (const module of modules.list) {
      if (module.optionalGoal && value[module.id] === undefined) restored[module.id] = current[module.id];
    }
    return [[key,JSON.stringify(restored)]];
  }
  function scheduleMidnight() {
    clearTimeout(midnightTimer);
    const now = new Date();
    const next = new Date(now.getFullYear(),now.getMonth(),now.getDate() + 1).getTime();
    midnightTimer = setTimeout(() => { render(); scheduleMidnight(); },Math.max(1,next - Date.now() + 20));
  }
  function init() {
    storage = root.IntervalPwaStorageAdapter;
    for (const module of modules.list) {
      const prefix = 'daily-' + module.id;
      for (const [suffix,step] of [['minus',-10],['plus',10]]) $(prefix + '-' + suffix).addEventListener('click',() => {
        if (editingId !== module.id || saving) return;
        draftTarget = Math.min(maximum,Math.max(0,draftTarget + step)); renderForm();
      });
      $(prefix + '-save').addEventListener('click',() => void save(module.id));
    }
    root.addEventListener('interval-trainer-storage-updated',event => {
      if (event.detail?.some(item => relevant.has(item))) render();
    });
    root.addEventListener('focus',() => { render(); scheduleMidnight(); });
    document.addEventListener?.('visibilitychange',() => { if (!document.hidden) { render(); scheduleMidnight(); } });
    render(); renderForm(); scheduleMidnight();
  }
  root.TonaloomDailyTasks = Object.freeze({open,render,progress,backup:settings,backupEntries});
  if (root.IntervalAppReady) init(); else root.addEventListener('interval-trainer-ready',init,{once:true});
})(window);
