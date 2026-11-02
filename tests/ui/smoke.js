'use strict';
// UI smoke test: drives the real studio UI in headless Chromium against an in-memory MOCK of the native bridge.
// It verifies UI logic and flows only. It does not exercise Android, the Keystore, file pickers, or Netlify.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '../../app/src/main/assets/studio');
const SHOTS = process.env.SHOTS_DIR || path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
// 1x1 PNG (colour block) served for every project image.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u.startsWith('/app/')) {
    const f = path.join(ROOT, u.slice(5));
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    const type = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type }); return res.end(fs.readFileSync(f));
  }
  if (/^\/p\/[a-z0-9-]+\/assets\//.test(u)) { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(PNG); }
  res.writeHead(404); res.end();
});

const MOCK = `
(() => {
  const db = JSON.parse(localStorage.getItem('mockdb') || '{"p":{},"v":{},"token":false}');
  const persist = () => localStorage.setItem('mockdb', JSON.stringify(db));
  window.__calls = [];
  const reply = (id, ok, v) => setTimeout(() => window.__nativeResult(id, ok, JSON.stringify(v)), 5);
  window.Native = { invoke(id, m, argsJson) {
    const a = JSON.parse(argsJson); window.__calls.push({ m, a });
    try {
      switch (m) {
        case 'listProjects': return reply(id, true, Object.values(db.p).map(j => { const p = JSON.parse(j); return { id: p.id, name: p.name, updatedAt: p.updatedAt, contentHash: p.contentHash, publishedUrl: (p.publish||{}).url, publishedHash: (p.publish||{}).publishedHash, siteId: (p.publish||{}).siteId }; }));
        case 'newId': return reply(id, true, { id: 'site-' + Math.random().toString(36).slice(2, 10) });
        case 'loadProject': return reply(id, true, db.p[a.id]);
        case 'saveProject': { const old = db.p[a.id]; if (old && JSON.parse(old).contentHash !== JSON.parse(a.json).contentHash) (db.v[a.id] = db.v[a.id] || []).unshift({ file: Date.now() + '-save.json', ts: Date.now(), label: 'save', json: old }); db.p[a.id] = a.json; persist(); return reply(id, true, {}); }
        case 'updatePublish': { const p = JSON.parse(db.p[a.id]); p.publish = a.publish; db.p[a.id] = JSON.stringify(p); persist(); return reply(id, true, {}); }
        case 'listVersions': return reply(id, true, (db.v[a.id] || []).map(v => ({ file: v.file, ts: v.ts, label: v.label })));
        case 'loadVersion': return reply(id, true, db.v[a.id].find(v => v.file === a.file).json);
        case 'deleteProject': delete db.p[a.id]; persist(); return reply(id, true, {});
        case 'pickImage': return reply(id, true, { file: 'img-test.png', width: 1, height: 1 });
        case 'exportSiteZip': return reply(id, true, { saved: true });
        case 'tokenStatus': return reply(id, true, { hasToken: db.token });
        case 'setToken': db.token = true; persist(); return reply(id, true, {});
        case 'clearToken': db.token = false; persist(); return reply(id, true, {});
        case 'verifyToken': return reply(id, true, { email: 'tester@example.com' });
        case 'createSite': return reply(id, true, { siteId: 'mocksite1', url: 'https://mock-site.netlify.app', adminUrl: '' });
        case 'publish': setTimeout(() => window.__nativeEvent('publishProgress', JSON.stringify({ state: 'uploading', detail: 'mock upload' })), 2);
          return setTimeout(() => window.__nativeResult(id, true, JSON.stringify({ deployId: 'd1', state: 'ready', url: 'https://mock-site.netlify.app' })), 30);
        default: return reply(id, false, { message: 'mock: unsupported ' + m });
      }
    } catch (e) { reply(id, false, { message: String(e) }); }
  } };
})();`;

