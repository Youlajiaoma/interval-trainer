/* Single recordings and synchronized stem transports share native controls. */
(function (root) {
  'use strict';
  const $ = id => document.getElementById(id), modules = root.TonaloomModules;
  const songs = root.TonaloomHarmonySongs, definition = modules.get('harmony-practice');
  let active = false, song = null, index = -1, view = 'songs';
  let audio, generation = 0, wantsPlay = false, sessionOwned = false, previousAudioSession;
  let mixer, loadingMix = false, loadedMix = false;
  const stemIds = ['melody','harmony','guitar'], volumes = {melody:100,harmony:100,guitar:100}, muted = {melody:false,harmony:false,guitar:false};
  let scrubbing = false, scrubKind = null, resumeAfterScrub = false, finishingScrub = false, scrubTimer;
  const seekKeys = new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown']);
  const actions = ['play','pause','stop','previoustrack','nexttrack','seekto','seekbackward','seekforward'];
  const track = () => song?.tracks[index];
  const isMix = () => Array.isArray(track()?.mix);
  const hasGuitar = () => isMix() && track().mix.length === 3;
  const mixSources = (item,entry = song) => item.mix.map(id => entry.stems?.[id] ?? entry.tracks.find(stem => stem.id === id)?.src);
  const hasSource = () => isMix() ? [2,3].includes(mixSources(track()).length) && mixSources(track()).every(src => typeof src === 'string' && src.length > 0)
    : typeof track()?.src === 'string' && track().src.length > 0;
  function warmSongs() {
    // Prepare silently before a song is chosen. Only play() unlocks output.
    let pending = Promise.resolve();
    for (const entry of songs) for (const item of entry.tracks) {
      if (!Array.isArray(item.mix)) continue;
      const urls = mixSources(item,entry);
      if ([2,3].includes(urls.length) && urls.every(url => typeof url === 'string' && url.length > 0)) {
        pending = pending.then(() => mixer.prepare(urls)).catch(() => {});
      }
    }
  }
  function message(text = '') {
    $('harmony-message').textContent = text;
    $('harmony-message').classList.toggle('hidden',!text);
  }
  function time(value) {
    const seconds = Number.isFinite(value) ? Math.max(0,Math.floor(value)) : 0;
    return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  }
  function position() {
    const ready = !isMix() || loadedMix;
    const duration = ready && Number.isFinite(audio.duration) ? audio.duration : 0;
    const current = ready && Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    $('harmony-elapsed').textContent = time(current);
    $('harmony-duration').textContent = time(duration);
    $('harmony-seek').disabled = !hasSource() || duration <= 0;
    $('harmony-seek').value = duration > 0 ? String(Math.min(100,current/duration*100)) : '0';
    if (sessionOwned && duration > 0) {
      try { root.navigator.mediaSession.setPositionState?.({duration,playbackRate:audio.playbackRate,position:Math.min(duration,current)}); } catch {}
    }
  }
  function renderPlayback() {
    const playing = wantsPlay && !audio.paused;
    const label = wantsPlay ? '暂停' : '播放';
    $('harmony-play').setAttribute('aria-label',label);
    $('harmony-play-label').textContent = label;
    $('harmony-play-icon').innerHTML = wantsPlay ? '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
    if (sessionOwned) {
      try { root.navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch {}
    }
  }
  function releaseSession() {
    if (sessionOwned) {
      for (const action of actions) try { root.navigator.mediaSession.setActionHandler(action,null); } catch {}
      try {
        root.navigator.mediaSession.playbackState = 'none';
        root.navigator.mediaSession.metadata = null;
        root.navigator.mediaSession.setPositionState?.();
      } catch {}
      sessionOwned = false;
    }
    if (previousAudioSession !== undefined) {
      try { root.navigator.audioSession.type = previousAudioSession; } catch {}
      previousAudioSession = undefined;
    }
  }
  function claimSession() {
    // Declare playback before starting either native transport.
    if (root.navigator.audioSession && previousAudioSession === undefined) {
      try { previousAudioSession = root.navigator.audioSession.type; root.navigator.audioSession.type = 'playback'; } catch {}
    }
    const session = root.navigator.mediaSession;
    if (!session) return;
    sessionOwned = true;
    try {
      if (root.MediaMetadata) session.metadata = new root.MediaMetadata({title:track().title,artist:song.title,album:definition.name});
    } catch {}
    const handlers = {
      play:() => void play(), pause, stop:() => { pause(); seek(0); },
      previoustrack:() => skip(-1), nexttrack:() => skip(1),
      seekto:details => seek(details.seekTime),
      seekbackward:details => seek(audio.currentTime-(details.seekOffset || 10)),
      seekforward:details => seek(audio.currentTime+(details.seekOffset || 10))
    };
    for (const action of actions) try { session.setActionHandler(action,handlers[action]); } catch {}
  }
  function pause() {
    generation++; wantsPlay = false; audio.pause();
    resumeAfterScrub = false;
    loadingMix = false; renderPlayback(); position();
  }
  function stop() {
    pause(); cancelScrub();
    audio.removeAttribute('src'); audio.load();
    loadedMix = false; releaseSession();
  }
  async function play() {
    if (!active || view !== 'player' || !hasSource()) return;
    if (scrubbing) { wantsPlay = true; resumeAfterScrub = true; finishScrub(); return; }
    const token = ++generation;
    wantsPlay = true; message(); claimSession();
    try {
      let device = mixer.resume();
      if (isMix()) {
        if (!loadedMix || !audio.src) {
          loadingMix = true; message('音频加载中…'); renderPlayback(); position();
          const prepared = await Promise.all([mixer.prepare(mixSources(track())),mixer.prime()]);
          if (!active || token !== generation) return;
          mixer.assign(prepared[0]); loadedMix = true; loadingMix = false;
          message();
        } else device = mixer.ready();
      }
      // A page restored from the browser's back cache may have released its src.
      if (!audio.src && !isMix()) { audio.src = track().src; audio.load(); }
      else if (audio.error) audio.load();
      // Call play directly in the user gesture; do not wait for a fetch or decode.
      const pending = audio.play(); renderPlayback();
      await Promise.all([pending,device]);
      if (active && token === generation) { renderPlayback(); position(); }
    } catch (error) {
      if (!active || token !== generation) return;
      loadingMix = false; wantsPlay = false; audio.pause(); renderPlayback(); position();
      message(error.name === 'NotAllowedError' ? '播放已暂停，请点击播放继续。' : '音频暂时无法播放，请重试。');
    }
  }
  function seek(value) {
    if (!active || view !== 'player' || !hasSource() || (isMix() && !loadedMix) || !Number.isFinite(audio.duration) || !Number.isFinite(value)) return;
    try { audio.currentTime = Math.max(0,Math.min(audio.duration,value)); } catch {}
    position();
  }
  function updateOutputMute() {
    audio.muted = scrubbing;
    mixer.setSilent(scrubbing);
  }
  function beginScrub(kind) {
    if (!active || view !== 'player' || $('harmony-seek').disabled) return;
    clearTimeout(scrubTimer); finishingScrub = false; scrubKind = kind;
    if (scrubbing) return;
    resumeAfterScrub = wantsPlay && !audio.paused;
    scrubbing = true; generation++;
    updateOutputMute(); audio.pause(); renderPlayback();
  }
  function completeScrub() {
    if (!scrubbing || !finishingScrub || audio.seeking) return;
    const resume = resumeAfterScrub && wantsPlay;
    scrubbing = false; finishingScrub = false; resumeAfterScrub = false; scrubKind = null;
    updateOutputMute(); renderPlayback();
    if (resume && active && view === 'player') void play();
  }
  function finishScrub() {
    if (!scrubbing) return;
    clearTimeout(scrubTimer); finishingScrub = true; scrubKind = null;
    completeScrub();
  }
  function cancelScrub() {
    clearTimeout(scrubTimer); scrubbing = false; finishingScrub = false; resumeAfterScrub = false; scrubKind = null;
    updateOutputMute();
  }
  function selectTrack(next) {
    if (!active || !song?.tracks[next]) return;
    // Preserve the active system media session across a background track change.
    pause(); cancelScrub(); audio.removeAttribute('src'); audio.load();
    index = next; view = 'player'; loadedMix = false;
    if (!isMix()) mixer.single();
    if (hasSource() && !isMix()) audio.src = track().src;
    else { audio.removeAttribute('src'); if (!hasSource()) releaseSession(); }
    audio.load();
    audio.loop = true;
    $('harmony-directory').classList.add('hidden'); $('harmony-player').classList.remove('hidden');
    $('harmony-track-title').textContent = track().title;
    $('harmony-track-number').textContent = `${String(index+1).padStart(2,'0')} / ${String(song.tracks.length).padStart(2,'0')}`;
    for (const id of ['harmony-track-number','harmony-previous','harmony-next']) $(id).classList.toggle('hidden',song.tracks.length === 1);
    $('harmony-previous').disabled = index === 0; $('harmony-next').disabled = index === song.tracks.length-1;
    $('harmony-play').disabled = !hasSource();
    $('harmony-melody').classList.toggle('hidden',!isMix());
    $('harmony-harmony').classList.toggle('hidden',!isMix());
    $('harmony-guitar').classList.toggle('hidden',!hasGuitar());
    for (const id of stemIds) updateStem(id);
    renderPlayback(); position();
    if (hasSource()) {
      void play();
    } else message('音频待添加');
  }
  function updateStem(id) {
    const name = {melody:'旋律',harmony:'和声',guitar:'吉他'}[id];
    mixer.setVolume(id,volumes[id]); mixer.setMuted(id,muted[id]);
    const level = `${muted[id] ? 0 : volumes[id]}%`, label = `${muted[id] ? '取消静音' : '静音'}${name}`;
    $(`harmony-${id}-input`).value = String(volumes[id]);
    $(`harmony-${id}-input`).setAttribute('aria-valuetext',level);
    $(`harmony-${id}-level`).textContent = level;
    const button = $(`harmony-${id}-mute`);
    button.classList.toggle('is-active',muted[id]); button.setAttribute('aria-pressed',String(muted[id]));
    button.setAttribute('aria-label',label); button.setAttribute('title',label);
  }
  function skip(direction) {
    if (active && view === 'player' && song?.tracks[index+direction]) {
      root.TonaloomMotion.content($('harmony-player'),() => selectTrack(index+direction),direction > 0 ? 'forward' : 'back');
    }
  }
  function entry(title, number, choose) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'harmony-entry';
    for (const [className,text] of [['harmony-entry-number',String(number).padStart(2,'0')],['harmony-entry-name',title],['harmony-entry-arrow','→']]) {
      const span = document.createElement('span'); span.className = className; span.textContent = text;
      if (className !== 'harmony-entry-name') span.setAttribute('aria-hidden','true');
      button.appendChild(span);
    }
    button.addEventListener('click',() => root.TonaloomMotion.navigate(choose));
    return button;
  }
  function directory(level) {
    stop(); view = level; index = -1;
    if (level === 'songs') song = null;
    $('harmony-player').classList.add('hidden'); $('harmony-directory').classList.remove('hidden');
    $('practice-mode-title').textContent = song?.title || definition.name;
    $('back-home').textContent = level === 'songs' ? '← HOME' : '← 返回';
    $('back-home').setAttribute('aria-label',level === 'songs' ? '返回主页' : '返回歌曲目录');
    const entries = level === 'songs' ? songs.map((item,i) => entry(item.title,i+1,() => {
      song = item;
      if (song.tracks.length === 1) {
        $('back-home').textContent = '← 返回'; $('back-home').setAttribute('aria-label','返回歌曲目录');
        selectTrack(0);
      } else directory('tracks');
    }))
      : song.tracks.map((item,i) => entry(item.title,i+1,() => {
        $('back-home').setAttribute('aria-label','返回音轨目录'); selectTrack(i);
      }));
    $('harmony-directory').replaceChildren(...entries);
    $('harmony-directory').setAttribute('aria-label',level === 'songs' ? '歌曲目录' : `${song.title}音轨目录`);
    if (level === 'tracks') for (const item of song.tracks) {
      if (item.mix && mixSources(item).every(src => typeof src === 'string' && src.length > 0)) mixer.prepare(mixSources(item)).catch(() => {});
    }
    root.scrollTo(0,0);
  }
  function enter() {
    active = true; document.body.classList.add('module-active');
    document.documentElement.classList.remove('practice-scroll-locked');
    for (const id of ['home-screen','practice','sight-practice','staff-interval-practice','singing-practice','open-settings']) $(id).classList.add('hidden');
    $('harmony-practice').classList.remove('hidden'); $('practice-navigation').classList.remove('hidden');
    $('harmony-navigation-spacer').classList.remove('hidden');
    directory('songs'); warmSongs();
  }
  function leave() {
    if (!active) return;
    active = false; stop(); mixer.release(); song = null; index = -1;
    $('harmony-practice').classList.add('hidden'); $('harmony-navigation-spacer').classList.add('hidden');
    $('back-home').textContent = '← HOME'; $('back-home').setAttribute('aria-label','返回主页');
  }
  function back() {
    if (!active || view === 'songs') return false;
    root.TonaloomMotion.navigate(() => directory(view === 'player' && song.tracks.length > 1 ? 'tracks' : 'songs'),'back');
    return true;
  }
  function init() {
    audio = $('harmony-audio');
    audio.loop = true;
    mixer = root.TonaloomHarmonyMix.create(audio);
    warmSongs();
    root.addEventListener('online',warmSongs);
    root.navigator.serviceWorker?.addEventListener('controllerchange',warmSongs);
    $('harmony-play').addEventListener('click',() => wantsPlay ? pause() : void play());
    $('harmony-previous').addEventListener('click',() => skip(-1));
    $('harmony-next').addEventListener('click',() => skip(1));
    const seekControl = $('harmony-seek');
    seekControl.addEventListener('pointerdown',() => beginScrub('pointer'));
    seekControl.addEventListener('keydown',event => { if (seekKeys.has(event.key)) beginScrub('keyboard'); });
    seekControl.addEventListener('keyup',event => { if (seekKeys.has(event.key) && scrubKind === 'keyboard') finishScrub(); });
    seekControl.addEventListener('input',() => {
      if (!scrubbing) beginScrub('input');
      if (finishingScrub) { finishingScrub = false; scrubKind = 'input'; }
      seek(Number(seekControl.value)/100*audio.duration);
      if (scrubKind === 'input') { clearTimeout(scrubTimer); scrubTimer = setTimeout(finishScrub,120); }
    });
    seekControl.addEventListener('change',() => { if (scrubKind === 'input') finishScrub(); });
    seekControl.addEventListener('blur',finishScrub);
    for (const event of ['pointerup','pointercancel']) root.addEventListener(event,() => { if (scrubKind === 'pointer') finishScrub(); });
    for (const id of stemIds) {
      $(`harmony-${id}-mute`).addEventListener('click',() => { muted[id] = !muted[id]; updateStem(id); });
      $(`harmony-${id}-input`).addEventListener('input',() => { volumes[id] = Number($(`harmony-${id}-input`).value); updateStem(id); });
    }
    for (const player of [audio]) {
    for (const name of ['timeupdate','loadedmetadata','durationchange','seeked']) player.addEventListener(name,() => { if (active && view === 'player' && audio === player) position(); });
    player.addEventListener('seeked',completeScrub);
    player.addEventListener('playing',() => { if (active && view === 'player' && audio === player && wantsPlay && !loadingMix) { message(); renderPlayback(); } });
    player.addEventListener('pause',() => {
      if (!active || view !== 'player' || audio !== player || loadingMix || scrubbing || !audio.paused || audio.ended) return;
      // System interruptions and external controls must also update the button.
      wantsPlay = false; renderPlayback();
    });
    player.addEventListener('ended',() => {
      if (!active || view !== 'player' || audio !== player || loadingMix || scrubbing || !wantsPlay || !hasSource() || !audio.ended) return;
      seek(0); void play();
    });
    player.addEventListener('error',() => {
      if (!active || view !== 'player' || audio !== player || loadingMix || !hasSource() || !audio.error) return;
      pause(); cancelScrub(); message('音频加载失败，请检查网络后重试。');
    });
    }
    // Hiding/locking keeps playback alive. Only a real document exit releases it.
    root.addEventListener('pagehide',() => { if (active) stop(); });
    modules.register(definition.id,{enter,leave,back,isActive:() => active});
  }
  if (root.IntervalAppReady) init(); else root.addEventListener('interval-trainer-ready',init,{once:true});
})(window);
