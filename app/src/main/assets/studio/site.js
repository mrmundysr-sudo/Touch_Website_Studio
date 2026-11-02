/* Touch Website Studio - site model, templates and renderer.
 * Pure functions (no DOM, no native calls) so the same code runs in the app and in Node tests.
 * One shared schema drives both starter templates. */
(function (root) {
  'use strict';

  var FONTS = {
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    rounded: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif'
  };

  var SECTION_TYPES = {
    hero:    { label: 'Hero banner',  fields: ['title', 'subtitle', 'button', 'buttonLink', 'image'] },
    text:    { label: 'Text + photo', fields: ['title', 'body', 'image'] },
    cards:   { label: 'Cards / services', fields: ['title', 'items'] },
    gallery: { label: 'Photo gallery', fields: ['title', 'items'] },
    contact: { label: 'Contact details', fields: ['title', 'email', 'phone', 'address', 'hours'] }
  };

  function uid(prefix) {
    return (prefix || 'x') + '-' + Math.random().toString(36).slice(2, 8);
  }

  function emptyImage() { return { file: null, x: 0, y: 0, z: 1, alt: '' }; }

  function newSection(type) {
    var s = { id: uid('s'), type: type, visible: true };
    if (type === 'hero') Object.assign(s, { title: 'Your headline', subtitle: 'A short, friendly description.', button: 'Get in touch', buttonLink: '#contact', image: emptyImage() });
    else if (type === 'text') Object.assign(s, { title: 'About', body: 'Tell your story here.', image: emptyImage() });
    else if (type === 'cards') Object.assign(s, { title: 'What we do', items: [newItem('cards')] });
    else if (type === 'gallery') Object.assign(s, { title: 'Gallery', items: [newItem('gallery')] });
    else if (type === 'contact') Object.assign(s, { title: 'Contact', email: '', phone: '', address: '', hours: '' });
    else throw new Error('Unknown section type: ' + type);
    return s;
  }

  function newItem(type) {
    return type === 'gallery' ? { image: emptyImage(), caption: '' } : { title: 'New item', text: 'Describe it here.', image: emptyImage() };
  }

  // ---------- templates (same schema, different starting content/theme) ----------

  var TEMPLATES = {
    business: {
      label: 'Small business',
      blurb: 'Services, gallery and contact details for a local business.',
      build: function () {
        return {
          site: { title: 'Your Business Name', description: 'Friendly, reliable local service.', lang: 'en', footer: 'Your Business Name. All rights reserved.' },
          theme: { primary: '#1F5C4D', accent: '#E0A030', bg: '#FBF8F2', text: '#23302C', font: 'sans' },
          sections: [
            sec('hero', { title: 'Friendly local service you can count on', subtitle: 'Tell visitors what you do and who you do it for, in one or two sentences.', button: 'Contact us', buttonLink: '#contact' }),
            sec('text', { title: 'About us', body: 'Share how long you have been in business, what makes you different, and what customers can expect.\n\nTap any text to edit it.' }),
            sec('cards', { title: 'Our services', items: [
              { title: 'Service one', text: 'A short description of this service.', image: emptyImage() },
              { title: 'Service two', text: 'A short description of this service.', image: emptyImage() },
              { title: 'Service three', text: 'A short description of this service.', image: emptyImage() } ] }),
            sec('gallery', { title: 'Our work', items: [ { image: emptyImage(), caption: '' }, { image: emptyImage(), caption: '' }, { image: emptyImage(), caption: '' } ] }),
            sec('contact', { title: 'Contact', email: 'hello@example.com', phone: '555-0100', address: '123 Main Street', hours: 'Mon-Fri 9am-5pm' })
          ]
        };
      }
    },
    family: {
      label: 'Personal / family',
      blurb: 'A warm home page with your story, photos and updates.',
      build: function () {
        return {
          site: { title: 'Our Family', description: 'News, photos and stories from our family.', lang: 'en', footer: 'Made with love by our family.' },
          theme: { primary: '#B4472F', accent: '#2F7486', bg: '#FFF9F2', text: '#33261F', font: 'serif' },
          sections: [
            sec('hero', { title: 'Welcome to our family corner of the web', subtitle: 'Photos, news and the stories we want to keep.', button: 'Say hello', buttonLink: '#contact' }),
            sec('text', { title: 'Our story', body: 'Write a few lines about who you are, where you live and what matters to you.\n\nTap any text to change it.' }),
            sec('gallery', { title: 'Family moments', items: [ { image: emptyImage(), caption: '' }, { image: emptyImage(), caption: '' }, { image: emptyImage(), caption: '' }, { image: emptyImage(), caption: '' } ] }),
            sec('cards', { title: 'What is new', items: [
              { title: 'Latest news', text: 'Share a recent update.', image: emptyImage() },
              { title: 'Coming up', text: 'An upcoming event or trip.', image: emptyImage() } ] }),
            sec('contact', { title: 'Say hello', email: '', phone: '', address: '', hours: '' })
          ]
        };
      }
    }
  };

  function sec(type, over) { return Object.assign(newSection(type), over); }

  function createProject(templateId, id, name) {
    var t = TEMPLATES[templateId];
    if (!t) throw new Error('Unknown template: ' + templateId);
    var c = t.build();
    var now = Date.now();
    var p = {
      format: 1, id: id, name: name || t.label, template: templateId, createdAt: now, updatedAt: now,
      site: c.site, theme: c.theme, sections: c.sections, publish: {}
    };
    p.contentHash = contentHash(p);
    return p;
  }

  // ---------- change detection ----------

  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }

  function hash32(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8) + str.length.toString(16);
  }

  /** Hash of what visitors would see. Name, history and publish bookkeeping are excluded. */
  function contentHash(p) { return hash32(stable({ site: p.site, theme: p.theme, sections: p.sections })); }

  function publishState(p) {
    var pub = p.publish || {};
    if (!pub.siteId || !pub.publishedHash) return pub.siteId ? 'linked-unpublished' : 'never';
    return pub.publishedHash === contentHash(p) ? 'current' : 'changes';
  }

  // ---------- path helpers ----------

  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function setPath(obj, path, value) {
    var parts = path.split('.'), o = obj;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value;
  }

  // ---------- section operations ----------

  function moveSection(p, id, dir) {
    var i = indexOfSection(p, id), j = i + dir;
    if (i < 0 || j < 0 || j >= p.sections.length) return false;
    var t = p.sections[i]; p.sections[i] = p.sections[j]; p.sections[j] = t;
    return true;
  }
  function indexOfSection(p, id) { for (var i = 0; i < p.sections.length; i++) if (p.sections[i].id === id) return i; return -1; }
  function removeSection(p, id) { var i = indexOfSection(p, id); if (i >= 0) p.sections.splice(i, 1); return i >= 0; }
  function duplicateSection(p, id) {
    var i = indexOfSection(p, id); if (i < 0) return null;
    var c = JSON.parse(JSON.stringify(p.sections[i])); c.id = uid('s');
    p.sections.splice(i + 1, 0, c); return c;
  }
  function addItem(section) {
    if (section.type !== 'cards' && section.type !== 'gallery') return null;
    var it = newItem(section.type); section.items.push(it); return it;
  }
  function removeItem(section, index) { if (section.items && index >= 0 && index < section.items.length) { section.items.splice(index, 1); return true; } return false; }

  // ---------- rendering ----------

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  /** Only http(s), mailto, tel, #anchors and relative links survive; javascript: and friends are dropped. */
  function safeUrl(u) {
    u = String(u == null ? '' : u).trim();
    if (!u) return '';
    if (/^(https?:|mailto:|tel:|#|\/|\.\/)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '';
    return u;
  }

  function clampCrop(img) {
    var z = Math.min(4, Math.max(1, Number(img.z) || 1));
    var lim = (z - 1) / 2 * 100;
    return { z: z, x: Math.max(-lim, Math.min(lim, Number(img.x) || 0)) + 0, y: Math.max(-lim, Math.min(lim, Number(img.y) || 0)) + 0 };
  }

  function render(p, opts) {
    opts = opts || {};
    var edit = !!opts.edit;
    var base = opts.base || '';
    var warnings = [];
    var used = [];

    function attr(path, kind) { return edit ? ' data-path="' + esc(path) + '" data-kind="' + kind + '"' : ''; }

    function text(tag, value, path, cls, kind) {
      var empty = value == null || String(value).trim() === '';
      if (empty && !edit) return '';
      var inner = kind === 'long' ? paragraphs(value) : esc(value);
      return '<' + tag + (cls ? ' class="' + cls + '"' : '') + attr(path, kind || 'text') + '>' + inner + '</' + tag + '>';
    }

    function paragraphs(v) {
      return String(v == null ? '' : v).split(/\n{2,}/).map(function (para) {
        return para.trim() ? '<p>' + esc(para.trim()).replace(/\n/g, '<br>') + '</p>' : '';
      }).join('');
    }

    function image(img, path, cls) {
      img = img || emptyImage();
      if (!img.file) {
        return edit ? '<div class="frame ' + cls + ' ph"' + attr(path, 'image') + '><span>Tap to add a photo</span></div>' : '';
      }
      used.push(img.file);
      var c = clampCrop(img);
      var src = (opts.imageBase !== undefined ? opts.imageBase : 'assets/') + esc(img.file);
      return '<div class="frame ' + cls + '"' + attr(path, 'image') + '><img src="' + src + '" alt="' + esc(img.alt || '') + '" loading="lazy" style="transform:translate(' +
        c.x.toFixed(2) + '%,' + c.y.toFixed(2) + '%) scale(' + c.z.toFixed(3) + ')"></div>';
    }

    function renderSection(s, i) {
      var P = 'sections.' + i + '.';
      var pre = '<section id="' + esc(s.id) + '" class="sec sec-' + esc(s.type) + (s.visible === false ? ' is-hidden' : '') + '"' + (edit ? ' data-sec="' + esc(s.id) + '"' : '') + '>';
      var handle = edit ? '<button class="sec-handle" data-sec-handle="' + esc(s.id) + '" aria-label="Section options">&#8943; ' + esc((SECTION_TYPES[s.type] || {}).label || s.type) + (s.visible === false ? ' (hidden)' : '') + '</button>' : '';
      var inner;
      switch (s.type) {
        case 'hero':
          inner = '<div class="wrap hero-grid"><div class="copy">' + text('h1', s.title, P + 'title') + text('p', s.subtitle, P + 'subtitle', 'lead') +
            btn(s, P) + '</div>' + image(s.image, P + 'image', 'hero-img') + '</div>';
          break;
        case 'text':
          inner = '<div class="wrap two"><div class="copy">' + text('h2', s.title, P + 'title') + (edit || (s.body || '').trim() ? '<div class="body"' + attr(P + 'body', 'long') + '>' + paragraphs(s.body) + '</div>' : '') +
            '</div>' + image(s.image, P + 'image', 'side-img') + '</div>';
          break;
        case 'cards':
          inner = '<div class="wrap">' + text('h2', s.title, P + 'title') + '<div class="grid cards">' + (s.items || []).map(function (it, j) {
            var Q = P + 'items.' + j + '.';
            return '<article class="card">' + image(it.image, Q + 'image', 'card-img') + text('h3', it.title, Q + 'title') + text('p', it.text, Q + 'text', null, 'long') + '</article>';
          }).join('') + '</div></div>';
          break;
        case 'gallery':
          inner = '<div class="wrap">' + text('h2', s.title, P + 'title') + '<div class="grid gallery">' + (s.items || []).map(function (it, j) {
            var Q = P + 'items.' + j + '.';
            var im = image(it.image, Q + 'image', 'gal-img');
            if (!im && !(it.caption || '').trim()) return '';
            return '<figure>' + im + (edit || (it.caption || '').trim() ? '<figcaption' + attr(Q + 'caption', 'text') + '>' + esc(it.caption) + '</figcaption>' : '') + '</figure>';
          }).join('') + '</div></div>';
          break;
        case 'contact':
          inner = '<div class="wrap">' + text('h2', s.title, P + 'title') + '<ul class="contact">' +
            contactLine('Email', s.email, P + 'email', 'mailto:') + contactLine('Phone', s.phone, P + 'phone', 'tel:') +
            contactLine('Address', s.address, P + 'address') + contactLine('Hours', s.hours, P + 'hours') + '</ul></div>';
          break;
        default:
          warnings.push('Section "' + (s.title || s.id) + '" has unsupported type "' + s.type + '". It is kept unchanged in the project but is not shown on the site.');
          return edit ? pre + handle + '<div class="wrap unsupported">Unsupported section type "' + esc(s.type) + '" (kept, not editable here)</div></section>' : '';
      }
      return pre + handle + inner + '</section>';
    }

    function btn(s, P) {
      var href = safeUrl(s.buttonLink);
      if (!(s.button || '').trim()) return edit ? '<a class="btn"' + attr(P + 'button', 'text') + ' href="#"></a>' : '';
      return '<a class="btn" href="' + esc(href || '#') + '"' + attr(P + 'button', 'text') + '>' + esc(s.button) + '</a>' + (edit ? '<small class="linkhint" data-path="' + P + 'buttonLink" data-kind="url">Link: ' + esc(s.buttonLink || 'none') + '</small>' : '');
    }

    function contactLine(label, value, path, scheme) {
      var has = value != null && String(value).trim() !== '';
      if (!has && !edit) return '';
      var shown = has ? esc(value) : '';
      var inner = has && scheme ? '<a href="' + scheme + esc(String(value).replace(/\s+/g, '')) + '">' + shown + '</a>' : shown;
      return '<li><b>' + label + '</b> <span' + attr(path, 'text') + '>' + inner + '</span></li>';
    }

    var navItems = [];
    var body = p.sections.map(function (s, i) {
      if (s.visible === false && !edit) return '';
      if (SECTION_TYPES[s.type] && s.type !== 'hero' && (s.title || '').trim()) navItems.push('<a href="#' + esc(s.id) + '">' + esc(s.title) + '</a>');
      return renderSection(s, i);
    }).join('\n');

    var site = p.site || {};
    var css = buildCss(p.theme || {}, edit);
    var footer = '<footer class="foot"><div class="wrap">' + (edit || (site.footer || '').trim() ? '<span' + attr('site.footer', 'text') + '>' + esc(site.footer) + '</span>' : '') + '</div></footer>';
    var header = '<header class="top"><div class="wrap"><a class="brand" href="#top"' + attr('site.title', 'text') + '>' + esc(site.title) + '</a><nav>' + navItems.join('') + '</nav></div></header>';

    var script = 'document.documentElement.classList.add("js");';
    var editScript = edit ? EDIT_SCRIPT : '';
    var baseTag = base ? '<base href="' + esc(base) + '">' : '';

    var doc = '<!doctype html>\n<html lang="' + esc(site.lang || 'en') + '"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' + baseTag +
      '<title>' + esc(site.title) + '</title><meta name="description" content="' + esc(site.description) + '">' +
      (edit ? '<style>' + css + '</style>' : '<link rel="stylesheet" href="style.css">') +
      '</head><body id="top">' + header + '<main>' + body + '</main>' + footer +
      (edit ? '<script>' + script + editScript + '</script>' : '<script src="script.js"></script>') + '</body></html>';

    var files = {};
    if (!edit) { files['index.html'] = doc; files['style.css'] = css; files['script.js'] = script; }
    return { html: doc, files: files, assets: used.filter(function (v, i, a) { return a.indexOf(v) === i; }), warnings: warnings };
  }

  var EDIT_SCRIPT =
    'document.addEventListener("click",function(e){var t=e.target;' +
    'var h=t.closest("[data-sec-handle]");if(h){e.preventDefault();parent.postMessage({t:"section",id:h.getAttribute("data-sec-handle")},"*");return;}' +
    'var el=t.closest("[data-path]");if(el){e.preventDefault();parent.postMessage({t:"edit",path:el.getAttribute("data-path"),kind:el.getAttribute("data-kind")},"*");return;}' +
    'var s=t.closest("[data-sec]");if(s){e.preventDefault();}' +
    '},true);';

  function buildCss(th, edit) {
    var font = FONTS[th.font] || FONTS.sans;
    var css =
      ':root{--primary:' + cssColor(th.primary, '#1F5C4D') + ';--accent:' + cssColor(th.accent, '#E0A030') + ';--bg:' + cssColor(th.bg, '#FFFFFF') + ';--text:' + cssColor(th.text, '#222222') + ';--font:' + font + '}\n' +
      '*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font);line-height:1.6;font-size:17px}\n' +
      '.wrap{max-width:1040px;margin:0 auto;padding:0 20px}img{max-width:100%}\n' +
      '.top{background:var(--primary);color:#fff;position:sticky;top:0;z-index:5}.top .wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 18px;padding-top:10px;padding-bottom:10px}\n' +
      '.brand{color:#fff;text-decoration:none;font-weight:700;font-size:1.15rem}.top nav{display:flex;flex-wrap:wrap;gap:4px 16px}.top nav a{color:#fff;text-decoration:none;opacity:.9;padding:6px 0;font-size:.95rem}\n' +
      '.sec{padding:44px 0}.sec:nth-of-type(even){background:rgba(0,0,0,.035)}h1,h2,h3{line-height:1.2;margin:0 0 .5em;color:var(--primary)}h1{font-size:clamp(1.9rem,6vw,3rem)}h2{font-size:clamp(1.5rem,4.5vw,2.1rem)}h3{font-size:1.2rem}\n' +
      '.lead{font-size:1.15rem;margin:0 0 1.2em}p{margin:0 0 1em}.btn{display:inline-block;background:var(--accent);color:#1b1b1b;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:999px;min-height:44px}\n' +
      '.hero-grid,.two{display:grid;gap:26px;align-items:center}.sec-hero{padding:56px 0}\n' +
      '.frame{position:relative;overflow:hidden;border-radius:14px;background:rgba(0,0,0,.08)}.frame img{display:block;width:100%;height:100%;object-fit:cover;transform-origin:center}\n' +
      '.hero-img{aspect-ratio:4/3}.side-img{aspect-ratio:4/3}.card-img{aspect-ratio:3/2;margin-bottom:12px}.gal-img{aspect-ratio:1/1}\n' +
      '.grid{display:grid;gap:20px;grid-template-columns:1fr}.card{background:#fff;border-radius:16px;padding:18px;box-shadow:0 1px 6px rgba(0,0,0,.08)}\n' +
      '.gallery figure{margin:0}.gallery figcaption{font-size:.9rem;opacity:.8;margin-top:6px}\n' +
      '.contact{list-style:none;padding:0;margin:0}.contact li{padding:8px 0;border-bottom:1px solid rgba(0,0,0,.1)}.contact b{display:inline-block;min-width:80px;color:var(--primary)}.contact a{color:var(--primary)}\n' +
      '.foot{background:var(--primary);color:#fff;padding:22px 0;text-align:center;font-size:.9rem}\n' +
      '@media(min-width:720px){.hero-grid,.two{grid-template-columns:1.1fr .9fr}.grid.cards{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}.grid.gallery{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}}\n' +
      '@media(min-width:420px) and (max-width:719px){.grid.gallery{grid-template-columns:1fr 1fr}}\n';
    if (edit) {
      css += '[data-path]{cursor:pointer;outline:2px dashed transparent;outline-offset:3px;border-radius:4px;-webkit-tap-highlight-color:rgba(224,160,48,.35)}[data-path]:active{outline-color:var(--accent)}\n' +
        '[data-path]:empty::before{content:"Tap to edit";opacity:.5;font-style:italic}.ph{display:flex;align-items:center;justify-content:center;min-height:120px;border:2px dashed rgba(0,0,0,.3)}.ph span{opacity:.7;font-size:.9rem}\n' +
        '.sec{position:relative}.is-hidden{opacity:.4}.sec-handle{position:absolute;right:8px;top:6px;z-index:3;background:#fff;border:1px solid #bbb;border-radius:999px;padding:8px 14px;font:600 13px system-ui;min-height:40px;color:#222}\n' +
        '.linkhint{display:block;margin-top:8px;opacity:.7;cursor:pointer}.unsupported{padding:24px;border:2px dashed #b33;color:#b33}.top{position:static}';
    }
    return css;
  }

  function cssColor(v, fallback) { return /^#[0-9a-fA-F]{3,8}$/.test(String(v || '')) ? v : fallback; }

  var api = {
    FONTS: FONTS, SECTION_TYPES: SECTION_TYPES, TEMPLATES: TEMPLATES,
    uid: uid, emptyImage: emptyImage, newSection: newSection, newItem: newItem, createProject: createProject,
    contentHash: contentHash, publishState: publishState, hash32: hash32, stable: stable,
    getPath: getPath, setPath: setPath,
    moveSection: moveSection, removeSection: removeSection, duplicateSection: duplicateSection, indexOfSection: indexOfSection,
    addItem: addItem, removeItem: removeItem, render: render, safeUrl: safeUrl, clampCrop: clampCrop, esc: esc
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Site = api;
})(typeof window !== 'undefined' ? window : globalThis);
