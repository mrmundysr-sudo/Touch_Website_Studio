/* Touch Website Studio - UI. Talks to Android through window.Native (see MainActivity.Bridge). */
(function () {
  'use strict';
  var S = window.Site;
  var app = document.getElementById('app');
  var toastEl = document.getElementById('toast');

  // ---------------- native bridge ----------------
  var pending = {}, seq = 0, listeners = {};
  window.__nativeResult = function (id, ok, payload) {
    var p = pending[id]; delete pending[id];
    if (!p) return;
    var v; try { v = payload ? JSON.parse(payload) : {}; } catch (e) { v = payload; }
    if (ok) p.res(v);
    else { var err = new Error((v && v.message) || 'Native error'); if (v && typeof v === 'object') { err.kind = v.kind; err.status = v.status; } p.rej(err); }
  };
  window.__nativeEvent = function (name, payload) {
    var fn = listeners[name];
    if (fn) { try { fn(JSON.parse(payload)); } catch (e) { /* ignore malformed event */ } }
  };
  function native(method, args) {
    return new Promise(function (res, rej) {
      if (!window.Native) { rej(new Error('This build is not running inside the Android app.')); return; }
      var id = 'c' + (++seq);
      pending[id] = { res: res, rej: rej };
      window.Native.invoke(id, method, JSON.stringify(args || {}));
    });
  }

  // ---------------- tiny DOM helpers ----------------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  function mount(node) { app.innerHTML = ''; app.appendChild(node); }
  var toastTimer;
  function toast(msg, bad) {
    toastEl.textContent = msg; toastEl.className = bad ? 'bad' : ''; toastEl.style.display = 'block';
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.style.display = 'none'; }, bad ? 6000 : 2600);
  }
  function fmt(ts) { try { return new Date(ts).toLocaleString(); } catch (e) { return ''; } }
  function bar(title, left, right) { return h('div', { class: 'bar' }, left, h('h1', { text: title }), right); }

  // ---------------- sheets & dialogs ----------------
  var sheets = [];
  function sheet(build, opts) {
    var scrim = h('div', { class: 'scrim' });
    var box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
    scrim.appendChild(box);
    var api = { close: function () { if (scrim.parentNode) scrim.parentNode.removeChild(scrim); sheets = sheets.filter(function (s) { return s !== api; }); if (opts && opts.onClose) opts.onClose(); } };
    scrim.addEventListener('click', function (e) { if (e.target === scrim) api.close(); });
    build(box, api);
    document.body.appendChild(scrim);
    sheets.push(api);
    return api;
  }
  function ask(title, message, buttons) {
    return new Promise(function (resolve) {
      sheet(function (box, api) {
        box.appendChild(h('h2', { text: title }));
        if (message) box.appendChild(h('p', { text: message }));
        box.appendChild(h('div', { class: 'btns' }, buttons.map(function (b) {
          return h('button', { class: b.cls || 'sec', text: b.label, onclick: function () { api.close(); resolve(b.value); } });
        })));
      }, { onClose: function () { resolve(undefined); } });
    });
  }
  function prompt1(title, value, label) {
    return new Promise(function (resolve) {
      var done = false;
      sheet(function (box, api) {
        var input = h('input', { type: 'text', value: value || '', 'aria-label': label || title });
        box.appendChild(h('h2', { text: title }));
        box.appendChild(input);
        box.appendChild(h('div', { class: 'btns' },
          h('button', { class: 'sec', text: 'Cancel', onclick: function () { api.close(); } }),
          h('button', { text: 'OK', onclick: function () { done = true; api.close(); resolve(input.value.trim()); } })));
        setTimeout(function () { input.focus(); input.select(); }, 50);
      }, { onClose: function () { if (!done) resolve(null); } });
    });
  }

  // ---------------- state ----------------
  var st = { view: 'dash', projects: [], p: null, dirty: false, preview: false, info: {} };
  var previewTimer = null;

  function go(view) { st.view = view; st.onToken = null; show(); }
  function show() {
    sheets.slice().forEach(function (s) { s.close(); });
    ({ dash: viewDash, templates: viewTemplates, editor: viewEditor, publish: viewPublish, versions: viewVersions, token: viewToken })[st.view]();
  }

  // ---------------- dashboard ----------------
  function statusOf(item) {
    if (item.corrupt) return { text: 'Unreadable', cls: 'bad' };
    if (!item.siteId) return { text: 'Not published', cls: '' };
    if (!item.publishedHash) return { text: 'Site linked, not published yet', cls: 'warn' };
    if (item.publishedHash !== item.contentHash) return { text: 'Unpublished changes', cls: 'warn' };
    return { text: 'Published', cls: 'ok' };
  }

  function viewDash() {
    var list = h('div', { class: 'page' }, h('p', { class: 'muted', text: 'Loading…' }));
    mount(h('div', { style: 'display:flex;flex-direction:column;height:100%' },
      bar('My Websites', null, h('button', { text: 'Netlify', 'aria-label': 'Netlify account settings', onclick: function () { go('token'); } })),
      list));
    native('listProjects').then(function (items) {
      st.projects = items;
      list.innerHTML = '';
      list.appendChild(h('div', { class: 'row', style: 'margin-bottom:14px' },
        h('button', { class: 'gold grow', text: '+ New website', onclick: function () { go('templates'); } }),
        h('button', { class: 'sec', text: 'Import project ZIP', onclick: importZip })));
      if (!items.length) list.appendChild(h('div', { class: 'empty' }, h('h2', { text: 'No websites yet' }), h('p', { class: 'muted', text: 'Start from a template. Everything is saved on this phone and you own it.' })));
      items.forEach(function (it) { list.appendChild(projectCard(it)); });
    }).catch(function (e) { list.innerHTML = ''; list.appendChild(h('div', { class: 'errbox', text: 'Could not load websites: ' + e.message })); });
  }

  function projectCard(it) {
    var s = statusOf(it);
    return h('div', { class: 'card' },
      h('h2', { text: it.name }),
      h('div', { class: 'row' }, h('span', { class: 'badge ' + s.cls, text: s.text }), h('span', { class: 'muted', text: 'Saved ' + fmt(it.updatedAt) })),
      it.publishedUrl ? h('p', { class: 'muted url' }, 'Live: ', h('a', { href: it.publishedUrl, text: it.publishedUrl })) : null,
      h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { class: 'grow', text: 'Open', disabled: it.corrupt, onclick: function () { openProject(it.id); } }),
        h('button', { class: 'sec', text: 'Rename', onclick: function () { renameFromDash(it); } }),
        h('button', { class: 'sec', text: 'Duplicate', onclick: function () { duplicate(it); } }),
        h('button', { class: 'danger', text: 'Delete', onclick: function () { remove(it); } })));
  }

  function renameFromDash(it) {
    prompt1('Rename website', it.name).then(function (name) {
      if (!name) return;
      return native('loadProject', { id: it.id }).then(function (j) {
        var p = JSON.parse(j); p.name = name; p.updatedAt = Date.now();
        return native('saveProject', { id: it.id, json: JSON.stringify(p) });
      }).then(viewDash);
    }).catch(function (e) { toast(e.message, true); });
  }
  function duplicate(it) {
    native('duplicateProject', { id: it.id, name: it.name + ' (copy)' }).then(function () { toast('Duplicated. The copy is not linked to any Netlify site.'); viewDash(); })
      .catch(function (e) { toast(e.message, true); });
  }
  function remove(it) {
    ask('Delete "' + it.name + '"?', 'This permanently deletes the project, its photos and version history from this phone. A published site on Netlify is not touched. Export a project ZIP first if you want a backup.',
      [{ label: 'Cancel', value: false }, { label: 'Delete', value: true, cls: 'danger' }]).then(function (ok) {
      if (!ok) return;
      return native('deleteProject', { id: it.id }).then(function () { toast('Deleted'); viewDash(); });
    }).catch(function (e) { toast(e.message, true); });
  }
  function importZip() {
    native('importProjectZip').then(function (r) {
      if (r.cancelled) return;
      toast('Imported as a new website'); viewDash();
    }).catch(function (e) { toast('Import failed: ' + e.message, true); });
  }

  // ---------------- templates ----------------
  function viewTemplates() {
    var page = h('div', { class: 'page' }, h('p', { class: 'muted', text: 'Both templates use the same editor and the same site structure. Pick a starting point; you can change everything.' }));
    Object.keys(S.TEMPLATES).forEach(function (id) {
      var t = S.TEMPLATES[id];
      page.appendChild(h('button', { class: 'tpl', onclick: function () { createFrom(id); } }, h('b', { text: t.label }), h('span', { class: 'muted', text: t.blurb })));
    });
    mount(h('div', { style: 'display:flex;flex-direction:column;height:100%' }, bar('Choose a template', h('button', { text: '←', 'aria-label': 'Back', onclick: function () { go('dash'); } })), page));
  }
  function createFrom(templateId) {
    native('newId').then(function (r) {
      var p = S.createProject(templateId, r.id, S.TEMPLATES[templateId].label);
      return native('saveProject', { id: p.id, json: JSON.stringify(p) }).then(function () { return openProject(p.id); });
    }).catch(function (e) { toast(e.message, true); });
  }

  // ---------------- editor ----------------
  function openProject(id) {
    return native('loadProject', { id: id }).then(function (j) {
      var p = JSON.parse(j);
      p.publish = p.publish || {};
      st.p = p; st.dirty = false; st.preview = false;
      var draft = readDraft(id);
      if (draft && draft.at > (p.updatedAt || 0)) {
        return ask('Recover unsaved edits?', 'This website has edits from ' + fmt(draft.at) + ' that were never saved.',
          [{ label: 'Discard', value: false }, { label: 'Recover', value: true, cls: '' }]).then(function (yes) {
          if (yes) { try { st.p = JSON.parse(draft.json); st.dirty = true; } catch (e) { toast('Draft was unreadable', true); } }
          else clearDraft(id);
          go('editor');
        });
      }
      go('editor');
    }).catch(function (e) { toast('Could not open: ' + e.message, true); });
  }

  function draftKey(id) { return 'tws-draft:' + id; }
  function readDraft(id) { try { return JSON.parse(localStorage.getItem(draftKey(id))); } catch (e) { return null; } }
  function clearDraft(id) { try { localStorage.removeItem(draftKey(id)); } catch (e) { /* storage unavailable */ } }
  function stashDraft() { if (st.p && st.dirty) { try { localStorage.setItem(draftKey(st.p.id), JSON.stringify({ at: Date.now(), json: JSON.stringify(st.p) })); } catch (e) { /* storage unavailable */ } } }

  function markDirty() { st.dirty = true; updateBar(); schedulePreview(); }
  function updateBar() {
    var b = document.getElementById('savebtn');
    if (b) { b.textContent = st.dirty ? 'Save' : 'Saved'; b.className = st.dirty ? 'gold' : ''; b.disabled = !st.dirty; }
  }

  function save() {
    var p = st.p;
    p.contentHash = S.contentHash(p); p.updatedAt = Date.now();
    return native('saveProject', { id: p.id, json: JSON.stringify(p) }).then(function () {
      st.dirty = false; clearDraft(p.id); updateBar(); toast('Saved on this phone. Not published.');
    }).catch(function (e) { toast('Save failed: ' + e.message, true); throw e; });
  }

  function previewBase() { return location.origin + '/p/' + st.p.id + '/'; }
  function inlineDoc(r) {
    return r.html.replace('<link rel="stylesheet" href="style.css">', function () { return '<style>' + r.files['style.css'] + '</style>'; })
      .replace('<script src="script.js"></script>', function () { return '<script>' + r.files['script.js'] + '<\/script>'; });
  }
  function currentDoc() {
    var r = S.render(st.p, { edit: !st.preview, base: previewBase() });
    return st.preview ? inlineDoc(r) : r.html;
  }
  function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(refreshPreview, 250); }
  function refreshPreview() {
    var f = document.getElementById('preview');
    if (!f) return;
    var y = 0; try { y = f.contentWindow.scrollY; } catch (e) { /* not ready */ }
    f.onload = function () { try { f.contentWindow.scrollTo(0, y); } catch (e) { /* ignore */ } };
    f.srcdoc = currentDoc();
  }

  function viewEditor() {
    var p = st.p;
    var iframe = h('iframe', { id: 'preview', title: 'Website preview', sandbox: 'allow-scripts allow-same-origin' });
    var tabs = st.preview ? h('div', { class: 'tabs' }, tab('✎', 'Back to editing', function () { st.preview = false; viewEditor(); }))
      : h('div', { class: 'tabs' },
        tab('🎨', 'Look', openTheme), tab('＋', 'Section', openAddSection), tab('👁', 'Preview', function () { st.preview = true; viewEditor(); }),
        tab('🚀', 'Publish', function () { go('publish'); }), tab('⋯', 'More', openMore));
    mount(h('div', { style: 'display:flex;flex-direction:column;height:100%' },
      bar(p.name, h('button', { text: '←', 'aria-label': 'Back to My Websites', onclick: leaveEditor }),
        st.preview ? h('span', { class: 'badge', text: 'Preview' }) : h('button', { id: 'savebtn', text: 'Saved', onclick: function () { save(); } })),
      h('div', { id: 'stage' }, iframe), tabs));
    updateBar();
    iframe.srcdoc = currentDoc();
    if (!st.preview) setHint();
  }
  function setHint() { if (!st.hintShown) { st.hintShown = true; toast('Tap any text or photo to edit it. Use the ⋯ chip on a section for more options.'); } }
  function tab(icon, label, fn) { return h('button', { onclick: fn, 'aria-label': label }, h('span', { class: 'i', text: icon }), label); }

  window.addEventListener('message', function (e) {
    var f = document.getElementById('preview');
    if (!f || e.source !== f.contentWindow || !e.data || st.view !== 'editor' || st.preview) return;
    if (e.data.t === 'edit') openField(e.data.path, e.data.kind);
    else if (e.data.t === 'section') openSection(e.data.id);
  });

  function leaveEditor() {
    if (!st.dirty) { clearDraft(st.p.id); return go('dash'); }
    ask('Unsaved changes', 'Save your edits before leaving?', [
      { label: 'Keep editing', value: 'stay' }, { label: 'Discard', value: 'discard', cls: 'danger' }, { label: 'Save', value: 'save', cls: '' }]).then(function (v) {
      if (v === 'save') save().then(function () { go('dash'); }).catch(function () { /* toast shown */ });
      else if (v === 'discard') { clearDraft(st.p.id); st.dirty = false; go('dash'); }
    });
  }

  // ---- field editing ----
  function openField(path, kind) {
    if (kind === 'image') return openImage(path);
    var val = S.getPath(st.p, path);
    var label = path.split('.').slice(-1)[0];
    sheet(function (box, api) {
      var long = kind === 'long';
      var input = long ? h('textarea', { 'aria-label': label }) : h('input', { type: kind === 'url' ? 'url' : 'text', 'aria-label': label });
      input.value = val == null ? '' : val;
      input.addEventListener('input', function () { S.setPath(st.p, path, input.value); markDirty(); });
      box.appendChild(h('h2', { text: kind === 'url' ? 'Button link' : 'Edit text' }));
      if (kind === 'url') box.appendChild(h('p', { class: 'muted', text: 'Use #contact to scroll to a section, a web address (https://…), mailto:you@example.com or tel:5550100.' }));
      box.appendChild(input);
      if (long) box.appendChild(h('p', { class: 'muted', text: 'Leave a blank line between paragraphs.' }));
      box.appendChild(h('div', { class: 'btns one' }, h('button', { text: 'Done', onclick: api.close })));
      setTimeout(function () { input.focus(); }, 60);
    });
  }

  function openImage(path) {
    var img = S.getPath(st.p, path);
    if (!img || typeof img !== 'object') { img = S.emptyImage(); S.setPath(st.p, path, img); }
    sheet(function (box, api) {
      var frame = h('div', { class: 'crop', 'aria-label': 'Photo framing area. Drag with one finger to move, pinch to zoom.' });
      var zoom = h('input', { type: 'range', min: '1', max: '4', step: '0.01', 'aria-label': 'Zoom' });
      var alt = h('input', { type: 'text', placeholder: 'Describe the photo (for screen readers)', value: img.alt || '' });
      var imgEl = null;
      function paint() {
        frame.innerHTML = '';
        if (img.file) {
          imgEl = h('img', { src: previewBase() + 'assets/' + img.file, alt: '', draggable: 'false' });
          frame.appendChild(imgEl); applyTransform();
        } else { imgEl = null; frame.appendChild(h('div', { class: 'ph', text: 'No photo yet' })); }
        zoom.value = img.z || 1; zoom.disabled = !img.file;
      }
      function applyTransform() {
        var c = S.clampCrop(img); img.x = c.x; img.y = c.y; img.z = c.z;
        if (imgEl) imgEl.style.transform = 'translate(' + c.x.toFixed(2) + '%,' + c.y.toFixed(2) + '%) scale(' + c.z.toFixed(3) + ')';
        zoom.value = c.z;
        var f = document.getElementById('preview');
        try {
          var t = f.contentDocument.querySelector('[data-path="' + path + '"] img');
          if (t) t.style.transform = imgEl.style.transform;
        } catch (e) { /* preview not ready */ }
      }
      // One-finger pan, two-finger pinch, slider for one-handed zoom.
      var ptrs = {}, lastDist = 0;
      frame.addEventListener('pointerdown', function (e) { if (!img.file) return; frame.setPointerCapture(e.pointerId); ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; lastDist = 0; });
      frame.addEventListener('pointermove', function (e) {
        var p0 = ptrs[e.pointerId]; if (!p0 || !img.file) return;
        var ids = Object.keys(ptrs), r = frame.getBoundingClientRect();
        if (ids.length === 1) {
          img.x += (e.clientX - p0.x) / r.width * 100; img.y += (e.clientY - p0.y) / r.height * 100;
        } else if (ids.length === 2) {
          ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
          var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (lastDist) img.z = (img.z || 1) * (d / lastDist);
          lastDist = d;
        }
        ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
        applyTransform(); st.dirty = true; updateBar();
      });
      function up(e) { delete ptrs[e.pointerId]; lastDist = 0; }
      frame.addEventListener('pointerup', up); frame.addEventListener('pointercancel', up);
      zoom.addEventListener('input', function () { img.z = parseFloat(zoom.value); applyTransform(); st.dirty = true; updateBar(); });
      alt.addEventListener('input', function () { img.alt = alt.value; st.dirty = true; updateBar(); });
      paint();
      box.appendChild(h('h2', { text: 'Photo' }));
      box.appendChild(frame);
      box.appendChild(h('label', { text: 'Zoom' })); box.appendChild(zoom);
      box.appendChild(h('label', { text: 'Description' })); box.appendChild(alt);
      box.appendChild(h('div', { class: 'btns' },
        h('button', { class: 'gold', text: img.file ? 'Replace photo' : 'Choose photo', onclick: function () {
          native('pickImage', { id: st.p.id }).then(function (r) {
            if (r.cancelled) return;
            img.file = r.file; img.x = 0; img.y = 0; img.z = 1; paint(); markDirty();
          }).catch(function (e) { toast('Could not add photo: ' + e.message, true); });
        } }),
        h('button', { class: 'sec', text: 'Reset framing', onclick: function () { img.x = 0; img.y = 0; img.z = 1; applyTransform(); markDirty(); } }),
        h('button', { class: 'danger', text: 'Remove photo', onclick: function () { img.file = null; img.x = 0; img.y = 0; img.z = 1; paint(); markDirty(); } }),
        h('button', { text: 'Done', onclick: api.close })));
    }, { onClose: function () { schedulePreview(); } });
  }

  // ---- sections ----
  function openSection(id) {
    var p = st.p, idx = S.indexOfSection(p, id); if (idx < 0) return;
    var s = p.sections[idx];
    sheet(function (box, api) {
      function act(fn) { return function () { fn(); markDirty(); api.close(); if (st.view === 'editor') openSection(id); }; }
      box.appendChild(h('h2', { text: (S.SECTION_TYPES[s.type] || { label: s.type }).label }));
      box.appendChild(h('div', { class: 'btns' },
        h('button', { class: 'sec', text: '↑ Move up', disabled: idx === 0, onclick: act(function () { S.moveSection(p, id, -1); }) }),
        h('button', { class: 'sec', text: '↓ Move down', disabled: idx === p.sections.length - 1, onclick: act(function () { S.moveSection(p, id, 1); }) }),
        h('button', { class: 'sec', text: s.visible === false ? 'Show on site' : 'Hide from site', onclick: act(function () { s.visible = s.visible === false; }) }),
        h('button', { class: 'sec', text: 'Duplicate', onclick: function () { S.duplicateSection(p, id); markDirty(); api.close(); } })));
      if (s.type === 'cards' || s.type === 'gallery') {
        box.appendChild(h('label', { text: s.type === 'cards' ? 'Cards' : 'Photos' }));
        (s.items || []).forEach(function (it, j) {
          box.appendChild(h('div', { class: 'row', style: 'margin-bottom:6px' },
            h('span', { class: 'grow', text: (s.type === 'cards' ? (it.title || 'Card') : (it.caption || 'Photo')) + ' #' + (j + 1) }),
            h('button', { class: 'danger', text: 'Remove', 'aria-label': 'Remove item ' + (j + 1), onclick: act(function () { S.removeItem(s, j); }) })));
        });
        box.appendChild(h('div', { class: 'btns one' }, h('button', { class: 'sec', text: s.type === 'cards' ? '+ Add card' : '+ Add photo', onclick: act(function () { S.addItem(s); }) })));
      }
      box.appendChild(h('div', { class: 'btns' },
        h('button', { class: 'danger', text: 'Delete section', onclick: function () {
          ask('Delete this section?', 'You can get it back from Versions if you saved before.', [{ label: 'Cancel', value: false }, { label: 'Delete', value: true, cls: 'danger' }]).then(function (ok) {
            if (ok) { S.removeSection(p, id); markDirty(); api.close(); }
          });
        } }),
        h('button', { text: 'Done', onclick: api.close })));
    });
  }

  function openAddSection() {
    sheet(function (box, api) {
      box.appendChild(h('h2', { text: 'Add a section' }));
      box.appendChild(h('div', { class: 'btns one' }, Object.keys(S.SECTION_TYPES).map(function (t) {
        return h('button', { class: 'sec', text: S.SECTION_TYPES[t].label, onclick: function () {
          var s = S.newSection(t); st.p.sections.push(s); markDirty(); api.close();
          toast('Section added at the bottom. Open its ⋯ chip to move it.');
        } });
      })));
    });
  }

  // ---- theme ----
  var PALETTES = [
    { n: 'Forest', primary: '#1F5C4D', accent: '#E0A030', bg: '#FBF8F2', text: '#23302C' },
    { n: 'Terracotta', primary: '#B4472F', accent: '#2F7486', bg: '#FFF9F2', text: '#33261F' },
    { n: 'Ocean', primary: '#1D4E89', accent: '#F4A261', bg: '#F6FAFD', text: '#1B2733' },
    { n: 'Plum', primary: '#6B2D5C', accent: '#F2B84B', bg: '#FBF6FA', text: '#2C1A28' },
    { n: 'Slate', primary: '#2F3E46', accent: '#84A98C', bg: '#F5F7F6', text: '#1F2A30' },
    { n: 'Night', primary: '#111827', accent: '#FBBF24', bg: '#1F2937', text: '#F3F4F6' }
  ];
  function openTheme() {
    var p = st.p;
    sheet(function (box, api) {
      function colorInput(key, label) {
        var i = h('input', { type: 'color', value: p.theme[key], 'aria-label': label });
        i.addEventListener('input', function () { p.theme[key] = i.value; markDirty(); });
        return h('div', null, h('label', { text: label }), i);
      }
      box.appendChild(h('h2', { text: 'Look and feel' }));
      box.appendChild(h('div', { class: 'swatches' }, PALETTES.map(function (pl) {
        return h('button', { class: 'swatch', 'aria-label': pl.n + ' palette', style: '--a:' + pl.primary + ';--b:' + pl.accent, onclick: function () {
          p.theme.primary = pl.primary; p.theme.accent = pl.accent; p.theme.bg = pl.bg; p.theme.text = pl.text; markDirty(); api.close(); openTheme();
        } });
      })));
      box.appendChild(h('div', { class: 'colors' }, colorInput('primary', 'Main colour'), colorInput('accent', 'Accent colour'), colorInput('bg', 'Background'), colorInput('text', 'Text colour')));
      var font = h('select', { 'aria-label': 'Font style' }, Object.keys(S.FONTS).map(function (k) { return h('option', { value: k, text: { sans: 'Clean sans-serif', serif: 'Classic serif', rounded: 'Friendly rounded' }[k], selected: p.theme.font === k }); }));
      font.addEventListener('change', function () { p.theme.font = font.value; markDirty(); });
      box.appendChild(h('label', { text: 'Font style' })); box.appendChild(font);
      function field(label, path, long) {
        var i = long ? h('textarea', { style: 'min-height:70px' }) : h('input', { type: 'text' });
        i.value = S.getPath(p, path) || '';
        i.addEventListener('input', function () { S.setPath(p, path, i.value); markDirty(); });
        box.appendChild(h('label', { text: label })); box.appendChild(i);
      }
      field('Website title', 'site.title'); field('Search description', 'site.description', true); field('Footer text', 'site.footer');
      box.appendChild(h('div', { class: 'btns one' }, h('button', { text: 'Done', onclick: api.close })));
    });
  }

  // ---- more menu ----
  function openMore() {
    sheet(function (box, api) {
      function item(label, fn, cls) { return h('button', { class: cls || 'sec', text: label, onclick: function () { api.close(); fn(); } }); }
      box.appendChild(h('h2', { text: 'More' }));
      box.appendChild(h('div', { class: 'btns one' },
        item('Rename website', function () { prompt1('Rename website', st.p.name).then(function (n) { if (n) { st.p.name = n; markDirty(); viewEditor(); } }); }),
        item('Version history & restore', function () { go('versions'); }),
        item('Export website ZIP (deployable HTML/CSS/JS)', exportSite),
        item('Export project ZIP (editable, for backup)', exportProject),
        item('Share project with an AI app (optional)', shareAi),
        item('Back to My Websites', leaveEditor)));
    });
  }
  function needSaved() { if (st.dirty) { toast('Save your changes first.', true); return false; } return true; }
  function siteBundle() { var r = S.render(st.p, {}); return { files: r.files, assets: r.assets, warnings: r.warnings }; }
  function exportSite() {
    if (!needSaved()) return;
    var b = siteBundle();
    native('exportSiteZip', { id: st.p.id, name: st.p.name, files: b.files, assets: b.assets }).then(function (r) { if (!r.cancelled) toast('Website ZIP saved. Upload it to any host, or use Publish.'); })
      .catch(function (e) { toast('Export failed: ' + e.message, true); });
  }
  function exportProject() {
    if (!needSaved()) return;
    native('exportProjectZip', { id: st.p.id, name: st.p.name }).then(function (r) { if (!r.cancelled) toast('Project ZIP saved.'); })
      .catch(function (e) { toast('Export failed: ' + e.message, true); });
  }
  function shareAi() {
    if (!needSaved()) return;
    var prompt = 'I am sharing a Touch Website Studio project ZIP. It contains project.json (the site content, theme and sections) and an assets folder of photos.\n' +
      'Please improve the wording of the text fields in project.json (title, subtitle, body, text, caption, etc.) as I describe below. Do NOT rename or remove any "id", "type", "file" or "visible" keys, do not change the photo file names, and keep the JSON valid.\n' +
      'Send back the complete ZIP with the same structure so I can import it as a new website in Touch Website Studio.\n\nWhat I want changed: ';
    native('shareForAi', { id: st.p.id, prompt: prompt }).then(function () { toast('Share sheet opened. Nothing is sent unless you pick an app.'); })
      .catch(function (e) { toast('Could not share: ' + e.message, true); });
  }

  // ---------------- versions ----------------
  function viewVersions() {
    var page = h('div', { class: 'page' }, h('p', { class: 'muted', text: 'Loading…' }));
    mount(h('div', { style: 'display:flex;flex-direction:column;height:100%' }, bar('Version history', h('button', { text: '←', 'aria-label': 'Back', onclick: function () { go('editor'); } })), page));
    native('listVersions', { id: st.p.id }).then(function (vs) {
      page.innerHTML = '';
      page.appendChild(h('p', { class: 'muted', text: 'A snapshot is kept automatically each time you save changed content. Restoring never deletes anything: your current version is snapshotted first, and photos are kept.' }));
      if (!vs.length) page.appendChild(h('div', { class: 'empty', text: 'No earlier versions yet. They appear after you save changes.' }));
      vs.forEach(function (v) {
        page.appendChild(h('div', { class: 'card' }, h('b', { text: fmt(v.ts) }), h('div', { class: 'muted', text: v.label }),
          h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'sec', text: 'Restore this version', onclick: function () { restore(v); } }))));
      });
    }).catch(function (e) { page.innerHTML = ''; page.appendChild(h('div', { class: 'errbox', text: e.message })); });
  }
  function restore(v) {
    ask('Restore this version?', 'Your current version is saved as a snapshot first, so you can come back to it. This does not publish anything.', [{ label: 'Cancel', value: false }, { label: 'Restore', value: true }]).then(function (ok) {
      if (!ok) return;
      var chain = st.dirty ? save() : Promise.resolve();
      return chain.then(function () { return native('loadVersion', { id: st.p.id, file: v.file }); }).then(function (j) {
        var old = JSON.parse(j), cur = st.p;
        old.id = cur.id; old.name = cur.name; old.publish = cur.publish; // publish link and name are not part of a version
        old.contentHash = S.contentHash(old); old.updatedAt = Date.now();
        return native('saveProject', { id: cur.id, json: JSON.stringify(old) }).then(function () { st.p = old; st.dirty = false; toast('Restored. Not published.'); go('editor'); });
      });
    }).catch(function (e) { toast('Restore failed: ' + e.message, true); });
  }

  // ---------------- Netlify account ----------------
  function viewToken() {
    var page = h('div', { class: 'page' });
    mount(h('div', { style: 'display:flex;flex-direction:column;height:100%' }, bar('Netlify account', h('button', { text: '←', 'aria-label': 'Back', onclick: function () { go(st.p && st.fromPublish ? 'publish' : 'dash'); } })), page));
    tokenCard(page, function () { viewToken(); });
  }

  function tokenCard(container, refresh) {
    var card = h('div', { class: 'card' }, h('h2', { text: 'Your Netlify account' }), h('p', { class: 'muted', text: 'Checking…' }));
    container.appendChild(card);
    native('tokenStatus').then(function (s) {
      card.innerHTML = ''; card.appendChild(h('h2', { text: 'Your Netlify account' }));
      st.hasToken = s.hasToken; if (st.onToken) st.onToken();
      var input = h('input', { type: 'password', placeholder: 'Netlify personal access token', autocomplete: 'off', 'aria-label': 'Netlify personal access token' });
      var msg = h('div');
      if (s.hasToken) {
        card.appendChild(h('div', { class: 'okbox', text: 'A token is saved on this phone (encrypted with the Android Keystore).' }));
        card.appendChild(h('div', { class: 'row' },
          h('button', { class: 'sec', text: 'Check connection', onclick: function () {
            msg.innerHTML = ''; msg.appendChild(h('p', { class: 'muted', text: 'Contacting Netlify…' }));
            native('verifyToken').then(function (u) { msg.innerHTML = ''; msg.appendChild(h('div', { class: 'okbox', text: 'Connected to Netlify as ' + (u.email || u.name || 'your account') + '.' })); })
              .catch(function (e) { msg.innerHTML = ''; msg.appendChild(h('div', { class: 'errbox', text: e.message })); });
          } }),
          h('button', { class: 'danger', text: 'Remove token', onclick: function () { native('clearToken').then(function () { toast('Token removed'); refresh(); }); } })));
      } else {
        card.appendChild(h('p', { class: 'muted', text: 'Publishing uses your own Netlify account. In Netlify choose User settings → Applications → Personal access tokens → New access token, then paste it here. The token is stored encrypted on this phone only; it is never put in a project, ZIP or the cloud by this app.' }));
        card.appendChild(input);
        card.appendChild(h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { text: 'Save and check', onclick: function () {
          var t = input.value.trim(); if (!t) { toast('Paste a token first', true); return; }
          msg.innerHTML = ''; msg.appendChild(h('p', { class: 'muted', text: 'Saving and contacting Netlify…' }));
          native('setToken', { token: t }).then(function () { return native('verifyToken'); }).then(function (u) {
            toast('Connected as ' + (u.email || u.name || 'your account')); refresh();
          }).catch(function (e) {
            if (e.kind === 'auth') native('clearToken');
            msg.innerHTML = ''; msg.appendChild(h('div', { class: 'errbox', text: (e.kind === 'auth' ? 'Token rejected and not kept. ' : 'Token saved, but Netlify could not be reached: ') + e.message }));
          });
        } })));
      }
      card.appendChild(msg);
    }).catch(function (e) { card.appendChild(h('div', { class: 'errbox', text: e.message })); });
  }

  // ---------------- publish ----------------
  function viewPublish() {
    var p = st.p, pub = p.publish = p.publish || {};
    st.fromPublish = true;
    var page = h('div', { class: 'page' });
    mount(h('div', { style: 'display:flex;flex-direction:column;height:100%' }, bar('Publish', h('button', { text: '←', 'aria-label': 'Back to editor', onclick: function () { st.fromPublish = false; go('editor'); } })), page));

    var state = S.publishState(p);
    var bundle = siteBundle();
    page.appendChild(h('div', { class: 'card' }, h('h2', { text: 'Status' }),
      h('div', { class: 'row' }, h('span', { class: 'badge ' + (st.dirty ? 'bad' : 'ok'), text: st.dirty ? 'Unsaved edits' : 'Saved' }),
        h('span', { class: 'badge ' + ({ current: 'ok', changes: 'warn', never: '', 'linked-unpublished': 'warn' }[state]), text: { current: 'Live site is up to date', changes: 'Unpublished changes', never: 'Not published', 'linked-unpublished': 'Site linked, nothing published yet' }[state] })),
      pub.url ? h('p', { class: 'url' }, 'Live address: ', h('a', { href: pub.url, text: pub.url })) : null,
      pub.lastDeployAt ? h('p', { class: 'muted', text: 'Last publish: ' + fmt(pub.lastDeployAt) }) : null,
      pub.lastError ? h('div', { class: 'errbox', text: 'Last attempt failed: ' + pub.lastError }) : null,
      bundle.warnings.map(function (w) { return h('div', { class: 'warnbox', text: w }); }),
      st.dirty ? h('div', { class: 'row' }, h('button', { text: 'Save now', onclick: function () { save().then(viewPublish); } })) : null));

    var tokenHolder = h('div'); page.appendChild(tokenHolder);
    tokenCard(tokenHolder, viewPublish);

    // site link card
    var siteCard = h('div', { class: 'card' }, h('h2', { text: 'Netlify site' }));
    page.appendChild(siteCard);
    if (pub.siteId) {
      siteCard.appendChild(h('p', { text: 'This website publishes to the same Netlify site every time (site ID ' + pub.siteId + '). Republishing updates that address; it does not create a new one.' }));
    } else {
      var nameIn = h('input', { type: 'text', placeholder: 'optional site name, e.g. my-bakery', 'aria-label': 'Optional Netlify site name' });
      var idIn = h('input', { type: 'text', placeholder: 'existing site ID (from Netlify site settings)', 'aria-label': 'Existing Netlify site ID' });
      siteCard.appendChild(h('p', { class: 'muted', text: 'Create a new site in your Netlify account, or link one you already have. Nothing goes live until you approve below.' }));
      siteCard.appendChild(nameIn);
      siteCard.appendChild(h('div', { class: 'row', style: 'margin:8px 0 14px' }, h('button', { text: 'Create new Netlify site', onclick: function () {
        linkAction(native('createSite', { name: nameIn.value.trim() }));
      } })));
      siteCard.appendChild(idIn);
      siteCard.appendChild(h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'sec', text: 'Link existing site', onclick: function () {
        if (!idIn.value.trim()) { toast('Enter a site ID', true); return; }
        linkAction(native('linkSite', { siteId: idIn.value.trim() }));
      } })));
    }
    function linkAction(promise) {
      promise.then(function (s) {
        p.publish = Object.assign({}, p.publish, { siteId: s.siteId, url: s.url, adminUrl: s.adminUrl, lastError: '' });
        return native('updatePublish', { id: p.id, publish: p.publish }).then(function () { toast('Site linked: ' + (s.url || s.siteId)); viewPublish(); });
      }).catch(function (e) { toast(e.message, true); });
    }

    // approval + publish
    var approve = h('input', { type: 'checkbox', id: 'approve' });
    var go1 = h('button', { class: 'gold', text: 'Publish to my live site', disabled: true });
    var log = h('div', { class: 'log', style: 'display:none' });
    var result = h('div');
    function gate() { go1.disabled = !(approve.checked && pub.siteId && st.hasToken && !st.dirty); }
    approve.addEventListener('change', gate);
    st.onToken = gate; gate();
    page.appendChild(h('div', { class: 'card' }, h('h2', { text: 'Review and publish' }),
      h('p', { class: 'muted', text: 'Saving never publishes. Check the preview first; publishing replaces what visitors see at your live address.' }),
      h('div', { class: 'row' }, h('button', { class: 'sec', text: 'Preview site', onclick: function () { st.preview = true; st.fromPublish = false; go('editor'); } })),
      h('label', { class: 'chk', for: 'approve' }, approve, h('span', { text: 'I have previewed my website and approve making these changes live.' })),
      go1, log, result));

    go1.addEventListener('click', function () {
      go1.disabled = true; log.style.display = 'block'; log.textContent = 'Starting…'; result.innerHTML = '';
      listeners.publishProgress = function (e) { log.textContent += '\n' + e.state + ': ' + e.detail; log.scrollTop = log.scrollHeight; };
      var snapshotHash = S.contentHash(p);
      var b = siteBundle();
      native('publish', { id: p.id, siteId: pub.siteId, files: b.files, assets: b.assets }).then(function (r) {
        p.publish = Object.assign({}, p.publish, { url: r.url || p.publish.url, lastDeployId: r.deployId, lastDeployAt: Date.now(), publishedHash: snapshotHash, lastError: '' });
        return native('updatePublish', { id: p.id, publish: p.publish }).then(function () {
          result.appendChild(h('div', { class: 'okbox' }, h('b', { text: 'Netlify reports this deploy is ready.' }), h('p', { class: 'url' }, h('a', { href: p.publish.url, text: p.publish.url }))));
          toast('Published');
        });
      }).catch(function (e) {
        var msg = e.message;
        p.publish = Object.assign({}, p.publish, { lastError: msg });
        native('updatePublish', { id: p.id, publish: p.publish }).catch(function () { /* best effort */ });
        result.appendChild(h('div', { class: 'errbox' }, h('b', { text: 'Publishing did not complete. Your live site was not marked as updated.' }), h('p', { text: msg }),
          h('p', { class: 'muted', text: 'Your website is safe on this phone. You can retry, or export the website ZIP and upload it to Netlify (or any host) yourself.' }),
          h('button', { class: 'sec', text: 'Export website ZIP instead', onclick: exportSite })));
        go1.disabled = false;
      });
    });

    page.appendChild(h('div', { class: 'row', style: 'margin-bottom:24px' }, h('button', { class: 'sec', text: 'Export website ZIP (manual upload)', onclick: exportSite })));
  }

  // ---------------- lifecycle ----------------
  window.studio = {
    back: function () {
      if (sheets.length) { sheets[sheets.length - 1].close(); return true; }
      if (st.view === 'editor') { if (st.preview) { st.preview = false; viewEditor(); } else leaveEditor(); return true; }
      if (st.view === 'publish') { st.fromPublish = false; go('editor'); return true; }
      if (st.view === 'versions') { go('editor'); return true; }
      if (st.view === 'token') { go(st.p && st.fromPublish ? 'publish' : 'dash'); return true; }
      if (st.view === 'templates') { go('dash'); return true; }
      return false;
    },
    onPause: function () { stashDraft(); },
    _state: st
  };

  go('dash');
})();