let failures = 0;
function check(name, cond, extra) { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra || ''))); if (!cond) failures++; }

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(MOCK);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = n => page.screenshot({ path: path.join(SHOTS, n + '.png') });
  const frame = () => page.frameLocator('#preview');

  await page.goto(base + '/app/index.html');
  await page.waitForSelector('text=No websites yet');
  check('empty dashboard', true); await shot('01-dashboard-empty');

  await page.click('text=+ New website');
  await page.waitForSelector('text=Choose a template'); await shot('02-templates');
  await page.click('button.tpl:has-text("Small business")');
  await page.waitForSelector('#preview');
  await frame().locator('h1').waitFor();
  check('editor shows business template', (await frame().locator('h1').innerText()).includes('Friendly local service')); await shot('03-editor');

  // tap-to-edit text
  await frame().locator('h1').click();
  await page.waitForSelector('.sheet input');
  await page.fill('.sheet input', 'Joe\'s Plumbing & Heating');
  await page.click('.sheet >> text=Done');
  await page.waitForTimeout(500);
  check('text edit appears in preview', (await frame().locator('h1').innerText()).includes("Joe's Plumbing"));
  check('save button offers Save when dirty', (await page.innerText('#savebtn')) === 'Save');
  await page.click('#savebtn'); await page.waitForTimeout(100);
  check('save clears dirty', (await page.innerText('#savebtn')) === 'Saved');

  // photo: pick, pan with one finger, zoom with slider
  await frame().locator('.hero-img').click();
  await page.waitForSelector('.crop');
  await page.click('.sheet >> text=Choose photo'); await page.waitForSelector('.crop img');
  const box = await page.locator('.crop').boundingBox();
  await page.evaluate(() => { document.querySelector('input[type=range]').value = 2; document.querySelector('input[type=range]').dispatchEvent(new Event('input')); });
  await page.mouse.move(box.x + 100, box.y + 100); await page.mouse.down(); await page.mouse.move(box.x + 160, box.y + 130, { steps: 5 }); await page.mouse.up();
  const tr = await page.locator('.crop img').evaluate(e => e.style.transform);
  check('one-pointer pan moves the image and is clamped', /translate\((?!0\.00%,0\.00%)/.test(tr) && /scale\(2(\.0+)?\)/.test(tr), tr);
  await shot('04-photo-sheet');
  await page.click('.sheet >> text=Done'); await page.waitForTimeout(500);
  check('hero image in preview uses the picked file', (await frame().locator('.hero-img img').getAttribute('src')).includes('img-test.png'));
  await page.click('#savebtn'); await page.waitForTimeout(100);

  // section controls
  await page.locator('#preview').contentFrame().locator('[data-sec-handle]').nth(1).click();
  await page.waitForSelector('text=Hide from site');
  await page.click('text=Hide from site'); await page.waitForTimeout(100);
  await page.click('.sheet >> text=Done'); await page.waitForTimeout(500);
  check('hidden section is dimmed in editor', await frame().locator('.is-hidden').count() === 1);
  // theme
  await page.click('.tabs >> text=Look'); await page.click('.swatch >> nth=2'); await page.waitForTimeout(100);
  await page.click('.sheet >> text=Done'); await page.waitForTimeout(400);
  check('palette applied to preview', (await frame().locator('body').evaluate(b => getComputedStyle(b).backgroundColor)) === 'rgb(246, 250, 253)');
  await shot('05-theme');
  await page.click('#savebtn');

  // leave with unsaved changes -> prompt
  await frame().locator('h1').click(); await page.fill('.sheet input', 'Unsaved title'); await page.click('.sheet >> text=Done');
  await page.click('button[aria-label="Back to My Websites"]');
  await page.waitForSelector('text=Unsaved changes'); await shot('06-unsaved-prompt');
  await page.click('.sheet >> text=Discard');
  await page.waitForSelector('text=My Websites');
  check('dashboard lists the website as Not published', await page.locator('.badge:has-text("Not published")').count() === 1, String(await page.locator('text=Not published').count()));

  // reopen: persistence round trip
  await page.click('text=Open');
  await frame().locator('h1').waitFor();
  check('reopen keeps saved edits and drops discarded ones', (await frame().locator('h1').innerText()) === "Joe's Plumbing & Heating");

  // preview mode has no edit chrome
  await page.click('.tabs >> text=Preview'); await page.waitForTimeout(300);
  check('preview mode has no edit handles', await frame().locator('[data-sec-handle]').count() === 0); await shot('07-preview');
  await page.click('.tabs >> text=Back to editing');

  // publish flow (mock native): cannot publish before token, site, approval
  await page.click('.tabs >> text=Publish'); await page.waitForSelector('text=Review and publish');
  check('publish disabled before token/site/approval', await page.locator('button:has-text("Publish to my live site")').isDisabled());
  await page.fill('input[placeholder="Netlify personal access token"]', 'tok'); await page.click('text=Save and check');
  await page.waitForSelector('text=A token is saved');
  await page.click('text=Create new Netlify site'); await page.waitForSelector('text=publishes to the same Netlify site');
  check('publish still disabled until approved', await page.locator('button:has-text("Publish to my live site")').isDisabled());
  await page.check('#approve');
  check('publish enabled after approval', await page.locator('button:has-text("Publish to my live site")').isEnabled()); await shot('08-publish');
  await page.click('text=Publish to my live site'); await page.waitForSelector('text=Netlify reports this deploy is ready');
  const pubCall = await page.evaluate(() => window.__calls.find(c => c.m === 'publish').a);
  check('publish sends the site files and referenced assets', pubCall.siteId === 'mocksite1' && pubCall.files['index.html'].includes('<!doctype html>') && pubCall.assets.includes('img-test.png') && !pubCall.files['index.html'].includes('data-path'));
  await page.click('button[aria-label="Back to editor"]');
  await page.click('button[aria-label="Back to My Websites"]');
  await page.waitForSelector('text=My Websites');
  check('dashboard shows Published + URL', await page.locator('.badge:has-text("Published")').count() === 1 && await page.locator('a[href="https://mock-site.netlify.app"]').count() === 1);

  // edit again -> unpublished changes -> republish to SAME site
  await page.click('text=Open'); await frame().locator('h1').waitFor();
  await frame().locator('h1').click(); await page.fill('.sheet input', 'Joe\'s Plumbing (new hours)'); await page.click('.sheet >> text=Done'); await page.click('#savebtn');
  await page.click('button[aria-label="Back to My Websites"]'); await page.waitForSelector('text=My Websites');
  check('dashboard flags Unpublished changes', await page.locator('.badge:has-text("Unpublished changes")').count() === 1); await shot('09-dashboard-changes');
  await page.click('text=Open'); await frame().locator('h1').waitFor();
  await page.click('.tabs >> text=Publish'); await page.waitForSelector('text=Review and publish');
  check('site link is retained (no new site offered)', await page.locator('text=Create new Netlify site').count() === 0);
  await page.check('#approve'); await page.click('text=Publish to my live site'); await page.waitForSelector('text=Netlify reports this deploy is ready');
  const pubs = await page.evaluate(() => window.__calls.filter(c => c.m === 'publish').map(c => c.a.siteId));
  const creates = await page.evaluate(() => window.__calls.filter(c => c.m === 'createSite').length);
  check('republish targets the same site id, one createSite total', pubs.length === 2 && pubs[0] === pubs[1] && creates === 1, JSON.stringify({ pubs, creates }));

  // versions & restore
  await page.click('button[aria-label="Back to editor"]'); await page.click('.tabs >> text=More'); await page.click('text=Version history & restore');
  await page.waitForSelector('text=Restore this version'); await shot('10-versions');
  await page.locator('text=Restore this version').first().click(); await page.click('.sheet button:text-is("Restore")');
  await frame().locator('h1').waitFor({ timeout: 5000 });
  check('restore returns to the editor with older content', (await frame().locator('h1').innerText()) !== "Joe's Plumbing (new hours)");

  check('no uncaught page errors', errors.length === 0, errors.join(' | '));
  await browser.close(); server.close();
  console.log(failures ? failures + ' FAILED' : 'ALL UI SMOKE CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
