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
    const voices = new Set();
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
      voices.add(source);
      source.start(at); source.stop(at+duration+(envelope?.tail ?? 0));
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
        for (const voice of voices) try { voice.stop(); } catch {}
        voices.clear();
      },
      tone(sample, at, duration, gain, envelope) { start(sample, at, duration, gain, envelope); },
      playRecording(buffer, at, gain = 3) { start({buffer, rate:1}, at, buffer.duration, gain, null); }
    });
  }
  root.TonaloomAudio = Object.freeze({createChannel});
})(window);
