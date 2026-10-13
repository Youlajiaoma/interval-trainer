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
  const defaults = { enabled: logic.INTERVALS.map(i => i.semitones), low: 48, high: 84, volume: 65, duration: 2, showAnswer: true, autoPlayNext: true, confirmAnswer: false, mode: 'harmonic', };
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
      value.mode = value.mode === 'melodic' ? 'melodic' : 'harmonic';
      delete value.melodicFirst; // discard obsolete v1.7/v1.8 submode setting
      return value;
    } catch { return { ...defaults, enabled: defaults.enabled.slice() }; }
  }
  const settings = loadSettings();
  const harmonicReview = window.IntervalReview.createReviewManager(storage);
  const melodicReview = window.IntervalReview.createReviewManager(storage, window.IntervalPwaStorage.MELODY_KEY);
  let review = settings.mode === 'melodic' ? melodicReview : harmonicReview;
  let statisticsMode = settings.mode;
  const sessions = {harmonic:{questionNo:0,correct:0,answered:0},melodic:{questionNo:0,correct:0,answered:0}};
  const recordedLibrary = window.MELODIC_RECORDINGS;
  const recordedInstruments = Object.keys(recordedLibrary.instruments);
  const timbreNames = recordedLibrary.instruments;
  let statsUi = null;
  let hintUsed = false;
  let firstPlayAt = null;
  const state = { current: null, previous: null, options: [], questionNo: 0, answered: 0, correct: 0, selected: null, submitted: false, notesShown: false, hasPlayed: false, playToken: 0, playingTimeout: null };
  let audioCtx = null;
  let masterGain = null;
  const buffers = new Map();
  const loading = new Map();
  const activeVoices = new Set();
  const recordingBuffers = new Map();
  const recordingLoading = new Map();
  let toastTimeout = null;
  let currentScreen = 'home';
  let currentQuestionMode = null;

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
      const melodicUnavailable = settings.mode === 'melodic' && !recordedLibrary.intervals[String(item.semitones)];
      const enabled = settings.enabled.includes(item.semitones) && !melodicUnavailable;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'interval-toggle' + (enabled ? ' active' : '');
      if (melodicUnavailable) { button.disabled = true; button.title = '提供的录音中没有纯一度'; }
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
      ? `已选 ${settings.enabled.filter(x => recordedLibrary.intervals[String(x)]).length} 种（缺少纯一度音源）`
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
      const sess=sessions[settings.mode];sess.questionNo=0;sess.correct=0;sess.answered=0; state.previous = null;
      if(currentScreen==='practice') newQuestion();
      else {state.current=null;currentQuestionMode=null;}
      $('settings-dialog').close(); toast('本次计数已清零，历史记录保留');
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
    return JSON.stringify({ format: 'interval-trainer-backup', version: 2,
      exportedAt: new Date().toISOString(), settings: { ...settings },
      harmonic: harmonicReview.snapshot(), melodic: melodicReview.snapshot() }, null, 2);
  }
  async function restoreBackup(data) {
    const obj = JSON.parse(data);
    if (!obj || obj.format !== 'interval-trainer-backup' ||
      ![1,2].includes(obj.version) || !obj.settings || !Array.isArray(obj.settings.enabled)) throw Error('备份格式不正确');
    if (!obj.settings.enabled.every(x => Number.isInteger(x) && x >= 0 && x <= 12)) throw Error('音程设置不正确');
    if (!storage.available) throw Error('当前浏览器无法保存学习记录');
    if (obj.version === 1) {
      // v1.5/1.6 legacy backup affects harmonic history only; preserve melodic history.
      const harmonic = window.IntervalReview.normalizeStore(obj.review);
      await storage.replaceBoth(JSON.stringify(obj.settings), JSON.stringify(harmonic));
    } else {
      const harmonic = window.IntervalReview.normalizeStore(obj.harmonic);
      const melodic = window.IntervalReview.normalizeStore(obj.melodic);
      await storage.replaceAll(JSON.stringify(obj.settings), JSON.stringify(harmonic), JSON.stringify(melodic));
    }
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
    statsUi = window.IntervalStats.init(() => statisticsMode === 'melodic' ? melodicReview : harmonicReview, () => settings.enabled);
    const statsDialog = $('stats-dialog');
    for (const mode of ['harmonic','melodic']) {
      $('stats-'+mode).addEventListener('click', () => {
        statisticsMode=mode;syncStatisticsMode();statsUi.render();
      });
    }
    function syncStatisticsMode(){
      for(const mode of ['harmonic','melodic']) {
        const active=statisticsMode===mode;
        $('stats-'+mode).classList.toggle('active',active);
        $('stats-'+mode).setAttribute('aria-pressed',String(active));
      }
    }
    $('open-stats').addEventListener('click', () => {
      $('settings-dialog').close();
      statisticsMode=settings.mode;syncStatisticsMode();
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
        if(file.size > 8 * 1024 * 1024) throw Error('备份超过 8 MB');
        window.acceptNativeBackup(await file.text());
      } catch(err) { toast(`导入失败：${err.message}`); }
    });
    $('clear-review').addEventListener('click', () => {
      if(!window.confirm('永久清空当前统计类别的全部练习统计和复习记录？建议先导出备份。')) return;
      (statisticsMode === 'melodic' ? melodicReview : harmonicReview).reset();statsUi.render();toast('当前类别历史记录已清空');
    });
  }
  function renderAnswerCaption() {
    $('submit-answer').classList.toggle('hidden', !settings.confirmAnswer || state.submitted);
    $('submit-answer').disabled = state.selected === null || state.submitted;
  }
  // Group answers by musical interval family. Single-button rows span the
  // same full width as both buttons in any pair (including the inter-button gap).
  // The tritone remains available as an extra final row, without changing the
  // seven rows explicitly requested for the other twelve intervals.
  const answerRows = [[0], [1, 2], [3, 4], [5, 7], [8, 9], [10, 11], [12], [6]];
  function drawAnswerButtons() {
    const area = $('answer-grid');
    area.replaceChildren();
    const available = new Map(state.options.map(interval => [interval.semitones, interval]));
    for (const group of answerRows) {
      const choices = group.map(semitones => available.get(semitones)).filter(Boolean);
      if (choices.length === 0) continue;
      const row = document.createElement('div');
      row.className = 'answer-row';
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
    state.playToken++;
    if (state.playingTimeout) clearTimeout(state.playingTimeout);
    state.playingTimeout = null;
    document.body.classList.remove('playing');
    for (const voice of [...activeVoices]) {
      try { voice.stop(); } catch { /* already ended */ }
    }
    activeVoices.clear();
  }
  function eligibleForCurrentMode() {
    if (settings.mode === 'melodic') {
      return settings.enabled.filter(semitones => Boolean(recordedLibrary.intervals[String(semitones)]));
    }
    return logic.eligibleIntervals(settings.enabled,settings.low,settings.high).map(i=>i.semitones);
  }
  function makeRecordedQuestion(semitones) {
    const group = recordedLibrary.intervals[String(semitones)];
    if (!group) return null;
    const direction = Math.random() < .5 ? 'up' : 'down';
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
    const chosen=review.choose(candidates,state.previous?.semitones);
    const result=settings.mode==='melodic' ?
      makeRecordedQuestion(chosen) :
      logic.makeQuestion([chosen],settings.low,settings.high,state.previous);
    if(!result) {toast('无法生成符合当前设置的音程');return false;}
    stopVoices();
    if(settings.mode!=='melodic') result.timbre='piano';
    state.current=result;state.previous=result;currentQuestionMode=settings.mode;
    sessions[settings.mode].questionNo++;
    state.selected=null;state.submitted=false;state.notesShown=false;state.hasPlayed=false;
    hintUsed=false;firstPlayAt=null;
    state.options=logic.INTERVALS.filter(i=>candidates.includes(i.semitones));
    $('feedback').className='feedback hidden';$('feedback').textContent='';
    $('notes-result').classList.add('hidden');$('notes-result').textContent='';
    $('reveal-notes').classList.add('hidden');$('reveal-notes').textContent=settings.mode==='melodic'?'查看本题信息':'查看音名';
    $('reveal-notes').setAttribute('aria-expanded','false');
    $('next-question').innerHTML='跳过 <span aria-hidden="true">→</span>';
    $('next-question').classList.add('is-skip');$('play-label').textContent='播放';
    setAudioStatus('');renderAnswerCaption();drawAnswerButtons();updateStats();
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
    sessions[settings.mode].answered++;
    if (state.selected === state.current.semitones) sessions[settings.mode].correct++;
    review.record({ actual: state.current.semitones, chosen: state.selected,
      hinted: hintUsed, low: state.current.low, high: state.current.high,
      direction: settings.mode === 'melodic' ? state.current.direction : null,
      firstMode: settings.mode === 'melodic' ? 'user-recording' : null,
      timbre: settings.mode === 'melodic' ? state.current.timbre : null,
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
      el.replaceChildren();
      if (settings.mode === 'melodic') {
        // These user-supplied complete recordings have no reliable note-name metadata.
        el.textContent = `本题录音：${state.current.direction===1?'上行':'下行'} · ${timbreNames[state.current.timbre]} · ${state.current.name}。原始音源未标注两个音的具体音名。`;
      } else {
        const [lo, hi] = state.current.notes;
        el.append('低音 ');
        const lowStrong = document.createElement('strong'); lowStrong.textContent = lo;
        el.append(lowStrong, '  +  高音 ');
        const highStrong = document.createElement('strong'); highStrong.textContent = hi;
        el.append(highStrong, `  ·  相差 ${state.current.semitones} 个半音`);
      }
      el.classList.remove('hidden');
      $('reveal-notes').textContent = '收起本题信息';
    } else {
      el.classList.add('hidden');
      $('reveal-notes').textContent = settings.mode==='melodic'?'查看本题信息':'查看音名';
    }
    $('reveal-notes').setAttribute('aria-expanded', String(state.notesShown));
  }
  function advanceQuestion() {
    if (state.current && !state.submitted) review.skip();
    if (newQuestion() && settings.autoPlayNext) void play('main');
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
  async function loadSample(timbre, midi) {
    const anchor=timbre==='piano' ? midi : 36+Math.round((midi-36)/3)*3;
    const key=`${timbre}:${anchor}`;
    if(buffers.has(key)) return {buffer:buffers.get(key),rate:Math.pow(2,(midi-anchor)/12)};
    if(!loading.has(key)) {
      const source=timbre==='piano' ? window.PIANO_SAMPLES : window.MELODY_SAMPLES?.[timbre];
      const sample=source?.[String(anchor)];
      if(!sample) throw Error(`缺少音频采样：${key}`);
      loading.set(key,(async()=>{
        const binary=atob(sample),bytes=new Uint8Array(binary.length);
        for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
        const ctx=await getAudioContext();
        return await ctx.decodeAudioData(bytes.buffer);
      })());
    }
    try {
      const buffer=await loading.get(key);buffers.set(key,buffer);
      return {buffer,rate:Math.pow(2,(midi-anchor)/12)};
    } finally {loading.delete(key);}
  }
  function scheduleTone(sample, at, duration, gainMultiplier) {
    const voice=audioCtx.createBufferSource();voice.buffer=sample.buffer;
    voice.playbackRate.setValueAtTime(sample.rate,at);
    const envelope=audioCtx.createGain();
    envelope.gain.setValueAtTime(0,at);
    envelope.gain.linearRampToValueAtTime(gainMultiplier,at+.013);
    envelope.gain.setValueAtTime(gainMultiplier,at+Math.max(.014,duration-.17));
    envelope.gain.linearRampToValueAtTime(.0001,at+duration);
    voice.connect(envelope);envelope.connect(masterGain);
    voice.onended=()=>{activeVoices.delete(voice);try{voice.disconnect();envelope.disconnect();}catch{}};
    activeVoices.add(voice);voice.start(at);voice.stop(at+duration+.02);
  }
  async function loadRecording(url) {
    if (recordingBuffers.has(url)) return recordingBuffers.get(url);
    if (!recordingLoading.has(url)) recordingLoading.set(url, (async () => {
      const response = await fetch(new URL(url, document.baseURI));
      if (!response.ok) throw Error(`音源下载失败（${response.status}）`);
      const bytes = await response.arrayBuffer();
      const ctx = await getAudioContext();
      return await ctx.decodeAudioData(bytes);
    })());
    try {
      const buffer = await recordingLoading.get(url);
      recordingBuffers.set(url,buffer);
      return buffer;
    } finally { recordingLoading.delete(url); }
  }
  function scheduleRecording(buffer, at) {
    const voice=audioCtx.createBufferSource();voice.buffer=buffer;
    const gain=audioCtx.createGain();gain.gain.value=3;
    voice.connect(gain);gain.connect(masterGain);
    voice.onended=()=>{activeVoices.delete(voice);try{voice.disconnect();gain.disconnect();}catch{}};
    activeVoices.add(voice);
    voice.start(at);voice.stop(at+buffer.duration);
  }
  async function play(kind) {
    if(!state.current)return;
    stopVoices();const token=state.playToken;
    try {
      setAudioStatus('正在准备音源…');await getAudioContext();
      const current=state.current;
      const melodic=settings.mode==='melodic';
      let total=0;
      if(melodic){
        // A supplied recording already contains both notes in the correct order.
        // Do not transpose, synthesize, or infer unprovided pitches.
        const buffer=await loadRecording(current.recordingUrl);
        if(token!==state.playToken)return;
        scheduleRecording(buffer,audioCtx.currentTime+.06);
        total=buffer.duration;
        setAudioStatus('正在播放原始旋律录音');
        if(kind==='hint')hintUsed=true;
      } else {
        const [first,second]=await Promise.all([loadSample('piano',current.low),loadSample('piano',current.high)]);
        if(token!==state.playToken)return;
        const t=audioCtx.currentTime+.06;
        if(kind==='hint') {
          const duration=Math.min(1.25,Math.max(.65,settings.duration*.56)),gap=.14;
          scheduleTone(first,t,duration,.9);
          scheduleTone(second,t+duration+gap,duration,.9);
          total=duration*2+gap;setAudioStatus('先低音，再高音');hintUsed=true;
        } else {
          const gain=current.low===current.high?.54:.72;
          scheduleTone(first,t,settings.duration,gain);
          scheduleTone(second,t,settings.duration,gain);
          total=settings.duration;setAudioStatus('正在播放和声音程');
        }
      }
      state.playingTimeout=setTimeout(()=>{if(token===state.playToken){document.body.classList.remove('playing');setAudioStatus('');}},(total+.1)*1000);
      document.body.classList.add('playing');state.hasPlayed=true;
      if(firstPlayAt===null)firstPlayAt=Date.now();
      $('play-label').textContent='重听';
    } catch(err){
      if(token===state.playToken){setAudioStatus('音频播放失败，请检查网络或浏览器音频支持');toast(`播放失败：${err.message}`);}
      console.error('Audio playback error:',err);
    }
  }
  function syncModeControls(){
    $('practice-mode-title').textContent = settings.mode==='melodic'?'旋律音程':'和声音程';
    $('hint').classList.toggle('hidden',settings.mode==='melodic');
    $('audio-range-section').classList.toggle('hidden',settings.mode==='melodic');
    $('duration-label').classList.toggle('hidden',settings.mode==='melodic');
    $('duration').classList.toggle('hidden',settings.mode==='melodic');
    $('stats-title').textContent='练习统计';
    drawToggles();
  }
  function showHome(){
    // Leaving a module is navigation, not a wrong answer or a skipped question.
    stopVoices();
    currentScreen='home';
    $('home-screen').classList.remove('hidden');
    $('practice-navigation').classList.add('hidden');
    $('practice').classList.add('hidden');
    syncModeControls();
  }
  function enterPractice(mode){
    const changed=settings.mode!==mode;
    const created=changed || !state.current || currentQuestionMode!==mode;
    if(changed){
      settings.mode=mode;
      review=mode==='melodic'?melodicReview:harmonicReview;
      state.previous=null;
      persist();
    }
    // Do not start any audio or create a question before selecting a module.
    if (created && !newQuestion()) return;
    currentScreen='practice';
    $('home-screen').classList.add('hidden');
    $('practice-navigation').classList.remove('hidden');
    $('practice').classList.remove('hidden');
    syncModeControls();
    // Returning to an unfinished question leaves the current answer and notes untouched.
    if(created && settings.autoPlayNext)
      void play('main');
  }
  function setupInteractions() {
    $('play-harmonic').addEventListener('click', () => play('main'));
    $('home-harmonic').addEventListener('click',()=>enterPractice('harmonic'));
    $('home-melodic').addEventListener('click',()=>enterPractice('melodic'));
    $('back-home').addEventListener('click',showHome);
    // The existing statistics dialog is shared with the home screen.
    $('home-stats').addEventListener('click',()=> $('open-stats').click());
    syncModeControls();
    $('hint').addEventListener('click', () => play('hint'));
    $('submit-answer').addEventListener('click', submitAnswer);
    $('reveal-notes').addEventListener('click', revealNotes);
    $('next-question').addEventListener('click', advanceQuestion);
  }
  setupSettings(); setupInteractions(); showHome();
  if (!storage.available) {
    toast('当前浏览器无法保存练习数据。请使用 HTTPS 安装应用，或检查存储权限。');
  } else if (storage.migrated) {
    toast('已自动迁移旧版练习记录与设置');
  }
  window.IntervalAppReady = true;
})();
