(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const logic = window.IntervalLogic;
  const lowChoices = [36, 48, 60, 72, 84];
  const highChoices = [48, 60, 72, 84, 96];
  const storage = await window.IntervalPwaStorage.initialize();
  window.addEventListener('interval-trainer-storage-error', e => {
    console.error(e.detail);
    toast('学习记录保存失败，请立即导出备份');
  });
  window.IntervalPwaStorageAdapter = storage;
  const defaults = { enabled: logic.INTERVALS.map(i => i.semitones), low: 48, high: 84, volume: 65, duration: 2, showAnswer: true, autoPlayNext: true, confirmAnswer: false, };
  function loadSettings() {
    try {
      const saved = JSON.parse(storage.getItem('interval-trainer-settings') || '{}');
      const value = Object.assign({}, defaults, saved);
      if (!Array.isArray(value.enabled)) value.enabled = defaults.enabled.slice();
      value.enabled = [...new Set(value.enabled)].filter(i => Number.isInteger(i) && i >= 0 && i <= 12);
      if (!value.enabled.length) value.enabled = defaults.enabled.slice();
      if (!lowChoices.includes(value.low)) value.low = defaults.low;
      if (!highChoices.includes(value.high) || value.high <= value.low) value.high = Math.min(96, value.low + 12);
      value.volume = Math.min(100, Math.max(0, Number(value.volume) || 0));
      value.duration = Math.min(4, Math.max(.8, Number(value.duration) || 2));
      value.showAnswer = Boolean(value.showAnswer);
      value.autoPlayNext = Boolean(value.autoPlayNext);
      value.confirmAnswer = Boolean(value.confirmAnswer);
      return value;
    } catch { return { ...defaults, enabled: defaults.enabled.slice() }; }
  }
  const settings = loadSettings();
  const review = window.IntervalReview.createReviewManager(storage);
  let statsUi = null;
  let hintUsed = false;
  let firstPlayAt = null;
  const state = { current: null, previous: null, options: [], questionNo: 0, answered: 0, correct: 0, selected: null, submitted: false, notesShown: false, hasPlayed: false, playToken: 0, playingTimeout: null };
  let audioCtx = null;
  let masterGain = null;
  const buffers = new Map();
  const loading = new Map();
  const activeVoices = new Set();
  let toastTimeout = null;

  function persist() {
    try { storage.setItem('interval-trainer-settings', JSON.stringify(settings)); }
    catch (e) { toast('设置保存失败，请检查浏览器存储权限'); console.error(e); }
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
      const enabled = settings.enabled.includes(item.semitones);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'interval-toggle' + (enabled ? ' active' : '');
      button.setAttribute('aria-pressed', String(enabled));
      button.textContent = item.name;
      button.addEventListener('click', () => {
        if (enabled) {
          if (settings.enabled.length === 1) { toast('至少需要选择一种音程'); return; }
          settings.enabled = settings.enabled.filter(x => x !== item.semitones);
        } else settings.enabled.push(item.semitones);
        persist(); drawToggles();
      });
      area.appendChild(button);
    }
    $('enabled-count').textContent = `已选 ${settings.enabled.length} 种`;
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
      if (masterGain && audioCtx) masterGain.gain.setTargetAtTime(settings.volume / 100 * .8, audioCtx.currentTime, .015);
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
    $('toggle-all').addEventListener('click', () => {
      settings.enabled = logic.INTERVALS.map(i => i.semitones); persist(); drawToggles();
    });
    $('preset-common').addEventListener('click', () => {
      settings.enabled = [3, 4, 7]; persist(); drawToggles();
    });
    $('reset-stats').addEventListener('click', () => {
      if (!window.confirm('确定清空成绩并从第一题重新开始吗？')) return;
      state.questionNo = 0; state.correct = 0; state.answered = 0; state.previous = null;
      newQuestion(); $('settings-dialog').close(); toast('本次计数已清零，历史记录保留');
    });
    const dialog = $('settings-dialog');
    $('open-settings').addEventListener('click', () => dialog.showModal());
    $('close-settings').addEventListener('click', () => dialog.close());
    $('settings-done').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    setupStatsControls();
    updateSliders(); drawToggles();
  }
  const intervalName = semi => logic.INTERVALS[semi]?.name || `音程 ${semi}`;
  function createBackup() {
    return JSON.stringify({ format: 'interval-trainer-backup', version: 1,
      exportedAt: new Date().toISOString(), settings: { ...settings }, review: review.snapshot() }, null, 2);
  }
  async function restoreBackup(data) {
    const obj = JSON.parse(data);
    if (!obj || obj.format !== 'interval-trainer-backup' || obj.version !== 1 ||
      !obj.review || !obj.settings || !Array.isArray(obj.settings.enabled)) throw Error('备份格式不正确');
    if (!obj.settings.enabled.every(x => Number.isInteger(x) && x >= 0 && x <= 12)) throw Error('音程设置不正确');
    if (!storage.available) throw Error('当前浏览器无法保存学习记录');
    // Both records are written in one IndexedDB transaction: either both commit or neither.
    const cleanReview = window.IntervalReview.normalizeStore(obj.review);
    await storage.replaceBoth(JSON.stringify(obj.settings), JSON.stringify(cleanReview));
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
    statsUi = window.IntervalStats.init(review, () => settings.enabled);
    const statsDialog = $('stats-dialog');
    $('open-stats').addEventListener('click', () => {
      $('settings-dialog').close();
      statsUi.render();
      statsDialog.showModal();
    });
    $('close-stats').addEventListener('click', () => statsDialog.close());
    statsDialog.addEventListener('click', e => { if(e.target === statsDialog) statsDialog.close(); });
    $('export-backup').addEventListener('click', () => browserDownload(createBackup()));
    $('import-backup').addEventListener('click', () => $('backup-file').click());
    $('backup-file').addEventListener('change', async e => {
      const file = e.target.files?.[0]; e.target.value = '';
      if(!file) return;
      try {
        if(file.size > 3 * 1024 * 1024) throw Error('备份超过 3 MB');
        window.acceptNativeBackup(await file.text());
      } catch(err) { toast(`导入失败：${err.message}`); }
    });
    $('clear-review').addEventListener('click', () => {
      if(!window.confirm('永久清空当前设备的全部练习统计和复习记录？建议先导出备份。')) return;
      review.reset();statsUi.render();toast('历史记录已清空');
    });
  }
  function renderAnswerCaption() {
    $('submit-answer').classList.toggle('hidden', !settings.confirmAnswer || state.submitted);
    $('submit-answer').disabled = state.selected === null || state.submitted;
  }
  function drawAnswerButtons() {
    const area = $('answer-grid');
    area.replaceChildren();
    for (const interval of state.options) {
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
        if ((settings.showAnswer && correct) || (selected && correct)) b.classList.add('correct-answer');
        if (selected && !correct) b.classList.add('wrong-answer');
      } else {
        if (selected) b.classList.add('selected');
        b.addEventListener('click', () => {
          state.selected = interval.semitones;
          if (settings.confirmAnswer) { drawAnswerButtons(); renderAnswerCaption(); }
          else submitAnswer();
        });
      }
      area.appendChild(b);
    }
  }
  function updateStats() {
    $('question-number').textContent = String(state.questionNo).padStart(2, '0');
    $('correct-number').textContent = String(state.correct);
    $('answered-number').textContent = String(state.answered);
    $('accuracy-number').textContent = state.answered ? `${Math.round(100 * state.correct / state.answered)}%` : '—';
  }
  function setAudioStatus(text) { $('audio-status').textContent = text; }
  function stopVoices() {
    state.playToken++;
    if (state.playingTimeout) clearTimeout(state.playingTimeout);
    state.playingTimeout = null;
    document.body.classList.remove('playing');
    for (const voice of [...activeVoices]) {
      try { voice.stop(); } catch { /* already ended */ }
    }
    activeVoices.clear();
  }
  function newQuestion() {
    const candidates = logic.eligibleIntervals(settings.enabled, settings.low, settings.high).map(i => i.semitones);
    if (!candidates.length) { toast('音区过窄，无法生成当前音程'); return false; }
    const chosen = review.choose(candidates, state.previous?.semitones);
    const result = logic.makeQuestion([chosen], settings.low, settings.high, state.previous);
    if (!result) { toast('音区过窄，无法生成当前音程'); return false; }
    stopVoices();
    state.current = result;
    state.previous = result;
    state.questionNo++;
    state.selected = null;
    state.submitted = false;
    state.notesShown = false;
    state.hasPlayed = false;
    hintUsed = false;
    firstPlayAt = null;
    state.options = logic.eligibleIntervals(settings.enabled, settings.low, settings.high);
    $('feedback').className = 'feedback hidden';
    $('feedback').textContent = '';
    $('notes-result').classList.add('hidden');
    $('notes-result').textContent = '';
    $('reveal-notes').classList.add('hidden');
    $('reveal-notes').textContent = '查看音名';
    $('reveal-notes').setAttribute('aria-expanded', 'false');
    $('next-question').innerHTML = '跳过 <span aria-hidden="true">→</span>';
    $('next-question').classList.add('is-skip');
    $('play-label').textContent = '播放';
    setAudioStatus('');
    renderAnswerCaption(); drawAnswerButtons(); updateStats();
    return true;
  }
  function renderFeedback() {
    const correct = state.selected === state.current.semitones;
    const el = $('feedback');
    el.className = 'feedback ' + (correct ? 'success' : 'error');
    const mark = correct ? '✓' : '✕';
    const result = correct ? '回答正确' : '回答错误';
    el.textContent = `${mark} ${result}${settings.showAnswer ? ` · ${correct ? state.current.name : `正确答案：${state.current.name}`}` : ''}`;
    drawAnswerButtons();
  }
  function submitAnswer() {
    if (state.submitted || state.selected === null || !state.current) return;
    state.submitted = true;
    state.answered++;
    if (state.selected === state.current.semitones) state.correct++;
    review.record({ actual: state.current.semitones, chosen: state.selected,
      hinted: hintUsed, low: state.current.low, high: state.current.high,
      responseMs: firstPlayAt === null ? null : Math.max(0, Date.now() - firstPlayAt) });
    if (!review.storageAvailable) toast('当前设备无法持久保存学习记录，请检查存储权限');
    renderFeedback(); updateStats(); renderAnswerCaption();
    $('reveal-notes').classList.remove('hidden');
    $('next-question').innerHTML = '下一题 <span aria-hidden="true">→</span>';
    $('next-question').classList.remove('is-skip');
  }
  function revealNotes() {
    if (!state.submitted || !state.current) return;
    state.notesShown = !state.notesShown;
    const el = $('notes-result');
    if (state.notesShown) {
      const [lo, hi] = state.current.notes;
      el.replaceChildren();
      el.append('低音 ');
      const lowStrong = document.createElement('strong'); lowStrong.textContent = lo;
      el.append(lowStrong, '  +  高音 ');
      const highStrong = document.createElement('strong'); highStrong.textContent = hi;
      el.append(highStrong, `  ·  相差 ${state.current.semitones} 个半音`);
      el.classList.remove('hidden');
      $('reveal-notes').textContent = '收起音名';
    } else {
      el.classList.add('hidden');
      $('reveal-notes').textContent = '查看音名';
    }
    $('reveal-notes').setAttribute('aria-expanded', String(state.notesShown));
  }
  function advanceQuestion() {
    if (state.current && !state.submitted) review.skip();
    if (newQuestion() && settings.autoPlayNext) void play('harmonic');
  }
  async function getAudioContext() {
    if (!window.AudioContext && !window.webkitAudioContext) throw Error('当前浏览器不支持 Web Audio');
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = settings.volume / 100 * .8;
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    return audioCtx;
  }
  async function loadSample(midi) {
    if (buffers.has(midi)) return buffers.get(midi);
    if (loading.has(midi)) return loading.get(midi);
    const sample = window.PIANO_SAMPLES && window.PIANO_SAMPLES[String(midi)];
    if (!sample) throw Error(`缺少音频采样：MIDI ${midi}`);
    const promise = (async () => {
      const binary = atob(sample);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const ctx = await getAudioContext();
      const audio = await ctx.decodeAudioData(bytes.buffer);
      buffers.set(midi, audio);
      return audio;
    })();
    loading.set(midi, promise);
    try { return await promise; } finally { loading.delete(midi); }
  }
  function scheduleTone(buffer, at, duration, gainMultiplier) {
    const voice = audioCtx.createBufferSource();
    voice.buffer = buffer;
    const envelope = audioCtx.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(gainMultiplier, at + .013);
    envelope.gain.setValueAtTime(gainMultiplier, at + Math.max(.014, duration - .17));
    envelope.gain.linearRampToValueAtTime(.0001, at + duration);
    voice.connect(envelope);
    envelope.connect(masterGain);
    voice.onended = () => { activeVoices.delete(voice); try { voice.disconnect(); envelope.disconnect(); } catch {} };
    activeVoices.add(voice);
    voice.start(at);
    voice.stop(at + duration + .02);
  }
  async function play(mode) {
    if (!state.current) return;
    stopVoices();
    const token = state.playToken;
    try {
      setAudioStatus('正在准备音源…');
      await getAudioContext();
      const current = state.current;
      const [lower, upper] = await Promise.all([loadSample(current.low), loadSample(current.high)]);
      if (token !== state.playToken) return;
      const t = audioCtx.currentTime + .06;
      if (mode === 'hint') {
        // 严格依次播放：低音结束后，经过短暂停顿再奏高音。
        const hintDur = Math.min(1.25, Math.max(.65, settings.duration * .56));
        const gap = .14;
        scheduleTone(lower, t, hintDur, .9);
        scheduleTone(upper, t + hintDur + gap, hintDur, .9);
        setAudioStatus('先低音，再高音');
        hintUsed = true;
        state.playingTimeout = setTimeout(() => { if (token === state.playToken) { document.body.classList.remove('playing'); setAudioStatus(''); } }, (hintDur * 2 + gap + .1) * 1000);
      } else {
        // 两个独立采样使用完全相同的 Web Audio 时刻，避免串行延迟。
        const gain = current.low === current.high ? .54 : .72;
        scheduleTone(lower, t, settings.duration, gain);
        scheduleTone(upper, t, settings.duration, gain);
        setAudioStatus('正在播放和声音程');
        state.playingTimeout = setTimeout(() => { if (token === state.playToken) { document.body.classList.remove('playing'); setAudioStatus(''); } }, (settings.duration + .1) * 1000);
      }
      document.body.classList.add('playing');
      state.hasPlayed = true;
      if(firstPlayAt === null) firstPlayAt = Date.now();
      $('play-label').textContent = '重听';
    } catch (err) {
      if (token === state.playToken) {
        setAudioStatus('音频播放失败，请检查浏览器');
        toast(`播放失败：${err.message}`);
      }
      console.error('Audio playback error:', err);
    }
  }
  function setupInteractions() {
    $('play-harmonic').addEventListener('click', () => play('harmonic'));
    $('hint').addEventListener('click', () => play('hint'));
    $('submit-answer').addEventListener('click', submitAnswer);
    $('reveal-notes').addEventListener('click', revealNotes);
    $('next-question').addEventListener('click', advanceQuestion);
    document.addEventListener('keydown', e => {
      if ($('settings-dialog').open || $('stats-dialog').open || e.ctrlKey || e.metaKey || e.altKey) return;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); void play('harmonic'); }
      else if (e.key.toLowerCase() === 'h') void play('hint');
      else if (e.key.toLowerCase() === 'n') advanceQuestion();
    });
  }
  setupSettings(); setupInteractions(); newQuestion();
  if (!storage.available) {
    toast('当前浏览器无法保存练习数据。请使用 HTTPS 安装应用，或检查存储权限。');
  } else if (storage.migrated) {
    toast('已自动迁移旧版练习记录与设置');
  }
  window.IntervalAppReady = true;
})();
