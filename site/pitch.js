/* Monophonic YIN pitch estimation and time-based singing judgement.
 * Algorithm reference: de Cheveigne & Kawahara, JASA 111 (2002), 1917–1930.
 * Thresholds below are product choices, not a validated clinical/music exam scale.
 */
(function (root) {
  'use strict';
  const MIN_HZ = 32, MAX_HZ = 2200, MIN_RMS = .006;
  const names = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const midi = hz => 69 + 12 * Math.log2(hz / 440);
  const frequency = note => 440 * Math.pow(2, (note - 69) / 12);
  const noteName = note => names[((Math.round(note) % 12) + 12) % 12] + (Math.floor(Math.round(note) / 12) - 1);
  const cents = (hz, target) => ((((midi(hz) - target + 6) % 12) + 12) % 12 - 6) * 100;

  function createDetector(sampleRate, frameSize) {
    // Box-average decimation limits work on mobile and attenuates high harmonics.
    const step = Math.max(1, Math.floor(sampleRate / 22050)), rate = sampleRate / step;
    const size = Math.floor(frameSize / step), windowSize = Math.floor(size / 2);
    const maxLag = Math.min(windowSize - 1, Math.ceil(rate / MIN_HZ));
    const minLag = Math.max(2, Math.floor(rate / MAX_HZ));
    const signal = new Float32Array(size), difference = new Float32Array(maxLag + 1);
    return function detect(frame) {
      if (frame.length !== frameSize) throw Error('音高分析窗口长度不一致');
      let mean = 0, power = 0;
      for (let i = 0; i < frame.length; i++) mean += frame[i];
      mean /= frame.length;
      for (let i = 0; i < frame.length; i++) power += (frame[i] - mean) ** 2;
      const rms = Math.sqrt(power / frame.length);
      if (!Number.isFinite(rms) || rms < MIN_RMS) return null;
      for (let i = 0; i < size; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += frame[i * step + j] - mean;
        signal[i] = sum / step;
      }
      let cumulative = 0;
      difference[0] = 1;
      for (let lag = 1; lag <= maxLag; lag++) {
        let sum = 0;
        for (let j = 0; j < windowSize; j++) sum += (signal[j] - signal[j + lag]) ** 2;
        cumulative += sum;
        difference[lag] = cumulative > 0 ? sum * lag / cumulative : 1;
      }
      for (let lag = minLag; lag < maxLag; lag++) {
        const left = difference[lag - 1], middle = difference[lag], right = difference[lag + 1];
        if (middle >= left || middle > right) continue;
        const divisor = 2 * (2 * middle - right - left);
        const offset = divisor ? (right - left) / divisor : 0;
        // Interpolate both period and dip depth: high notes can have a minimum
        // between samples, especially with strong upper harmonics at 44.1 kHz.
        const depth = middle + .25 * (right - left) * offset;
        if (depth >= .15) continue;
        const confidence = Math.min(1, 1 - depth), refined = lag + offset;
        const hz = rate / refined;
        return hz >= MIN_HZ && hz <= MAX_HZ && confidence >= .85 ? {hz, confidence, rms} : null;
      }
      return null; // No periodic local minimum: never invent a pitch for noise.
    };
  }

  function createJudge(target) {
    const windowMs = 1200;
    let observations = [], lastTime = null;
    return Object.freeze({
      reset() { observations = []; lastTime = null; },
      update(result, time) {
        if (!Number.isFinite(time)) return false;
        // A stalled tab/device must not turn one old frame into a held note.
        if (lastTime !== null && (time <= lastTime || time - lastTime > 150)) observations = [];
        lastTime = time;
        const error = result && result.confidence >= .85 && result.rms >= MIN_RMS &&
          Number.isFinite(result.hz) && result.hz >= MIN_HZ && result.hz <= MAX_HZ ? cents(result.hz, target) : null;
        observations.push({time, error});
        const start = time - windowMs;
        while (observations.length > 1 && observations[1].time <= start) observations.shift();
        let span = 0, voiced = 0, near = 0;
        const weighted = [];
        for (let i = 0; i + 1 < observations.length; i++) {
          const sample = observations[i], duration = observations[i + 1].time - Math.max(start, sample.time);
          span += duration;
          if (sample.error === null) continue;
          voiced += duration;
          if (Math.abs(sample.error) <= 50) near += duration;
          weighted.push({error:sample.error, duration});
        }
        if (span + .000001 < windowMs || voiced < span * .8 || near < voiced * .8) return false;
        weighted.sort((a,b) => a.error - b.error);
        let weight = 0;
        for (const item of weighted) {
          weight += item.duration;
          if (weight >= voiced / 2) return Math.abs(item.error) <= 35;
        }
        return false;
      }
    });
  }
  function createTracker() {
    let anchor = null, lastVoiced = -Infinity, lastTime = null, pending = [];
    function reset() { anchor = null; lastVoiced = -Infinity; lastTime = null; pending = []; }
    return Object.freeze({reset, update(result, time) {
      if (!Number.isFinite(time)) return null;
      if (lastTime !== null && (time <= lastTime || time - lastTime > 150)) reset();
      lastTime = time;
      if (!result || !Number.isFinite(result.hz) || result.hz < MIN_HZ || result.hz > MAX_HZ ||
        !(result.confidence >= .85) || !(result.rms >= MIN_RMS)) {
        pending = [];
        if (time - lastVoiced > 300) anchor = null;
        return null;
      }
      const note = midi(result.hz);
      if (anchor !== null && time - lastVoiced <= 300 && Math.abs(note - anchor) <= 3) {
        anchor = note; lastVoiced = time; pending = [];
        return result;
      }
      // Validate the first pitch and large changes independently of the target.
      // Unconfirmed frames become gaps, never a held/artificially corrected note.
      if (pending.length && Math.abs(note - pending[0].note) > 1.2) pending = [];
      pending.push({note, time});
      const settling = anchor !== null && Math.abs(note - anchor) >= 9 ? 200 : 100;
      if (pending.length < 3 || time - pending[0].time < settling) return null;
      anchor = note; lastVoiced = time; pending = [];
      return result;
    }});
  }
  root.TonaloomPitch = Object.freeze({createDetector, createJudge, createTracker, midi, frequency, noteName, cents, MIN_RMS, MIN_HZ, MAX_HZ});
})(typeof window === 'undefined' ? globalThis : window);
