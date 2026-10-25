/* Shared audio device, decoded resources and per-module voice ownership. */
(function (root) {
  'use strict';
  let context = null;
  const buffers = new Map(), loading = new Map();
  function getContext() {
    const Constructor = root.AudioContext || root.webkitAudioContext;
    if (!Constructor) throw Error('当前浏览器不支持 Web Audio');
    if (!context) context = new Constructor();
    return context;
  }
  async function ready() {
    const ctx = getContext();
    if (ctx.state === 'suspended') await ctx.resume();
    return ctx;
  }
  async function load(key, read) {
    if (buffers.has(key)) return buffers.get(key);
    if (!loading.has(key)) loading.set(key, (async () => {
      const bytes = await read();
      return getContext().decodeAudioData(bytes);
    })());
    const operation = loading.get(key);
    try {
      const buffer = await operation;
      buffers.set(key, buffer);
      return buffer;
    } finally {
      // A failed request is retryable; an older waiter cannot delete a retry.
      if (loading.get(key) === operation) loading.delete(key);
    }
  }
  async function piano(midi, transposeOutsideRange = false) {
    const anchor = transposeOutsideRange ? Math.max(36, Math.min(96, midi)) : midi;
    const buffer = await load(`piano:${anchor}`, async () => {
      const sample = root.PIANO_SAMPLES?.[String(anchor)];
      if (!sample) throw Error(`缺少钢琴采样：${anchor}`);
      const binary = atob(sample), bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    });
    return {buffer, rate: Math.pow(2, (midi-anchor)/12)};
  }
  function recording(url) {
    const target = new URL(url, document.baseURI).href;
    return load(`recording:${target}`, async () => {
      const response = await fetch(target);
      if (!response.ok) throw Error(`音源下载失败（${response.status}）`);
      return response.arrayBuffer();
    });
  }
  function createChannel(level) {
    let master = null, generation = 0;
    const voices = new Map();
    const stopFade = .012;
    function output() {
      const ctx = getContext();
      if (!master) { master = ctx.createGain(); master.gain.value = level; master.connect(ctx.destination); }
      return master;
    }
    function start(sample, at, duration, gain, envelope) {
      const ctx = getContext(), source = ctx.createBufferSource(), volume = ctx.createGain();
      source.buffer = sample.buffer;
      source.playbackRate.setValueAtTime(sample.rate ?? 1, at);
      if (envelope) {
        volume.gain.setValueAtTime(0, at);
        volume.gain.linearRampToValueAtTime(gain, at+envelope.attack);
        volume.gain.setValueAtTime(gain, at+envelope.hold);
        volume.gain.linearRampToValueAtTime(envelope.floor, at+duration);
      } else volume.gain.value = gain;
      source.connect(volume); volume.connect(output());
      source.onended = () => {
        voices.delete(source);
        try { source.disconnect(); volume.disconnect(); } catch {}
      };
      voices.set(source, {volume, at, duration, gain, envelope, stopping:false});
      source.start(at); source.stop(at+duration+(envelope?.tail ?? 0));
    }
    function gainAt(voice, time) {
      const {at, duration, gain, envelope} = voice;
      if (!envelope) return gain;
      if (time <= at) return 0;
      if (time < at+envelope.attack) return gain*(time-at)/envelope.attack;
      if (time < at+envelope.hold) return gain;
      const releaseDuration = at+duration-(at+envelope.hold);
      if (releaseDuration <= 0 || time >= at+duration) return envelope.floor;
      const progress = (time-(at+envelope.hold))/releaseDuration;
      return gain+(envelope.floor-gain)*progress;
    }
    return Object.freeze({
      ready, piano, recording,
      get token() { return generation; },
      setVolume(value) {
        level = value;
        if (master) master.gain.setTargetAtTime(value, context.currentTime, .015);
      },
      stop() {
        generation++;
        if (!voices.size) return;
        const now = getContext().currentTime, end = now+stopFade;
        for (const [source, voice] of voices) {
          if (voice.stopping) continue;
          try {
            const parameter = voice.volume.gain;
            parameter.cancelScheduledValues(now);
            parameter.setValueAtTime(gainAt(voice, now), now);
            parameter.linearRampToValueAtTime(0, end);
            source.stop(end);
            voice.stopping = true;
          } catch {
            try { source.stop(); } catch {}
          }
        }
      },
      tone(sample, at, duration, gain, envelope) { start(sample, at, duration, gain, envelope); },
      playRecording(buffer, at, gain = 3) { start({buffer, rate:1}, at, buffer.duration, gain, null); }
    });
  }
  root.TonaloomAudio = Object.freeze({createChannel});
})(window);
