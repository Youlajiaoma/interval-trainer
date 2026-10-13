/* 纯逻辑层：音程生成、音名拼写、设置校验。 */
(function (root) {
  'use strict';
  const INTERVALS = [
    { semitones: 0, name: '纯一度', short: 'P1', steps: 0 },
    { semitones: 1, name: '小二度', short: 'm2', steps: 1 },
    { semitones: 2, name: '大二度', short: 'M2', steps: 1 },
    { semitones: 3, name: '小三度', short: 'm3', steps: 2 },
    { semitones: 4, name: '大三度', short: 'M3', steps: 2 },
    { semitones: 5, name: '纯四度', short: 'P4', steps: 3 },
    { semitones: 6, name: '三全音', short: 'TT', steps: 3 },
    { semitones: 7, name: '纯五度', short: 'P5', steps: 4 },
    { semitones: 8, name: '小六度', short: 'm6', steps: 5 },
    { semitones: 9, name: '大六度', short: 'M6', steps: 5 },
    { semitones: 10, name: '小七度', short: 'm7', steps: 6 },
    { semitones: 11, name: '大七度', short: 'M7', steps: 6 },
    { semitones: 12, name: '纯八度', short: 'P8', steps: 7 }
  ];
  const ROOT_SPELLINGS = [
    { letter: 0, alteration: 0 },  // C
    { letter: 0, alteration: 1 },  // C#
    { letter: 1, alteration: 0 },  // D
    { letter: 2, alteration: -1 }, // Eb
    { letter: 2, alteration: 0 },  // E
    { letter: 3, alteration: 0 },  // F
    { letter: 3, alteration: 1 },  // F#
    { letter: 4, alteration: 0 },  // G
    { letter: 5, alteration: -1 }, // Ab
    { letter: 5, alteration: 0 },  // A
    { letter: 6, alteration: -1 }, // Bb
    { letter: 6, alteration: 0 }   // B
  ];
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const NATURAL_PITCH = [0, 2, 4, 5, 7, 9, 11];
  function formatNote(letter, alteration, octave) {
    const sign = alteration === -2 ? '𝄫' : alteration === -1 ? '♭' : alteration === 1 ? '♯' : alteration === 2 ? '𝄪' : '';
    return LETTERS[letter] + sign + octave;
  }
  function spellPair(lowMidi, interval) {
    const pitchClass = lowMidi % 12;
    const lower = ROOT_SPELLINGS[pitchClass];
    const lowerOctave = Math.floor(lowMidi / 12) - 1;
    const totalStep = lower.letter + interval.steps;
    const upperLetter = totalStep % 7;
    const upperOctave = lowerOctave + Math.floor(totalStep / 7);
    const upperMidi = lowMidi + interval.semitones;
    const upperNaturalMidi = (upperOctave + 1) * 12 + NATURAL_PITCH[upperLetter];
    const alteration = upperMidi - upperNaturalMidi;
    return [formatNote(lower.letter, lower.alteration, lowerOctave), formatNote(upperLetter, alteration, upperOctave)];
  }
  function eligibleIntervals(chosen, low, high) {
    return INTERVALS.filter(item => chosen.includes(item.semitones) && low + item.semitones <= high);
  }
  function pickRandom(items, random) {
    const n = Math.min(items.length - 1, Math.floor(random() * items.length));
    return items[n];
  }
  function makeQuestion(selected, low, high, previous, random = Math.random) {
    const eligible = eligibleIntervals(selected, low, high);
    if (!eligible.length) return null;
    const choices = previous && eligible.length > 1
      ? eligible.filter(item => item.semitones !== previous.semitones)
      : eligible;
    const interval = pickRandom(choices, random);
    const possibleRoots = high - low - interval.semitones + 1;
    let note = low + Math.floor(random() * possibleRoots);
    if (previous && eligible.length === 1 && possibleRoots > 1 && note === previous.low) {
      note = low + ((note - low + 1) % possibleRoots);
    }
    return { low: note, high: note + interval.semitones, semitones: interval.semitones, name: interval.name, notes: spellPair(note, interval) };
  }
  function makeMelodicQuestion(selected, low, high, firstMode, previous, random = Math.random) {
    const fixed = firstMode === 'a440';
    if (fixed && (low > 69 || high < 69)) return null;
    const possible = INTERVALS.filter(i => selected.includes(i.semitones) &&
      (fixed ? (69 - i.semitones >= low || 69 + i.semitones <= high) : low + i.semitones <= high));
    if (!possible.length) return null;
    let choices = possible.length > 1 && previous ? possible.filter(i => i.semitones !== previous.semitones) : possible;
    if (!choices.length) choices = possible;
    const interval = pickRandom(choices, random);
    const directions = interval.semitones === 0 ? [0] : [1,-1].filter(dir =>
      fixed ? (69 + dir * interval.semitones >= low && 69 + dir * interval.semitones <= high) : true);
    const direction = pickRandom(directions, random);
    const first = fixed ? 69 : (direction >= 0 ?
      low + Math.floor(random() * (high - low - interval.semitones + 1)) :
      low + interval.semitones + Math.floor(random() * (high - low - interval.semitones + 1)));
    const second = first + direction * interval.semitones;
    const lower = Math.min(first,second),upper=Math.max(first,second);
    const notes = spellPair(lower, interval);
    return { low:lower,high:upper,first,second,direction,semitones:interval.semitones,
      name:interval.name, notes, orderedNotes: first <= second ? notes : [notes[1],notes[0]] };
  }
  root.IntervalLogic = Object.freeze({ INTERVALS, makeQuestion, makeMelodicQuestion, eligibleIntervals, spellPair });
})(typeof window !== 'undefined' ? window : globalThis);
