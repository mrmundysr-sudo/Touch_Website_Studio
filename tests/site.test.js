'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../app/src/main/assets/studio/site.js');

test('both templates build from the one shared schema', () => {
  for (const t of Object.keys(S.TEMPLATES)) {
    const p = S.createProject(t, 'site-test', 'T');
    assert.ok(p.sections.length >= 4);
    for (const s of p.sections) assert.ok(S.SECTION_TYPES[s.type], 'known type ' + s.type);
    assert.deepStrictEqual(Object.keys(p.theme).sort(), ['accent', 'bg', 'font', 'primary', 'text']);
  }
});

test('export ships index.html/style.css/script.js and no editor artefacts', () => {
  const p = S.createProject('business', 'site-test', 'T');
  const r = S.render(p, {});
  assert.deepStrictEqual(Object.keys(r.files).sort(), ['index.html', 'script.js', 'style.css']);
  assert.ok(!r.html.includes('data-path'));
  assert.ok(!r.html.includes('postMessage'));
  assert.ok(r.html.includes('<link rel="stylesheet" href="style.css">'));
  assert.ok(r.html.includes('name="viewport"'));
});

test('edit render exposes tappable fields', () => {
  const p = S.createProject('family', 'site-test', 'T');
  const r = S.render(p, { edit: true, base: 'https://h/p/site-test/' });
  assert.ok(r.html.includes('data-path="sections.0.title"'));
  assert.ok(r.html.includes('<base href="https://h/p/site-test/">'));
  assert.deepStrictEqual(r.files, {});
});

test('text is HTML-escaped and unsafe links are dropped', () => {
  const p = S.createProject('business', 'site-test', 'T');
  p.sections[0].title = '<script>alert(1)</script> & "q"';
  p.sections[0].buttonLink = 'javascript:alert(1)';
  const html = S.render(p, {}).html;
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!/href="javascript:/i.test(html));
  assert.strictEqual(S.safeUrl('https://a.b'), 'https://a.b');
  assert.strictEqual(S.safeUrl('JavaScript:x'), '');
  assert.strictEqual(S.safeUrl('#contact'), '#contact');
});

test('hidden sections are omitted from export but shown dimmed when editing', () => {
  const p = S.createProject('business', 'site-test', 'T');
  const id = p.sections[1].id;
  p.sections[1].visible = false;
  assert.ok(!S.render(p, {}).html.includes('id="' + id + '"'));
  assert.ok(S.render(p, { edit: true }).html.includes('is-hidden'));
});

test('only referenced images are listed as assets', () => {
  const p = S.createProject('business', 'site-test', 'T');
  p.sections[0].image.file = 'img-a.jpg';
  p.sections[3].items[0].image.file = 'img-b.png';
  p.sections[3].items[1].image.file = 'img-a.jpg';
  const r = S.render(p, {});
  assert.deepStrictEqual(r.assets.sort(), ['img-a.jpg', 'img-b.png']);
  assert.ok(r.html.includes('src="assets/img-a.jpg"'));
  p.sections[1].visible = true; p.sections[3].visible = false;
  assert.deepStrictEqual(S.render(p, {}).assets, ['img-a.jpg']);
});

test('image crop is clamped so the frame is always covered', () => {
  assert.deepStrictEqual(S.clampCrop({ x: 99, y: -99, z: 1 }), { x: 0, y: 0, z: 1 });
  const c = S.clampCrop({ x: 99, y: -99, z: 2 });
  assert.strictEqual(c.x, 50); assert.strictEqual(c.y, -50);
  assert.strictEqual(S.clampCrop({ z: 99 }).z, 4);
  assert.strictEqual(S.clampCrop({ z: 0 }).z, 1);
});

test('content hash tracks visible content, not name or publish bookkeeping', () => {
  const p = S.createProject('business', 'site-test', 'T');
  const h0 = S.contentHash(p);
  p.name = 'Renamed'; p.updatedAt = 5; p.publish = { siteId: 'x' };
  assert.strictEqual(S.contentHash(p), h0);
  p.sections[0].title = 'Changed';
  assert.notStrictEqual(S.contentHash(p), h0);
});

test('publish state: never -> linked -> current -> changes', () => {
  const p = S.createProject('business', 'site-test', 'T');
  assert.strictEqual(S.publishState(p), 'never');
  p.publish = { siteId: 'abc' };
  assert.strictEqual(S.publishState(p), 'linked-unpublished');
  p.publish.publishedHash = S.contentHash(p);
  assert.strictEqual(S.publishState(p), 'current');
  S.setPath(p, 'sections.0.title', 'Edited');
  assert.strictEqual(S.publishState(p), 'changes');
});

test('section operations', () => {
  const p = S.createProject('business', 'site-test', 'T');
  const first = p.sections[0].id, second = p.sections[1].id;
  assert.ok(S.moveSection(p, first, 1));
  assert.strictEqual(p.sections[1].id, first); assert.strictEqual(p.sections[0].id, second);
  assert.ok(!S.moveSection(p, second, -1));
  const n = p.sections.length;
  const dup = S.duplicateSection(p, first);
  assert.strictEqual(p.sections.length, n + 1); assert.notStrictEqual(dup.id, first);
  assert.ok(S.removeSection(p, dup.id)); assert.strictEqual(p.sections.length, n);
  const cards = p.sections.find(s => s.type === 'cards'); const c0 = cards.items.length;
  S.addItem(cards); assert.strictEqual(cards.items.length, c0 + 1);
  assert.ok(S.removeItem(cards, 0)); assert.strictEqual(cards.items.length, c0);
  assert.strictEqual(S.addItem(p.sections.find(s => s.type === 'contact')), null);
});

test('unknown section types and unknown fields are preserved and flagged, not dropped', () => {
  const p = S.createProject('business', 'site-test', 'T');
  p.sections.push({ id: 's-x', type: 'carousel3d', visible: true, title: 'Fancy', custom: { a: 1 } });
  p.futureField = { keep: true };
  const r = S.render(p, {});
  assert.strictEqual(r.warnings.length, 1);
  const roundTrip = JSON.parse(JSON.stringify(p));
  assert.deepStrictEqual(roundTrip.sections[roundTrip.sections.length - 1].custom, { a: 1 });
  assert.deepStrictEqual(roundTrip.futureField, { keep: true });
});

test('a project survives JSON round trip with identical output', () => {
  const p = S.createProject('family', 'site-test', 'T');
  const q = JSON.parse(JSON.stringify(p));
  assert.strictEqual(S.render(q, {}).html, S.render(p, {}).html);
  assert.strictEqual(S.contentHash(q), S.contentHash(p));
});
