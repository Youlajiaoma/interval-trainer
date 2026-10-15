'use strict';

// State/recording tests only: no browser profile, network, disk writes or real audio.
// The DOM and engraving doubles do not verify layout, glyphs or actual sound.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const site = path.resolve(__dirname, '../../site');
const readSource = file => fs.readFileSync(path.join(site, file), 'utf8');

class Element {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.listeners = new Map();
    this.dataset = {};
    this.attributes = {};
    this.className = '';
    this.style = {
      setProperty(key, value) { this[key] = value; },
      removeProperty(key) { delete this[key]; }
    };
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      toggle: (name, on) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        on = on === undefined ? !names.has(name) : Boolean(on);
        if (on) names.add(name); else names.delete(name);
        this.className = [...names].join(' ');
        return on;
      },
      add: (...names) => names.forEach(name => this.classList.toggle(name, true)),
      remove: (...names) => names.forEach(name => this.classList.toggle(name, false))
    };
    this.value = '';
    this.open = false;
    this.disabled = false;
    this.clientWidth = 340;
    this.scrollTop = 0;
    this._text = '';
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(value) { this.textContent = value.replace(/<[^>]*>/g, ''); }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key === 'class') this.className = String(value);
    if (key === 'id') this.id = String(value);
  }
  getAttribute(key) { return this.attributes[key] ?? null; }
  append(...nodes) {
    for (const node of nodes) { node.parent = this; this.children.push(node); }
  }
  appendChild(node) { this.append(node); return node; }
  prepend(node) { node.parent = this; this.children.unshift(node); }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
  }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  addEventListener(type, listener, options = {}) {
    const entries = this.listeners.get(type) || [];
    entries.push({listener, once: options.once});
    this.listeners.set(type, entries);
  }
  dispatchEvent(event) {
    event.target ??= this;
    event.stopImmediatePropagation ??= () => { event.stopped = true; };
    const results = [];
    for (const entry of [...(this.listeners.get(event.type) || [])]) {
      if (entry.once) this.listeners.set(event.type, this.listeners.get(event.type).filter(item => item !== entry));
      results.push(entry.listener(event));
      if (event.stopped) break;
    }
    if (!event.stopped && this['on' + event.type]) results.push(this['on' + event.type](event));
    return results;
  }
  click() { if (!this.disabled) this.dispatchEvent({type: 'click'}); }
  showModal() { this.open = true; }
  close() { if (this.open) { this.open = false; this.dispatchEvent({type: 'close'}); } }
  getBoundingClientRect() { return {width: this.clientWidth, height: 149, top: 0, bottom: 149}; }
  querySelectorAll(selector) {
    const supported = ['button', 'svg', '.vf-stavenote', '.vf-stem', 'path,line,polyline'];
    if (!supported.includes(selector)) throw Error('Unsupported test selector: ' + selector);
    const tags = selector.split(',');
    const matches = node => selector.startsWith('.') ? node.classList.contains(selector.slice(1)) : tags.includes(node.tagName);
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function createMemoryDatabase(initial = new Map()) {
  const records = new Map(initial);
  const db = {
    objectStoreNames: {contains: () => true},
    close() {},
    transaction() {
      const operations = [];
      const tx = {objectStore: () => ({
        get(key) { const request = {}; operations.push({type: 'get', key, request}); return request; },
        put(value, key) { operations.push({type: 'put', key, value}); },
        delete(key) { operations.push({type: 'delete', key}); }
      }), abort() { this.aborted = true; }};
      queueMicrotask(() => {
        if (tx.aborted) { tx.onabort?.(); return; }
        const staged = new Map(records);
        for (const op of operations) {
          if (op.type === 'get') { op.request.result = records.get(op.key); op.request.onsuccess?.(); }
          else if (op.type === 'put') staged.set(op.key, op.value);
          else staged.delete(op.key);
        }
        // Commit the complete write set together, not one field at a time.
        for (const [key, value] of staged) records.set(key, value);
        for (const key of records.keys()) if (!staged.has(key)) records.delete(key);
        tx.oncomplete?.();
      });
      return tx;
    }
  };
  return {records, indexedDB: {open() {
    const request = {};
    queueMicrotask(() => { request.result = db; request.onsuccess?.(); });
    return request;
  }}};
}

function createEngraver() {
  const notes = [];
  class Renderer {
    constructor(host) { host.append(new Element('svg')); }
    resize() {}
    getContext() { return {}; }
  }
  Renderer.Backends = {SVG: 1};
  class Stave {
    addClef() { return this; }
    setContext() { return this; }
    draw() {}
  }
  class StaveNote {
    constructor(options) {
      this.options = options;
      this.modifiers = [];
      this.element = new Element('g');
      notes.push(this);
    }
    addModifier(modifier, index) { this.modifiers.push({modifier, index}); return this; }
    getSVGElement() { return this.element; }
    getStem() { return null; }
  }
  class Voice {
    setStrict() { return this; }
    addTickables() { return this; }
    draw() {}
  }
  class Formatter {
    joinVoices() { return this; }
    formatToStave() { return this; }
  }
  class Accidental { constructor(type) { this.type = type; } }
  const api = {Renderer, Stave, StaveNote, Voice, Formatter, Accidental,
    Fraction: class {}, Beam: {generateBeams: () => []}, Dot: {buildAndAttach() {}}, setFonts() {}};
  return {api, notes};
}

async function createApp({database = createMemoryDatabase(), seed = 12345} = {}) {
  const elements = new Map();
  for (const match of readSource('index.html').matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const element = new Element(match[1]);
    element.id = match[2];
    element.className = /class="([^"]*)"/.exec(match[0])?.[1] || '';
    elements.set(element.id, element);
  }
  const get = id => {
    if (!elements.has(id)) throw Error('Missing page element: ' + id);
    return elements.get(id);
  };
  get('stats-period').value = '30';
  const appShell = new Element();
  const clefButtons = ['treble', 'bass', 'both'].map(clef => {
    const button = new Element('button'); button.dataset.clef = clef; return button;
  });
  const document = {
    body: new Element('body'), documentElement: new Element('html'),
    getElementById: get,
    createElement: tag => new Element(tag),
    createElementNS: (_namespace, tag) => new Element(tag),
    createDocumentFragment: () => new Element('fragment'),
    querySelector(selector) {
      if (selector === '.app-shell') return appShell;
      throw Error('Unsupported document selector: ' + selector);
    },
    querySelectorAll(selector) {
      if (selector === '.sight-clef-options button') return clefButtons;
      if (selector === '[data-staff-clef]') return [];
      throw Error('Unsupported document selector: ' + selector);
    }
  };
  const clock = {now: new Date(2026, 9, 15, 10).getTime(), timers: new Map(), nextId: 0};
  const setTimer = (callback, delay = 0) => {
    const id = ++clock.nextId;
    clock.timers.set(id, {callback, at: clock.now + delay});
    return id;
  };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const random = Object.create(Math);
  random.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const errors = [], audioEvents = [], downloads = [];
  class AudioContext {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
    async resume() { this.state = 'running'; }
    async decodeAudioData() { return {duration: 1}; }
    createGain() {
      return {connect() {}, disconnect() {}, gain: {setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}}};
    }
    createBufferSource() {
      return {connect() {}, disconnect() {}, playbackRate: {setValueAtTime() {}},
        start(at) { audioEvents.push({type: 'start', at}); }, stop(at) { audioEvents.push({type: 'stop', at}); }};
    }
  }
  const engraver = createEngraver();
  const window = Object.assign(new Element('window'), {
    document, indexedDB: database.indexedDB, localStorage: {getItem: () => null},
    navigator: {storage: {persist: async () => true}}, innerHeight: 900, scrollY: 0,
    scrollTo() {}, confirm: () => true, location: {reload() { window.reloads++; }}, reloads: 0,
    AudioContext, SightVexFlowReady: Promise.resolve(engraver.api),
    PIANO_SAMPLES: Object.fromEntries(Array.from({length: 61}, (_, i) => [36 + i, 'AA==']))
  });
  class MemoryBlob {
    constructor(parts) { this.text = parts.join(''); downloads.push(this.text); }
  }
  class MemoryURL extends URL {
    static createObjectURL() { return 'blob:isolated-test'; }
    static revokeObjectURL() {}
  }
  const context = vm.createContext({window, document, navigator: window.navigator, indexedDB: database.indexedDB,
    console: {log() {}, warn() {}, error: (...args) => errors.push(args.map(String).join(' '))},
    Date: ClockDate, Math: random, URL: MemoryURL, Blob: MemoryBlob,
    Event: class {constructor(type) { this.type = type; }},
    CustomEvent: class {constructor(type, options) { this.type = type; this.detail = options.detail; }},
    setTimeout: setTimer, clearTimeout: id => clock.timers.delete(id),
    requestAnimationFrame: callback => setTimer(callback, 16), confirm: window.confirm,
    atob: text => Buffer.from(text, 'base64').toString('binary'),
    fetch: async url => {
      const target = new URL(url);
      assert.equal(target.origin, 'https://isolated.test', 'Tests must never fetch an external resource');
      assert(target.pathname.startsWith('/assets/melodic-recordings/'));
      return {ok: true, arrayBuffer: async () => new ArrayBuffer(1)};
    }
  });
  document.baseURI = 'https://isolated.test/';
  for (const file of ['logic.js', 'review.js', 'statistics.js', 'storage.js', 'assets/melodic-recordings.js']) {
    vm.runInContext(readSource(file), context, {filename: file});
  }
  const ready = vm.runInContext(readSource('app.js'), context, {filename: 'app.js'});
  for (const file of ['sight.js', 'staff-interval.js']) vm.runInContext(readSource(file), context, {filename: file});
  await ready;
  const settle = async () => {
    await new Promise(setImmediate);
    await window.IntervalPwaStorageAdapter.flush();
    await new Promise(setImmediate);
  };
  await settle();
  const app = {
    window, get, database, clock, errors, audioEvents, engraver,
    storage: window.IntervalPwaStorageAdapter, settle,
    async click(id) { get(id).click(); await settle(); },
    async advance(milliseconds) {
      const target = clock.now + milliseconds;
      for (;;) {
        const next = [...clock.timers].filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        clock.timers.delete(next[0]); clock.now = next[1].at;
        next[1].callback(); await settle();
      }
      clock.now = target;
    },
    async exportText() { await app.click('export-backup'); return downloads.at(-1); },
    async backup() { return JSON.parse(await app.exportText()); },
    async importBackup(backup) { await window.acceptNativeBackup(JSON.stringify(backup)); await settle(); },
    async importFile(text) {
      const input = get('backup-file');
      input.files = [{size: Buffer.byteLength(text), text: async () => text}];
      await Promise.all(input.dispatchEvent({type: 'change'})); await settle();
    },
    async answer(container, value) {
      const button = get(container).querySelectorAll('button').find(item => Number(item.dataset.answer ?? item.dataset.semitone) === value);
      assert(button && !button.disabled, 'The requested answer must be available');
      button.click(); await settle();
    },
    assertNoErrors() { assert.deepEqual(errors, [], 'Unexpected application errors in the test environment'); }
  };
  return app;
}

module.exports = {createApp, createMemoryDatabase, readSource};
