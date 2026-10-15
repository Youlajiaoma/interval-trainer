'use strict';

const vm = require('node:vm');
const {readSource, createMemoryDatabase} = require('./app-harness.cjs');
const context = {window: {}};
vm.runInNewContext(readSource('review.js'), context);
const api = context.window.IntervalReview;
const NOW = new Date(2026, 9, 15, 10).getTime();
const keys = Object.freeze({
  harmonic: 'interval-trainer-review-v1', melodic: 'interval-trainer-review-melodic-v1',
  treble: 'interval-trainer-review-sight-treble-v1', bass: 'interval-trainer-review-sight-bass-v1',
  staff: 'tonaloom-staff-interval-review-v1', settings: 'interval-trainer-settings',
  sightSession: 'interval-trainer-sight-session-v1', sightSettings: 'interval-trainer-sight-settings-v1',
  staffSession: 'tonaloom-staff-interval-v1'
});

function reviewStore({actual = 4, chosen = actual, maxIndex = 12, directional = false, count = 1} = {}) {
  const values = new Map();
  const storage = {getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
  const review = api.createReviewManager(storage, 'fixture', {maxIndex, directional});
  for (let i = 0; i < count; i++) review.record({actual, chosen,
    direction: directional ? 1 : null, firstMode: directional ? 'user-recording' : null,
    timbre: directional ? 'piano' : null, low: maxIndex === 62 ? 0 : 60,
    high: maxIndex === 62 ? 0 : 60 + actual, now: NOW + i});
  return JSON.parse(JSON.stringify(review.snapshot()));
}

function seededDatabase() {
  return createMemoryDatabase(new Map([
    [keys.harmonic, JSON.stringify(reviewStore())],
    [keys.melodic, JSON.stringify(reviewStore({actual: 7, directional: true}))],
    [keys.treble, JSON.stringify(reviewStore({actual: 30, maxIndex: 62}))],
    [keys.bass, JSON.stringify(reviewStore({actual: 45, maxIndex: 62}))],
    [keys.staff, JSON.stringify(reviewStore({actual: 3}))]
  ]));
}

// Twenty notes, three complete 4/4 measures. The altered fixture contains
// C#4, D4, C4 within the first measure, requiring a natural on the third note.
function sightSession({accidentals = false} = {}) {
  const durations = [.5, .5, .5, .5, 1, 1, 1, .5, .5, .5, .5, .5, .5, 1, .5, .5, .5, .5, .5, .5];
  return {version: 4, pos: 0, correct: 0, startedAt: NOW,
    notes: durations.map((duration, i) => ({clef: 'treble', index: i === 1 ? 29 : 28,
      letter: i === 1 ? 1 : 0, alter: accidentals && i === 0 ? 1 : 0,
      duration, result: null, mistakeChosen: null})),
    bars: [{start: 0, end: 6, clef: 'treble'}, {start: 6, end: 13, clef: 'treble'}, {start: 13, end: 20, clef: 'treble'}]};
}

// Generate a valid full retained history without serializing 8,000 growing
// copies. The production export still creates the actual file under test.
function fillHistory(store, count = 8000) {
  const history = store.history[0];
  store.history = Array.from({length: count}, (_, i) => ({...history, at: NOW + i}));
  store.totalAnswers = count;
  const card = store.cards[history.actual];
  card.attempts = count; card.correct = count;
  const day = Object.values(store.daily)[0];
  day.answered = count; day.correct = count;
  day.intervals[history.actual] = {answered: count, correct: count};
  if (store.directionalInitialized) {
    for (const c of Object.values(store.directionalCards)) { c.attempts = count; c.correct = count; }
    for (const d of Object.values(store.directionalDaily)) {
      for (const row of Object.values(d)) { row.answered = count; row.correct = count; }
    }
  }
  return store;
}

module.exports = {keys, NOW, reviewStore, seededDatabase, sightSession, fillHistory};
