'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp, createMemoryDatabase} = require('./helpers/app-harness.cjs');
const {keys, sightSession} = require('./helpers/fixtures.cjs');

async function draw(t, clef, edits) {
  const session = sightSession();
  const root = clef === 'treble' ? 28 : 21; // C4 / C3, independent of rendering.
  session.notes.forEach(note => { note.clef = clef; note.index = root; note.letter = 0; });
  session.bars.forEach(bar => { bar.clef = clef; });
  for (const [position, offset, alter] of edits) {
    Object.assign(session.notes[position], {index: root + offset, letter: offset % 7, alter});
  }
  const saved = JSON.stringify(session);
  const database = createMemoryDatabase(new Map([[keys.sightSession, saved]]));
  const app = await createApp({database});
  t.after(() => app.assertNoErrors());
  await app.click('home-sight');
  assert.equal(app.engraver.notes.length, 20);
  const after = JSON.parse(database.records.get(keys.sightSession));
  const stripTimer = item => ({...item, notes:item.notes.map(({questionStartedAt,responseMs,...note})=>note)});
  assert.deepEqual(stripTimer(after), JSON.parse(saved), '绘制符号不能修改实际音高或练习进度');
  return app.engraver.notes;
}

const symbols = notes => notes.map(note => note.modifiers.map(({modifier}) => modifier.type).join(''));

for (const clef of ['treble', 'bass']) {
  test(`${clef} 同小节升音后隔一个音回到自然音，补还原号`, async t => {
    const notes = await draw(t, clef, [[0, 0, 1], [1, 1, 0]]);
    assert.deepEqual(symbols(notes).slice(0, 4), ['#', '', 'n', '']);
    assert.match(notes[2].options.keys[0], /^c\/[34]$/);
  });

  test(`${clef} 降音后回到自然音，补还原号`, async t => {
    const notes = await draw(t, clef, [[0, 1, 2], [1, 2, 0], [2, 1, 0]]);
    assert.deepEqual(symbols(notes).slice(0, 3), ['b', '', 'n']);
  });

  test(`${clef} 临时升降号按八度区分，不影响其他八度的同名音`, async t => {
    const notes = await draw(t, clef, [[0, 0, 1], [1, 7, 0]]);
    assert.deepEqual(symbols(notes).slice(0, 3), ['#', '', 'n']);
    assert.notEqual(notes[0].options.keys[0].split('/')[1], notes[1].options.keys[0].split('/')[1]);
  });

  test(`${clef} 从升音改成降音再还原，依次绘制正确符号`, async t => {
    const notes = await draw(t, clef, [[0, 1, 1], [1, 1, 2], [2, 1, 0]]);
    assert.deepEqual(symbols(notes).slice(0, 3), ['#', 'b', 'n']);
  });

  test(`${clef} 同小节重复升音保留原有标注，连续自然音只还原一次`, async t => {
    const notes = await draw(t, clef, [[0, 0, 1], [1, 0, 1]]);
    assert.deepEqual(symbols(notes).slice(0, 5), ['#', '#', 'n', '', '']);
  });

  test(`${clef} 换小节后升降号失效，不添加多余还原号`, async t => {
    const notes = await draw(t, clef, [[5, 0, 1]]);
    assert.equal(symbols(notes)[5], '#');
    assert.equal(symbols(notes)[6], '');
  });
}
