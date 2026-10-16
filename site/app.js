(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const logic = window.IntervalLogic;
  const modules = window.TonaloomModules;
  const recordedLibrary = window.MELODIC_RECORDINGS;
  const lowChoices = [36, 48, 60, 72, 84];
  const highChoices = [48, 60, 72, 84, 96];
  const storage = await window.IntervalPwaStorage.initialize();
  window.addEventListener('interval-trainer-storage-error', e => {
    console.error(e.detail);
    toast('学习记录保存失败，请立即导出备份');
  });
  window.IntervalPwaStorageAdapter = storage;
  // Module-specific preferences share one IndexedDB key, but each module owns
  // its own values. Legacy v2.0 flat settings are copied into both modules once.
  const settingsKey = modules.settingsKey;
  const commonDefaults = { enabled: logic.INTERVALS.map(i => i.semitones), low: 48, high: 84, volume: 65, duration: 2, showAnswer: true, autoPlayNext: true, confirmAnswer: false };
  function normalizeProfile(saved, mode) {
    const raw = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    const defaults = mode === 'melodic'
      ? commonDefaults.enabled.filter(i => Boolean(recordedLibrary.intervals[String(i)]))
      : commonDefaults.enabled;
    const profile = { ...commonDefaults, enabled: defaults.slice(), mode };
    if (Array.isArray(raw.enabled)) {
      profile.enabled = [...new Set(raw.enabled)].filter(i => Number.isInteger(i) && defaults.includes(i));
    }
    // A legacy unison-only selection has no melodic recording. Restore usable
    // defaults before entering practice, where the settings button is available.
    if (!profile.enabled.length) profile.enabled = defaults.slice();
    if (lowChoices.includes(raw.low)) profile.low = raw.low;
    if (highChoices.includes(raw.high) && raw.high > profile.low) profile.high = raw.high;
    else if (profile.high <= profile.low) profile.high = Math.min(96, profile.low + 12);
    if (Number.isFinite(Number(raw.volume))) profile.volume = Math.min(100,Math.max(0,Number(raw.volume)));
    if (Number.isFinite(Number(raw.duration))) profile.duration = Math.min(4,Math.max(.8,Number(raw.duration)));
    for (const key of ['showAnswer','autoPlayNext','confirmAnswer']) {
      if (typeof raw[key] === 'boolean') profile[key] = raw[key];
    }
    return profile;
  }
  function normalizeSettings(raw) {
    const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const storedModules = obj.modules && typeof obj.modules === 'object' && !Array.isArray(obj.modules) ? obj.modules : null;
    const legacy = storedModules ? null : obj;
    const activeMode = (obj.activeModule || obj.mode) === 'melodic' ? 'melodic' : 'harmonic';
    return {
      schema: 2,
      activeModule: activeMode,
      modules: {
        harmonic: normalizeProfile(storedModules?.harmonic ?? legacy, 'harmonic'),
        melodic: normalizeProfile(storedModules?.melodic ?? legacy, 'melodic')
      }
    };
  }
  function loadSettings() {
    try { return normalizeSettings(JSON.parse(storage.getItem(settingsKey) || '{}')); }
    catch { return normalizeSettings({}); }
  }
  const savedSettings = loadSettings();
  const moduleSettings = savedSettings.modules;
  let activeMode = savedSettings.activeModule;
  let settings = moduleSettings[activeMode];
  const harmonicReview = window.IntervalReview.createReviewManager(storage);
  const melodicReview = window.IntervalReview.createReviewManager(storage, window.IntervalPwaStorage.MELODY_KEY, {directional:true});
  let review = activeMode === 'melodic' ? melodicReview : harmonicReview;
  const sessions = {harmonic:{questionNo:0,correct:0,answered:0},melodic:{questionNo:0,correct:0,answered:0}};
  const recordedInstruments = Object.keys(recordedLibrary.instruments);
  const timbreNames = recordedLibrary.instruments;
  let statsUi = null;
  let hintUsed = false;
  let firstPlayAt = null;
  const state = { current: null, previous: null, options: [], questionNo: 0, answered: 0, correct: 0, selected: null, submitted: false, revealed:false, hasPlayed: false, playingTimeout: null };
  const audio = window.TonaloomAudio.createChannel(settings.volume / 100 * .8);
  let toastTimeout = null;
  let currentScreen = 'home';
  let currentQuestionMode = null;
  for (const definition of modules.list.filter(module => module.hearing)) {
    const mode = definition.id, manager = mode === 'harmonic' ? harmonicReview : melodicReview;
    modules.register(mode, {
      enter:() => enterPractice(mode), isActive:() => currentScreen === 'practice' && activeMode === mode,
      openSettings:() => { syncSettingsForm(); $('settings-dialog').showModal(); },
      reviewManager:() => manager, enabled:() => moduleSettings[mode].enabled,
      backup:() => manager.snapshot(), clearHistory:() => manager.reset(),
      backupEntries:obj => {
        if (obj.version === 1 && mode !== 'harmonic') return [];
        const review = window.IntervalReview.normalizeStore(obj.version === 1 ? obj.review : obj[definition.backupField]);
        return [[definition.reviews[0].key, JSON.stringify(review)]];
      }
    });
  }

  // v2.2: prevent useless vertical drag/bounce when the entire practice fits.
  // On short screens, allow ordinary scrolling so no answer is ever clipped.
  let practiceScrollFrame = 0;
  function refreshPracticeScrolling() {
    if (currentScreen !== 'practice' || $('practice').classList.contains('hidden')) {
      document.documentElement.classList.remove('practice-scroll-locked');
      return;
    }
    const viewport = window.visualViewport;
    const bottomEdge = (viewport ? viewport.height + viewport.offsetTop : window.innerHeight);
    // Ignore decorative bottom padding. The actual controls must all be visible.
    const controlsBottom = $('practice').getBoundingClientRect().bottom + window.scrollY;
    const fits = controlsBottom + 8 <= bottomEdge;
    document.documentElement.classList.toggle('practice-scroll-locked', fits);
    if (fits && window.scrollY) window.scrollTo(0, 0);
  }
  function schedulePracticeScrollCheck() {
    if (practiceScrollFrame) return;
    practiceScrollFrame = requestAnimationFrame(() => {
      practiceScrollFrame = 0;
      refreshPracticeScrolling();
    });
  }
  function setupPracticeScrolling() {
    window.addEventListener('resize', schedulePracticeScrollCheck);
    window.addEventListener('orientationchange', schedulePracticeScrollCheck);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', schedulePracticeScrollCheck);
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(schedulePracticeScrollCheck);
      ro.observe($('practice'));
      ro.observe(document.querySelector('.app-shell'));
    }
    if (document.fonts?.ready) document.fonts.ready.then(schedulePracticeScrollCheck);
  }


  function persist() {
    try {
      storage.setItem(settingsKey, JSON.stringify({ schema: 2, activeModule: activeMode, modules: moduleSettings }));
    } catch (e) { toast('设置保存失败，请检查浏览器存储权限'); console.error(e); }
  }
  function syncSettingsForm() {
    $('settings-title').textContent = modules.get(settings.mode).name + '设置';
    $('note-low').value = String(settings.low);
    $('note-high').value = String(settings.high);
    $('volume').value = String(settings.volume);
    $('duration').value = String(settings.duration);
    $('volume-value').textContent = `${settings.volume}%`;
    $('duration-value').textContent = `${settings.duration.toFixed(1)} 秒`;
    $('show-answer').checked = settings.showAnswer;
    $('auto-play-next').checked = settings.autoPlayNext;
    $('confirm-answer').checked = settings.confirmAnswer;
    $('audio-range-section').classList.toggle('hidden', settings.mode === 'melodic');
    $('duration-label').classList.toggle('hidden', settings.mode === 'melodic');
    $('duration').classList.toggle('hidden', settings.mode === 'melodic');
    audio.setVolume(settings.volume / 100 * .8);
    drawToggles();
  }
  function syncHintButton() {
    const available = settings.mode === 'harmonic' && !!state.current && state.submitted && currentScreen === 'practice';
    $('hint').disabled = !available;
    $('hint').setAttribute('aria-disabled', String(!available));
  }
  function toast(message) {
    const elem = $('toast');
    elem.textContent = message;
    elem.classList.add('visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => elem.classList.remove('visible'), 2500);
  }
  function drawToggles() {
    const area = $('interval-toggles');
    area.replaceChildren();
    for (const item of logic.INTERVALS) {
      const melodicUnavailable = settings.mode === 'melodic' && !recordedLibrary.intervals[String(item.semitones)];
      const enabled = settings.enabled.includes(item.semitones) && !melodicUnavailable;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'interval-toggle' + (enabled ? ' active' : '');
      if (melodicUnavailable) continue;
      button.setAttribute('aria-pressed', String(enabled));
      button.textContent = item.name;
      button.addEventListener('click', () => {
        if (enabled) {
          if (settings.enabled.filter(x => settings.mode !== 'melodic' || recordedLibrary.intervals[String(x)]).length <= 1) { toast('至少需要选择一种可用音程'); return; }
          settings.enabled = settings.enabled.filter(x => x !== item.semitones);
        } else settings.enabled.push(item.semitones);
        persist(); drawToggles();
      });
      area.appendChild(button);
    }
    $('enabled-count').textContent = settings.mode === 'melodic'
      ? `已选 ${settings.enabled.filter(x => recordedLibrary.intervals[String(x)]).length} 种`
      : `已选 ${settings.enabled.length} 种`;
  }
  function setupSettings() {
    for (const midi of lowChoices) {
      const opt = document.createElement('option'); opt.value = String(midi); opt.textContent = `C${midi / 12 - 1}`; $('note-low').appendChild(opt);
    }
    for (const midi of highChoices) {
      const opt = document.createElement('option'); opt.value = String(midi); opt.textContent = `C${midi / 12 - 1}`; $('note-high').appendChild(opt);
    }
    $('note-low').value = String(settings.low);
    $('note-high').value = String(settings.high);
    for (const id of ['note-low', 'note-high']) {
      $(id).addEventListener('change', () => {
        settings.low = Number($('note-low').value);
        settings.high = Number($('note-high').value);
        if (settings.low >= settings.high) {
          if (id === 'note-low') settings.high = Math.min(96, settings.low + 12);
          else settings.low = Math.max(36, settings.high - 12);
          $('note-low').value = String(settings.low);
          $('note-high').value = String(settings.high);
          toast('已自动调整为有效音区');
        }
        persist();
      });
    }
    $('volume').value = String(settings.volume);
    $('duration').value = String(settings.duration);
    $('show-answer').checked = settings.showAnswer;
    $('auto-play-next').checked = settings.autoPlayNext;
    $('confirm-answer').checked = settings.confirmAnswer;
    const updateSliders = () => {
      $('volume-value').textContent = `${settings.volume}%`;
      $('duration-value').textContent = `${settings.duration.toFixed(1)} 秒`;
      audio.setVolume(settings.volume / 100 * .8);
    };
    $('volume').addEventListener('input', () => { settings.volume = Number($('volume').value); updateSliders(); persist(); });
    $('duration').addEventListener('input', () => { settings.duration = Number($('duration').value); updateSliders(); persist(); });
    $('show-answer').addEventListener('change', () => {
      settings.showAnswer = $('show-answer').checked; persist();
      if (state.submitted) renderFeedback();
    });
    $('auto-play-next').addEventListener('change', () => { settings.autoPlayNext = $('auto-play-next').checked; persist(); });
    $('confirm-answer').addEventListener('change', () => {
      settings.confirmAnswer = $('confirm-answer').checked; persist();
      if (!state.submitted) { renderAnswerCaption(); drawAnswerButtons(); }
    });
    $('reset-stats').addEventListener('click', () => {
      if (!window.confirm('确定清空成绩并从第一题重新开始吗？')) return;
      const sess=sessions[settings.mode];sess.questionNo=0;sess.correct=0;sess.answered=0; state.previous = null;
      if(currentScreen==='practice') newQuestion();
      else {state.current=null;currentQuestionMode=null;}
      $('settings-dialog').close(); toast('本次计数已清零，历史记录保留');
    });
    const dialog = $('settings-dialog');
    $('open-settings').addEventListener('click', () => {
      const active = modules.list.map(module => modules.get(module.id)).find(module => module.isActive?.());
      active?.openSettings();
    });
    $('close-settings').addEventListener('click', () => dialog.close());
    $('settings-done').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    setupStatsControls();
    syncSettingsForm();
  }
  function createBackup() {
    const backup = {format:'interval-trainer-backup', version:3, exportedAt:new Date().toISOString(),
      settings:JSON.parse(JSON.stringify({schema:2, activeModule:activeMode, modules:moduleSettings}))};
    for (const module of modules.list) backup[module.backupField] = modules.get(module.id).backup?.() || null;
    return JSON.stringify(backup, null, 2);
  }
  async function restoreBackup(data) {
    const obj = JSON.parse(data);
    if (!obj || obj.format !== 'interval-trainer-backup' ||
      ![1,2,3].includes(obj.version) || !obj.settings ||
      !(Array.isArray(obj.settings.enabled) ||
        (obj.settings.modules && Array.isArray(obj.settings.modules.harmonic?.enabled) && Array.isArray(obj.settings.modules.melodic?.enabled)))) throw Error('备份格式不正确');
    const selected = obj.settings.modules
      ? [...obj.settings.modules.harmonic.enabled, ...obj.settings.modules.melodic.enabled]
      : obj.settings.enabled;
    if (!selected.every(x => Number.isInteger(x) && x >= 0 && x <= 12)) throw Error('音程设置不正确');
    const restoredSettings = JSON.stringify(normalizeSettings(obj.settings));
    if (!storage.available) throw Error('当前浏览器无法保存学习记录');
    const keys = window.IntervalPwaStorage;
    const entries = [[keys.SETTINGS_KEY, restoredSettings]];
    for (const module of modules.list) entries.push(...modules.get(module.id).backupEntries(obj));
    // Validate and serialize every module before changing any stored or live data.
    await storage.replaceEntries(entries);
    window.location.reload();
  }
  window.acceptNativeBackup = async function (content) {
    if (!window.confirm('导入会覆盖本设备现有的复习记录和练习设置，确定继续吗？')) return;
    try { await restoreBackup(content); } catch (err) { toast(`导入失败：${err.message}`); }
  };
  function browserDownload(json) {
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `音程听辨备份-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function setupStatsControls() {
    const selected = () => modules.get(modules.statisticsMode);
    const statsDialog = $('stats-dialog');
    function renderStatistics() {
      for (const module of modules.list) {
        const active = module.id === modules.statisticsMode;
        $(module.statsId).classList.toggle('active', active);
        $(module.statsId).setAttribute('aria-pressed', String(active));
      }
      statsUi.render();
    }
    statsUi = window.IntervalStats.init((period,now) => {
      const module=selected();
      return module.statistics?module.statistics(period,now):
        window.IntervalStats.readReview(module.reviewManager(),module.enabled(),period,now);
    });
    modules.configureStatistics(activeMode, open => {
      renderStatistics();
      if (open) {
        storage.refresh?.().catch(() => {});
        if (!statsDialog.open) statsDialog.showModal();
      }
    });
    window.addEventListener('interval-trainer-storage-updated', () => {
      if (statsDialog.open) renderStatistics();
    });
    for (const module of modules.list) {
      $(module.statsId).addEventListener('click', () => modules.showStatistics(module.id));
    }
    $('open-stats').addEventListener('click', () => {
      $('settings-dialog').close();
      modules.showStatistics(settings.mode);
    });
    statsDialog.addEventListener('close', () => {
      if (modules.statisticsMode === 'sight') modules.showStatistics(settings.mode, false);
    });
    $('close-stats').addEventListener('click', () => statsDialog.close());
    statsDialog.addEventListener('click', e => { if(e.target === statsDialog) statsDialog.close(); });
    $('export-backup').addEventListener('click', async () => {
      // Include answers saved by other windows. If storage has failed, retain
      // the existing ability to export the in-memory record for recovery.
      try { await storage.refresh?.(); } catch {}
      browserDownload(createBackup());
    });
    $('import-backup').addEventListener('click', () => $('backup-file').click());
    $('backup-file').addEventListener('change', async e => {
      const file = e.target.files?.[0]; e.target.value = '';
      if(!file) return;
      try {
        // The app's own retained history can exceed 8 MB; validate its content
        // instead of rejecting a valid export solely because of its file size.
        await window.acceptNativeBackup(await file.text());
      } catch(err) { toast(`导入失败：${err.message}`); }
    });
    $('clear-review').addEventListener('click', () => {
      if(!window.confirm('永久清空当前统计类别的全部练习统计和复习记录？建议先导出备份。')) return;
      selected().clearHistory();
      renderStatistics();
      toast('当前类别历史记录已清空');
    });
  }
  function renderAnswerCaption() {
    $('submit-answer').classList.toggle('hidden', !settings.confirmAnswer || state.submitted);
    $('submit-answer').disabled = state.selected === null || state.submitted;
  }
  // Triple fourth/tritone/fifth row; the full-width rows remain the same width.
  const answerRows = [[0], [1, 2], [3, 4], [5, 6, 7], [8, 9], [10, 11], [12]];
  function drawAnswerButtons() {
    const area = $('answer-grid');
    area.replaceChildren();
    const available = new Map(state.options.map(interval => [interval.semitones, interval]));
    for (const group of answerRows) {
      const choices = group.map(semitones => available.get(semitones)).filter(Boolean);
      if (choices.length === 0) continue;
      const row = document.createElement('div');
      row.className = 'answer-row' + (choices.length===3 ? ' is-triple' : '');
      for (const interval of choices) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'answer-button';
      b.textContent = interval.name;
      b.dataset.answer = String(interval.semitones);
      const selected = state.selected === interval.semitones;
      b.setAttribute('aria-pressed', String(selected));
      if (state.submitted) {
        b.disabled = true;
        const correct = interval.semitones === state.current.semitones;
        if ((settings.showAnswer || state.revealed) && correct || (selected && correct)) b.classList.add('correct-answer');
        if (selected && !correct) b.classList.add('wrong-answer');
      } else {
        if (selected) b.classList.add('selected');
        b.addEventListener('click', () => {
          state.selected = interval.semitones;
          if (settings.confirmAnswer) { drawAnswerButtons(); renderAnswerCaption(); }
          else submitAnswer(false);
        });
      }
      row.appendChild(b);
      }
      area.appendChild(row);
    }
  }
  function updateStats() {
    const session=sessions[settings.mode];
    $('question-number').textContent = String(session.questionNo).padStart(2, '0');
    $('correct-number').textContent = String(session.correct);
    $('answered-number').textContent = String(session.answered);
    $('accuracy-number').textContent = session.answered ? `${Math.round(100 * session.correct / session.answered)}%` : '—';
  }
  function setAudioStatus(text) { $('audio-status').textContent = text; }
  function stopVoices() {
    audio.stop();
    if (state.playingTimeout) clearTimeout(state.playingTimeout);
    state.playingTimeout = null;
    document.body.classList.remove('playing');
  }
  function eligibleForCurrentMode() {
    if (settings.mode === 'melodic') {
      return settings.enabled.filter(semitones => Boolean(recordedLibrary.intervals[String(semitones)]));
    }
    return logic.eligibleIntervals(settings.enabled,settings.low,settings.high).map(i=>i.semitones);
  }
  function makeRecordedQuestion(semitones, direction) {
    const group = recordedLibrary.intervals[String(semitones)];
    if (!group) return null;
    const timbre = recordedInstruments[Math.floor(Math.random() * recordedInstruments.length)];
    const asset = group[direction][timbre];
    if (!asset) throw Error(`录音缺失：${semitones}/${direction}/${timbre}`);
    const interval = logic.INTERVALS[semitones];
    return {semitones, name: interval.name, direction: direction==='up'?1:-1, timbre,
      recordingUrl: asset, low: null, high: null};
  }
  function newQuestion() {
    const candidates=eligibleForCurrentMode();
    if(!candidates.length) {toast(settings.mode==='melodic' ? '请至少启用一种有录音的音程' : '音区过窄，无法生成当前音程');return false;}
    const chosen=settings.mode==='melodic'
      ? review.choose(candidates,state.previous ? `${state.previous.semitones}:${state.previous.direction===1?'up':'down'}` : null)
      : review.choose(candidates,state.previous?.semitones);
    const result=settings.mode==='melodic' ?
      makeRecordedQuestion(Number(chosen.split(':')[0]),chosen.split(':')[1]) :
      logic.makeQuestion([chosen],settings.low,settings.high,state.previous);
    if(!result) {toast('无法生成符合当前设置的音程');return false;}
    stopVoices();
    if(settings.mode!=='melodic') result.timbre='piano';
    state.current=result;state.previous=result;currentQuestionMode=settings.mode;
    sessions[settings.mode].questionNo++;
    state.selected=null;state.submitted=false;state.revealed=false;state.hasPlayed=false;
    hintUsed=false;firstPlayAt=null;
    state.options=logic.INTERVALS.filter(i=>candidates.includes(i.semitones));
    $('next-question').textContent='显示答案';
    $('next-question').classList.add('is-skip');$('play-label').textContent='播放';
    setAudioStatus('');renderAnswerCaption();drawAnswerButtons();updateStats();syncHintButton();
    return true;
  }
  function renderFeedback() {
    // Answer buttons provide the result feedback directly.
    drawAnswerButtons();
  }
  function submitAnswer(revealed = false) {
    if (state.submitted || !state.current || (!revealed && state.selected === null)) return;
    state.submitted = true;
    state.revealed = Boolean(revealed);
    if (state.revealed) state.selected = null;
    const session = sessions[settings.mode];
    session.answered++;
    if (!state.revealed && state.selected === state.current.semitones) session.correct++;
    review.record({ actual: state.current.semitones, chosen: state.selected,
      revealed: state.revealed, hinted: hintUsed,
      low: state.current.low, high: state.current.high,
      direction: settings.mode === 'melodic' ? state.current.direction : null,
      firstMode: settings.mode === 'melodic' ? 'user-recording' : null,
      timbre: settings.mode === 'melodic' ? state.current.timbre : null,
      responseMs: firstPlayAt === null ? null : Math.max(0, Date.now() - firstPlayAt) });
    if (!review.storageAvailable) toast('当前设备无法持久保存学习记录，请检查存储权限');
    renderFeedback(); updateStats(); renderAnswerCaption(); syncHintButton();
    $('next-question').innerHTML = '下一题 <span aria-hidden="true">→</span>';
    $('next-question').classList.remove('is-skip');
  }
  function advanceQuestion() {
    if (state.current && !state.submitted) {
      submitAnswer(true);
      return;
    }
    if (newQuestion() && settings.autoPlayNext) void play('main');
  }
  function scheduleTone(sample, at, duration, gainMultiplier) {
    audio.tone(sample,at,duration,gainMultiplier,
      {attack:.013,hold:Math.max(.014,duration-.17),floor:.0001,tail:.02});
  }
  async function play(kind) {
    if(!state.current)return;
    // The split-notes demonstration is available only after committing an answer.
    if (kind === 'hint' && (settings.mode !== 'harmonic' || !state.submitted)) return;
    stopVoices();const token=audio.token;
    try {
      const ctx=await audio.ready();
      const current=state.current;
      const melodic=settings.mode==='melodic';
      let total=0;
      if(melodic){
        // A supplied recording already contains both notes in the correct order.
        // Do not transpose, synthesize, or infer unprovided pitches.
        const buffer=await audio.recording(current.recordingUrl);
        if(token!==audio.token)return;
        audio.playRecording(buffer,ctx.currentTime+.06);
        total=buffer.duration;

      } else {
        const [first,second]=await Promise.all([audio.piano(current.low),audio.piano(current.high)]);
        if(token!==audio.token)return;
        const t=ctx.currentTime+.06;
        if(kind==='hint') {
          const duration=Math.min(1.25,Math.max(.65,settings.duration*.56)),gap=.14;
          scheduleTone(first,t,duration,.9);
          scheduleTone(second,t+duration+gap,duration,.9);
          total=duration*2+gap;hintUsed=true;
        } else {
          const gain=current.low===current.high?.54:.72;
          scheduleTone(first,t,settings.duration,gain);
          scheduleTone(second,t,settings.duration,gain);
          total=settings.duration;
        }
      }
      state.playingTimeout=setTimeout(()=>{if(token===audio.token){document.body.classList.remove('playing');setAudioStatus('');}},(total+.1)*1000);
      document.body.classList.add('playing');state.hasPlayed=true;
      if(firstPlayAt===null)firstPlayAt=Date.now();
      $('play-label').textContent='重听';
    } catch(err){
      if(token===audio.token){setAudioStatus('音频播放失败，请检查网络或浏览器音频支持');toast(`播放失败：${err.message}`);}
      console.error('Audio playback error:',err);
    }
  }
  function syncModeControls(){
    $('practice-mode-title').textContent = modules.get(settings.mode).name;
    $('hint').classList.toggle('hidden',settings.mode==='melodic');
    $('stats-title').textContent='练习统计';
    syncSettingsForm();
    syncHintButton();
  }
  function showHome(){
    for (const module of modules.list.map(item => modules.get(item.id))) {
      if (module.isActive?.()) module.leave?.();
    }
    // Leaving a module is navigation, not a wrong answer or a skipped question.
    if ($('settings-dialog').open) $('settings-dialog').close();
    stopVoices();
    currentScreen='home';
    document.body.classList.remove('module-active');
    document.documentElement.classList.remove('practice-scroll-locked');
    $('home-screen').classList.remove('hidden');
    $('open-settings').classList.add('hidden');
    $('practice-navigation').classList.add('hidden');
    $('practice').classList.add('hidden');
    syncModeControls();
  }
  function enterPractice(mode){
    const changed=activeMode!==mode;
    const created=changed || !state.current || currentQuestionMode!==mode;
    if(changed){
      activeMode=mode;
      settings=moduleSettings[mode];
      review=mode==='melodic'?melodicReview:harmonicReview;
      state.previous=null;
      persist();
    }
    // Do not start any audio or create a question before selecting a module.
    if (created && !newQuestion()) return;
    currentScreen='practice';
    document.body.classList.add('module-active');
    window.scrollTo(0, 0);
    $('home-screen').classList.add('hidden');
    $('open-settings').classList.remove('hidden');
    $('practice-navigation').classList.remove('hidden');
    $('practice').classList.remove('hidden');
    syncModeControls();
    refreshPracticeScrolling();
    // Returning to an unfinished question leaves the current answer and notes untouched.
    if(created && settings.autoPlayNext)
      void play('main');
  }
  function setupInteractions() {
    $('play-harmonic').addEventListener('click', () => play('main'));
    for (const module of modules.list) $(module.homeId).addEventListener('click',()=>modules.get(module.id).enter?.());
    $('back-home').addEventListener('click',showHome);
    // The existing statistics dialog is shared with the home screen.
    $('home-stats').addEventListener('click',()=> $('open-stats').click());
    syncModeControls();
    $('hint').addEventListener('click', () => play('hint'));
    $('submit-answer').addEventListener('click', () => submitAnswer(false));
    $('next-question').addEventListener('click', advanceQuestion);
  }
  function setupBackProtection() {
    // Installed PWA: reserve one same-URL history entry for Android system Back.
    // No local storage deletion; hardware Back from practice navigates HOME.
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || navigator.standalone === true;
    if (!standalone || !window.history?.pushState) return;
    const marker = {intervalTrainerGuard:true};
    let lastBack = 0;
    history.pushState(marker, '', location.href);
    window.addEventListener('popstate', () => {
      if ($('stats-dialog').open) {
        $('stats-dialog').close();
      } else if ($('settings-dialog').open) {
        $('settings-dialog').close();
      } else if (modules.list.some(module => modules.get(module.id).isActive?.())) {
        showHome();
        lastBack = Date.now();
        toast('再按一次返回退出');
      } else if (Date.now() - lastBack < 2200) {
        // Do not insert another guard. The next Back leaves the installed app.
        history.back();
        return;
      } else {
        lastBack = Date.now();
        toast('再按一次返回退出');
      }
      history.pushState(marker, '', location.href);
    });
  }
  setupSettings(); setupInteractions(); setupPracticeScrolling(); showHome(); setupBackProtection();
  // One-time, idempotent upgrade from the flat v2.0 settings format.
  try {
    const raw = JSON.parse(storage.getItem(settingsKey) || '{}');
    if (!raw.modules && storage.available) persist();
  } catch { /* invalid legacy settings already normalized in memory */ }
  if (!storage.available) {
    toast('当前浏览器无法保存练习数据。请使用 HTTPS 安装应用，或检查存储权限。');
  } else if (storage.migrated) {
    toast('已自动迁移旧版练习记录与设置');
  }
  window.IntervalAppReady = true;
  window.dispatchEvent(new Event('interval-trainer-ready'));
})();
