/* Daily goals reuse the existing per-day answer totals; no separate counter. */
(function (root) {
  'use strict';
  const modules = root.TonaloomModules, key = modules.dailyTasksKey;
  const $ = id => document.getElementById(id), maximum = Math.floor(Number.MAX_SAFE_INTEGER/10)*10;
  const relevant = new Set([key,...modules.reviewDefinitions.map(item => item.key)]), counts = new Map();
  let storage, draft, saving = false, midnightTimer;
  function validTarget(value) { return Number.isSafeInteger(value) && value >= 10 && value <= maximum && value%10 === 0; }
  function normalize(value) {
    return Object.fromEntries(modules.list.map(module => {
      const item = value?.[module.id];
      return [module.id,{enabled:item?.enabled === true,target:validTarget(item?.target) ? item.target : 20}];
    }));
  }
  function settings() {
    try { return normalize(JSON.parse((storage || root.IntervalPwaStorageAdapter)?.getItem(key)||'null')); }
    catch { return normalize(null); }
  }
  function answered(module, now) {
    const today = root.IntervalReview.dayKey(now);
    return module.reviews.reduce((total,item) => {
      const saved = storage?.getItem(item.key), previous = counts.get(item.key);
      if (previous && previous.saved === saved && previous.day === today) return total+previous.count;
      let count = 0;
      try {
        const value = JSON.parse(saved||'null')?.daily?.[today]?.answered;
        if (Number.isSafeInteger(value) && value >= 0) count = value;
      } catch { /* Existing record recovery handles invalid saved data. */ }
      counts.set(item.key,{saved,day:today,count});
      return total+count;
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
      const item = progress(module.id,Date.now(),config), marker = $(module.homeId+'-marker');
      marker.textContent = item.complete ? '✓' : '→';
      marker.classList.toggle('daily-complete',item.complete);
      $(module.homeId).setAttribute('aria-label',module.name+(item.enabled ? '，'+description(item) : ''));
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
      const prefix = 'daily-'+module.id, item = draft[module.id];
      $(prefix+'-enabled').checked = item.enabled;
      $(prefix+'-enabled').disabled = saving;
      const quantity = $(prefix+'-quantity'), wasHidden = quantity.classList.contains('hidden');
      quantity.classList.toggle('hidden',!item.enabled);
      if (wasHidden && item.enabled) root.TonaloomMotion.reveal(quantity);
      $(prefix+'-target').textContent = String(item.target);
      $(prefix+'-minus').disabled = saving || item.target <= 10;
      $(prefix+'-plus').disabled = saving || item.target >= maximum;
    }
    $('daily-tasks-save').disabled = saving;
  }
  function open() {
    draft = settings();
    $('daily-tasks-error').textContent = ''; $('daily-tasks-error').classList.add('hidden');
    renderForm(); root.TonaloomMotion.open($('daily-tasks-dialog'));
  }
  async function save() {
    if (saving) return;
    saving = true; renderForm();
    try {
      await storage.replaceEntries([[key,JSON.stringify(draft)]]);
      render(); root.TonaloomMotion.close($('daily-tasks-dialog'));
    } catch {
      $('daily-tasks-error').textContent = '任务设置保存失败，请重试或检查浏览器存储权限。';
      $('daily-tasks-error').classList.remove('hidden');
    } finally { saving = false; renderForm(); }
  }
  function backupEntries(backup) {
    if (backup.dailyTasks === undefined) return [];
    const value = backup.dailyTasks;
    if (!value || typeof value !== 'object' || Array.isArray(value) || modules.list.some(module => {
      const item = value[module.id];
      // Backups made before the singing module have no goal for this module.
      if (item === undefined && module.optionalGoal) return false;
      return !item || typeof item.enabled !== 'boolean' || !validTarget(item.target);
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
    const next = new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).getTime();
    midnightTimer = setTimeout(() => { render(); scheduleMidnight(); },Math.max(1,next-Date.now()+20));
  }
  function init() {
    storage = root.IntervalPwaStorageAdapter;
    for (const module of modules.list) {
      const prefix = 'daily-'+module.id;
      $(prefix+'-enabled').addEventListener('change',event => {
        draft[module.id].enabled = event.target.checked; renderForm();
      });
      for (const [suffix,step] of [['minus',-10],['plus',10]]) $(prefix+'-'+suffix).addEventListener('click',() => {
        draft[module.id].target = Math.min(maximum,Math.max(10,draft[module.id].target+step)); renderForm();
      });
    }
    $('home-daily-tasks').addEventListener('click',open);
    $('daily-tasks-close').addEventListener('click',() => root.TonaloomMotion.close($('daily-tasks-dialog')));
    $('daily-tasks-dialog').addEventListener('click',event => { if (event.target === $('daily-tasks-dialog')) root.TonaloomMotion.close(event.target); });
    $('daily-tasks-save').addEventListener('click',save);
    root.addEventListener('interval-trainer-storage-updated',event => {
      if (event.detail?.some(item => relevant.has(item))) render();
    });
    root.addEventListener('focus',() => { render(); scheduleMidnight(); });
    document.addEventListener?.('visibilitychange',() => { if (!document.hidden) { render(); scheduleMidnight(); } });
    render(); scheduleMidnight();
  }
  root.TonaloomDailyTasks = Object.freeze({render,progress,backup:settings,backupEntries});
  if (root.IntervalAppReady) init(); else root.addEventListener('interval-trainer-ready',init,{once:true});
})(window);
