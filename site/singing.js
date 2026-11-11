/* Single-note imitation. Microphone samples stay in memory on this device. */
(function (root) {
  'use strict';
  const $ = id => document.getElementById(id), modules = root.TonaloomModules;
  const definition = modules.get('singing'), pitch = root.TonaloomPitch;
  const audio = root.TonaloomAudio.createChannel(.52), defaults = {low:48, high:72, volume:65};
  const store = () => root.IntervalPwaStorageAdapter;
  let initialized = false, active = false, settings = {...defaults}, review;
  let target = null, correct = false, completed = false, hasPlayed = false, loadingAudio = false, guardUntil = Infinity;
  let stream = null, context = null, source = null, analyser = null, mutedOutput = null;
  let micRequest = 0, requesting = false, listening = false, micProblem = false;
  let frame = 0, referenceTimer = null, samples, detect, judge, tracker;
  let points = [], origin = 0, plotTime = 0, lastFrame = -Infinity, center = 60;
  const now = () => root.performance?.now() ?? Date.now();
  function normalize(value) {
    const result = {...defaults};
    if (Number.isInteger(value?.low) && value.low >= 36 && value.low <= 84) result.low = value.low;
    if (Number.isInteger(value?.high) && value.high >= result.low && value.high <= 84) result.high = value.high;
    if (result.high < result.low) result.high = result.low;
    if (Number.isFinite(value?.volume)) result.volume = Math.max(0, Math.min(100, value.volume));
    return result;
  }
  function error(message = '') {
    $('singing-error').textContent = message;
    $('singing-error').classList.toggle('hidden', !message);
  }
  function save() { store().setItem(definition.settingsKey, JSON.stringify(settings)); }
  function resetJudge() { judge = pitch.createJudge(target); tracker = pitch.createTracker(); }
  function stopReference() {
    audio.stop(); loadingAudio = false; hasPlayed = false; guardUntil = Infinity;
    clearTimeout(referenceTimer); referenceTimer = null;
    resetJudge();
  }
  function renderStatus() {
    const status = $('singing-status');
    status.classList.toggle('singing-success', correct);
    const waiting = hasPlayed && context && context.currentTime < guardUntil;
    const message = correct ? '✓ 正确' : listening ? '可以模唱' : loadingAudio ? '加载钢琴' : waiting ? '钢琴播放中' :
      requesting ? '等待麦克风授权' : micProblem ? '麦克风未开启' : '点击播放开始';
    if (status.textContent !== message) status.textContent = message;
    $('singing-listener').setAttribute('data-state', correct ? 'correct' : listening ? 'listening' : 'idle');
    $('singing-play').textContent = hasPlayed ? '重播钢琴' : '播放钢琴';
  }
  function drawChart(time = plotTime || now()) {
    if (!active) return;
    const svg = $('singing-chart'), width = Math.max(250, svg.clientWidth || 500);
    const height = svg.clientHeight || 350, left = 40, right = width - 12, top = 26, bottom = height - 17;
    const elapsed = origin ? Math.max(0, (time - origin) / 1000) : 0;
    const end = Math.max(10, elapsed), start = end - 10;
    const minimum = Math.floor(center - 12), maximum = minimum + 24;
    const x = second => left + (second - start) / 10 * (right - left);
    const y = note => bottom - (note - minimum) / (maximum - minimum) * (bottom - top);
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    function element(tag, attributes, text) {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [key,value] of Object.entries(attributes)) node.setAttribute(key, String(value));
      if (text !== undefined) node.textContent = text;
      group.appendChild(node); return node;
    }
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    for (let note = minimum; note <= maximum; note++) {
      const isTarget = (note - target) % 12 === 0, natural = !pitch.noteName(note).includes('♯');
      element('line', {x1:left, x2:right, y1:y(note), y2:y(note), stroke:isTarget ? '#9e8bcc' : '#28313d',
        'stroke-opacity':isTarget ? .8 : natural ? .65 : .3, 'stroke-dasharray':isTarget ? '5 4' : 'none'});
      if (natural || isTarget) element('text', {x:left - 7, y:y(note) + 3, 'text-anchor':'end',
        class:isTarget ? 'singing-target-label' : ''}, pitch.noteName(note));
    }
    const timeStep = width < 400 ? 2 : 1;
    for (let second = Math.ceil(start / timeStep) * timeStep; second <= end; second += timeStep) {
      element('line', {x1:x(second), x2:x(second), y1:top, y2:bottom, stroke:'#28313d', 'stroke-opacity':.6});
      element('text', {x:x(second), y:15, 'text-anchor':'middle'}, `${second}s`);
    }
    let path = '', previous = null;
    for (const point of points) {
      if (point.second < start || point.second > end || point.note === null) { previous = null; continue; }
      path += `${previous && point.second - previous.second <= .16 && Math.abs(point.note - previous.note) <= 3 ? 'L' : 'M'}${x(point.second).toFixed(1)},${y(point.note).toFixed(1)} `;
      previous = point;
    }
    const clip = element('clipPath', {id:'singing-chart-clip'});
    const rectangle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    for (const [key,value] of Object.entries({x:left,y:top,width:right-left,height:bottom-top})) rectangle.setAttribute(key, String(value));
    clip.appendChild(rectangle);
    element('path', {d:path.trim(), fill:'none', stroke:'#6deb9a', 'stroke-width':2.3, 'clip-path':'url(#singing-chart-clip)',
      'stroke-linecap':'round', 'stroke-linejoin':'round', class:'singing-trace'});
    if (listening) element('line', {x1:x(elapsed), x2:x(elapsed), y1:top, y2:bottom, stroke:'#687386', 'stroke-width':1});
    svg.replaceChildren(group);
  }
  function newQuestion() {
    stopMic(); stopReference();
    const count = settings.high - settings.low + 1;
    let next = settings.low + Math.floor(Math.random() * count);
    if (count > 1 && next === target) next = settings.low + (next - settings.low + 1 + Math.floor(Math.random() * (count - 1))) % count;
    target = next; correct = false; completed = false; micProblem = false; hasPlayed = false; center = target;
    points = []; origin = 0; plotTime = 0; resetJudge();
    $('singing-frequency').textContent = '— Hz';
    error(); renderStatus(); drawChart();
  }
  async function play() {
    if (!active || target === null) return;
    stopMic(); stopReference(); error(); correct = false; micProblem = false;
    points = []; origin = 0; plotTime = 0;
    $('singing-frequency').textContent = '— Hz';
    const token = audio.token, note = target;
    loadingAudio = true; renderStatus(); drawChart();
    try {
      const deviceReady = audio.ready();
      // Permission is requested within the play gesture; no samples are analysed
      // until the reference and its short settling period have finished.
      void prepareMicrophone(token, deviceReady);
      const device = await deviceReady;
      const sample = await audio.piano(note);
      if (!active || token !== audio.token) return;
      context = device;
      const at = device.currentTime + .04, duration = 1.5;
      audio.setVolume(settings.volume / 100 * .8);
      audio.tone(sample, at, duration, .75, {attack:.012, hold:.25, floor:.001, tail:0});
      // Include the analysis buffer and room decay before accepting microphone data.
      guardUntil = at + duration + .45;
      hasPlayed = true;
      beginListeningWhenReady(token);
    } catch {
      if (active && token === audio.token) { stopMic(); stopReference(); error('钢琴播放失败，请重试。'); renderStatus(); }
    } finally {
      if (token === audio.token) { loadingAudio = false; renderStatus(); }
    }
  }
  function stopMic() {
    micRequest++; requesting = false; listening = false;
    if (frame) root.cancelAnimationFrame(frame);
    frame = 0;
    for (const track of stream?.getTracks() || []) track.stop();
    stream = null;
    for (const node of [source, analyser, mutedOutput]) { try { node?.disconnect(); } catch {} }
    source = analyser = mutedOutput = null;
    resetJudge();
    renderStatus();
  }
  function tick(time) {
    if (!active || !stream || !listening) return;
    frame = root.requestAnimationFrame(tick);
    if (time - lastFrame < 50) return;
    lastFrame = time;
    const enabled = hasPlayed && context.state === 'running' && !document.hidden;
    if (!enabled) {
      stopMic(); stopReference(); error('音频已暂停，请点击播放重试。'); renderStatus(); return;
    }
    analyser.getFloatTimeDomainData(samples);
    const result = tracker.update(detect(samples), context.currentTime * 1000);
    if (!origin) origin = time;
    plotTime = time;
    const note = result ? pitch.midi(result.hz) : null, second = Math.max(0, (time - origin) / 1000);
    points.push({second, note});
    while (points.length && points[0].second < second - 11) points.shift();
    if (note !== null && Math.abs(note - center) > 11) center = Math.round(note);
    $('singing-frequency').textContent = result ? `${result.hz.toFixed(1)} Hz · ${pitch.noteName(note)}` : '— Hz';
    if (!correct && judge.update(result, context.currentTime * 1000)) {
      correct = true;
      // Only completed imitations count. Searching for a pitch is not a series of wrong answers.
      if (!completed) {
        completed = true;
        review.record({actual:target % 12, chosen:target % 12, low:target, high:target, timbre:'piano'});
      }
      stopMic();
    }
    renderStatus(); drawChart(time);
  }
  function micError(err) {
    if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') return '麦克风权限未开启，请在浏览器的网站设置中允许使用麦克风，再重试。';
    if (err?.name === 'NotFoundError') return '没有找到麦克风，请连接麦克风后重试。';
    if (err?.name === 'NotReadableError') return '麦克风无法使用，请检查是否被其他程序占用。';
    return '无法启动麦克风，请检查设备或浏览器权限后重试。';
  }
  function beginListeningWhenReady(token) {
    if (!active || token !== audio.token || !hasPlayed || correct || document.hidden) return;
    clearTimeout(referenceTimer); referenceTimer = null;
    if (context.state !== 'running' || context.currentTime < guardUntil) {
      referenceTimer = setTimeout(() => beginListeningWhenReady(token), context.state === 'running' ?
        Math.max(30, (guardUntil - context.currentTime) * 1000 + 20) : 100);
      return;
    }
    if (!stream || listening) { renderStatus(); return; }
    try {
      for (const track of stream.getAudioTracks()) track.enabled = true;
      source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
      analyser.fftSize = context.sampleRate > 48000 ? 16384 : 8192;
      samples = new Float32Array(analyser.fftSize);
      detect = pitch.createDetector(context.sampleRate, samples.length);
      mutedOutput = context.createGain(); mutedOutput.gain.value = 0;
      source.connect(analyser); analyser.connect(mutedOutput); mutedOutput.connect(context.destination);
      listening = true; points = []; origin = now(); plotTime = origin; lastFrame = -Infinity; resetJudge();
      renderStatus(); drawChart(); frame = root.requestAnimationFrame(tick);
    } catch (err) {
      stopMic(); micProblem = true; error(micError(err)); renderStatus();
    }
  }
  async function prepareMicrophone(playToken, deviceReady) {
    if (!root.navigator.mediaDevices?.getUserMedia) {
      micProblem = true;
      error('当前页面无法使用麦克风，请通过 HTTPS 或本机 localhost 打开，并使用支持麦克风的浏览器。'); return;
    }
    const token = ++micRequest;
    requesting = true; renderStatus();
    let acquired = null;
    try {
      const capture = root.navigator.mediaDevices.getUserMedia({audio:{channelCount:1,
        echoCancellation:true, noiseSuppression:false, autoGainControl:false}, video:false}).then(value => {
        if (!active || token !== micRequest || document.hidden) for (const track of value.getTracks()) track.stop();
        else for (const track of value.getAudioTracks()) track.enabled = false;
        return value;
      });
      const results = await Promise.allSettled([deviceReady, capture]);
      if (results[1].status === 'fulfilled') acquired = results[1].value;
      if (results[0].status === 'rejected') throw results[0].reason;
      if (results[1].status === 'rejected') throw results[1].reason;
      if (!active || token !== micRequest || document.hidden) {
        for (const track of acquired.getTracks()) track.stop(); return;
      }
      context = results[0].value;
      stream = acquired;
      for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => {
        if (token !== micRequest || !active) return;
        stopMic(); micProblem = true; error('麦克风已断开，请点击重播重试。'); renderStatus();
      }, {once:true});
      requesting = false; renderStatus(); beginListeningWhenReady(playToken);
    } catch (err) {
      for (const track of acquired?.getTracks() || []) track.stop();
      if (active && token === micRequest) { stopMic(); micProblem = true; error(micError(err)); renderStatus(); }
    }
  }
  function syncSettings() {
    $('singing-low').value = String(settings.low); $('singing-high').value = String(settings.high);
    $('singing-volume').value = String(settings.volume); $('singing-volume-value').textContent = `${settings.volume}%`;
  }
  function openSettings() {
    if (!active) return;
    stopMic(); stopReference(); syncSettings();
    root.TonaloomMotion.open($('singing-settings'));
  }
  function enter() {
    if (!initialized) return;
    active = true; document.body.classList.add('module-active');
    document.documentElement.classList.remove('practice-scroll-locked');
    for (const id of ['home-screen','practice','sight-practice','staff-interval-practice']) $(id).classList.add('hidden');
    $('singing-practice').classList.remove('hidden');
    $('practice-navigation').classList.remove('hidden'); $('open-settings').classList.remove('hidden');
    $('practice-mode-title').textContent = definition.name;
    root.scrollTo(0, 0); newQuestion();
  }
  function leave() {
    if (!active) return;
    active = false; stopMic(); stopReference();
    if ($('singing-settings').open) root.TonaloomMotion.close($('singing-settings'));
    $('singing-practice').classList.add('hidden');
  }
  function backup() { return {settings:{...settings}, review:review.snapshot()}; }
  function backupEntries(obj) {
    if (obj.singing === undefined) return [];
    const value = obj.singing, config = value?.settings;
    if (!value || !config || !Number.isInteger(config.low) || !Number.isInteger(config.high) ||
      config.low < 36 || config.high > 84 || config.high < config.low ||
      !Number.isFinite(config.volume) || config.volume < 0 || config.volume > 100 || !value.review) throw Error('模唱备份格式不正确');
    return [[definition.settingsKey, JSON.stringify(normalize(config))],
      [definition.reviews[0].key, JSON.stringify(root.IntervalReview.normalizeStore(value.review, 11))]];
  }
  function init() {
    if (initialized) return;
    initialized = true;
    try { settings = normalize(JSON.parse(store().getItem(definition.settingsKey) || 'null')); } catch { settings = {...defaults}; }
    review = root.IntervalReview.createReviewManager(store(), definition.reviews[0].key, {maxIndex:11});
    for (const id of ['singing-low','singing-high']) {
      for (let note = 36; note <= 84; note++) {
        const option = document.createElement('option'); option.value = String(note); option.textContent = pitch.noteName(note); $(id).appendChild(option);
      }
      $(id).addEventListener('change', () => {
        settings.low = Number($('singing-low').value); settings.high = Number($('singing-high').value);
        if (settings.low > settings.high) settings[id === 'singing-low' ? 'high' : 'low'] = settings[id === 'singing-low' ? 'low' : 'high'];
        stopMic(); syncSettings(); save(); newQuestion();
      });
    }
    $('singing-volume').addEventListener('input', () => {
      settings.volume = Number($('singing-volume').value); audio.setVolume(settings.volume / 100 * .8); syncSettings(); save();
    });
    $('singing-play').addEventListener('click', () => void play());
    $('singing-next').addEventListener('click', () => { newQuestion(); void play(); });
    for (const id of ['singing-settings-close','singing-settings-done']) $(id).addEventListener('click', () => root.TonaloomMotion.close($('singing-settings')));
    $('singing-settings').addEventListener('click', event => { if (event.target === $('singing-settings')) root.TonaloomMotion.close(event.target); });
    $('singing-open-stats').addEventListener('click', () => { root.TonaloomMotion.close($('singing-settings')); modules.showStatistics(definition.id); });
    document.addEventListener?.('visibilitychange', () => { if (document.hidden && active) { stopMic(); stopReference(); } });
    root.addEventListener('pagehide', () => { stopMic(); stopReference(); });
    root.addEventListener('resize', () => drawChart());
    modules.register(definition.id, {enter, leave, openSettings, isActive:() => active, backup, backupEntries,
      reviewManager:() => review, enabled:() => Array.from({length:12}, (_,i) => i), clearHistory:() => review.reset(),
      statistics:(period,time) => ({...root.IntervalStats.readReview(review, Array.from({length:12}, (_,i) => i), period, time),
        unit:'音高', label:note => pitch.noteName(note + 60).replace(/\d+$/, '')})});
  }
  if (root.IntervalAppReady) init(); else root.addEventListener('interval-trainer-ready', init, {once:true});
})(window);
