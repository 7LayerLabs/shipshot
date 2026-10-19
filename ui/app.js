// Shipshot app window. Talks to lib/app.mjs over /api/*; every request carries the token.
const T = document.querySelector('meta[name=shipshot-token]').content;
const $ = id => document.getElementById(id);
const api = (p, body) => fetch(p, {
  method: body ? 'POST' : 'GET',
  headers: { 'x-shipshot': T, 'content-type': 'application/json' },
  body: body && JSON.stringify(body)
}).then(r => r.json());
const outUrl = rel => '/out/' + rel.split('/').map(encodeURIComponent).join('/') + '?t=' + T;
const store = {
  get(k, d) { try { const v = localStorage.getItem('shipshot:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('shipshot:' + k, JSON.stringify(v)); } catch {} }
};

// Small element builder: h('div', { class: 'x', onclick }, child, 'text')
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : String(k));
  return e;
}

const PLATFORM = { x: 'X', discord: 'Discord', github: 'GitHub', linkedin: 'LinkedIn', instagram: 'Instagram', og: 'Link preview' };
const NOTE = { github: 'Repo social preview', og: 'Shown when the link is shared', instagram: 'Uses the phone shots' };
const when = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const clock = ms => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const pretty = file => file.split('/').pop().replace(/\.\w+$/, '').replace(/^\d+-/, '').replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());

let state = { apps: [], runs: [], out: '', defaultOut: '', fixedOut: false };
let mode = 'site';

// ---------- routing ----------
function route() {
  const [view, ...rest] = (location.hash.slice(1) || 'new').split('/');
  const name = ['new', 'library', 'apps', 'run', 'settings'].includes(view) ? view : 'new';
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== 'view-' + name;
  for (const b of document.querySelectorAll('.nav-item')) {
    const on = b.dataset.go === name || (name === 'run' && b.dataset.go === 'library');
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  if (name === 'run') showRun(decodeURIComponent(rest.join('/')));
  if (name === 'settings') showSettings();
  document.querySelector('.main').scrollTop = 0;
}
addEventListener('hashchange', route);
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go) location.hash = go.dataset.go;
});

// ---------- new capture form ----------
function renderPlatforms() {
  const on = store.get('share', ['x', 'discord']);
  $('platforms').replaceChildren(...Object.entries(window.SHARE).map(([k, p]) => h('div', { class: 'platform' },
    h('input', { type: 'checkbox', id: 'p-' + k, name: 'share', value: k, checked: on.includes(k) }),
    h('label', { for: 'p-' + k }, h('b', {}, PLATFORM[k] || p.label), h('small', {}, `${p.w}×${p.h}${p.max > 1 ? `, up to ${p.max}` : ''}`))
  )));
}

const FIELDS = ['max', 'minutes', 'sections', 'mobile', 'clicks', 'headed'];
for (const f of FIELDS) {
  const v = store.get(f);
  if (v != null) $(f)[$(f).type === 'checkbox' ? 'checked' : 'value'] = v;
}

function setMode(m) {
  mode = m;
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
  const watch = m === 'watch';
  $('targetLabel').textContent = watch ? 'Window title (optional)' : 'Website, GitHub link or saved app';
  $('target').placeholder = watch ? 'Photoshop' : 'yoursite.com or github.com/you/app';
  $('watchHint').hidden = !watch;
  $('saved').hidden = watch;
  $('more').hidden = watch;
}
document.querySelector('.seg').addEventListener('click', e => { if (e.target.dataset.mode) setMode(e.target.dataset.mode); });

function renderSaved() {
  const box = $('saved');
  box.replaceChildren();
  if (!state.apps.length) return;
  box.append(h('span', {}, 'Saved:'), ...state.apps.map(a => h('button', { type: 'button', onclick: () => { $('target').value = a.key; $('target').focus(); } }, a.label)));
}

$('form').addEventListener('submit', async e => {
  e.preventDefault();
  $('formError').textContent = '';
  const share = [...document.querySelectorAll('[name=share]:checked')].map(c => c.value);
  store.set('share', share);
  const body = { mode, target: $('target').value, name: $('name').value, share };
  if (mode === 'site') {
    // A GitHub repo with no live site gets downloaded and run here, so ask first.
    const repo = await api('/api/repo', { target: body.target });
    if (repo.error) { $('formError').textContent = repo.error; return; }
    if (repo.repo && !repo.live) {
      if (!await ask(`Run ${repo.repo} on this PC?`, 'It has no live website, so Shipshot downloads the code, installs it and starts it here to take the screenshots. Only do this for code you trust.', 'Run it')) return;
      body.runRepo = true;
    }
  }
  for (const f of FIELDS) { const el = $(f); body[f] = el.type === 'checkbox' ? el.checked : el.value; store.set(f, body[f]); }
  const r = await api('/api/start', body);
  if (r.error) { $('formError').textContent = r.error; return; }
  job = newJob(mode === 'watch' ? ($('target').value || 'any window') : $('target').value.trim(), mode);
  from = 0;
  showProgress();
});

// ---------- live progress ----------
let job = null, from = 0, wasRunning = false;
const newJob = (target, kind = 'site') => ({ target, kind, started: Date.now(), pages: 0, screens: 0, stage: 'pages', last: '', lines: [], shots: null, done: false });

function take(lines) {
  for (const l of lines) {
    job.lines.push(l);
    let m;
    if ((m = l.match(/^page (\d+):\s*(.*?)\s{2}/)) || (m = l.match(/^page (\d+):\s*(.*)$/))) { job.pages = Math.max(job.pages, +m[1]); job.last = m[2]; }
    else if ((m = l.match(/^screen: (.*)$/))) { job.screens++; job.last = m[1]; }
    else if ((m = l.match(/^\[(\d+)\] saved: (.*)$/))) { job.screens = +m[1]; job.last = m[2]; }
    else if (/^phone-size shots/.test(l)) { job.stage = 'phone'; job.last = 'Phone-size shots'; }
    else if (/^making \d+ promo/.test(l)) { job.stage = 'images'; job.last = 'Framing images for posting'; }
    else if ((m = l.match(/^Done\. (\d+) screenshots/))) job.shots = +m[1];
    else if (/^skip/.test(l)) job.last = l;
    else if ((m = l.match(/^repo: (.*)$/))) job.last = m[1];
    $('log').append(h('div', {}, l));
  }
  const log = $('log');
  log.scrollTop = log.scrollHeight;
}

function showProgress() {
  $('form').hidden = true;
  $('progress').hidden = false;
  $('finished').hidden = true;
  $('stop').hidden = false;
  $('log').replaceChildren();
  $('progTitle').textContent = job.kind === 'watch' ? `Watching ${job.target}` : `Capturing ${job.target}`;
  $('stages').hidden = job.kind === 'watch';
  paint();
}

function paint() {
  if (!job) return;
  $('elapsed').textContent = clock((job.ended || Date.now()) - job.started);
  const order = ['pages', 'phone', 'images'];
  const at = job.done ? 3 : order.indexOf(job.stage);
  const set = (k, cls, text) => { const li = document.querySelector(`[data-stage="${k}"]`); li.className = 'stage ' + cls; li.querySelector('span').textContent = text; };
  const crawl = at === 0 ? 'now' : 'done';
  set('pages', crawl, job.pages ? plural(job.pages, 'page') : at === 0 ? 'Starting' : 'None');
  set('screens', crawl, job.screens ? plural(job.screens, 'screen') : at === 0 ? 'Looking' : 'None');
  set('phone', at === 1 ? 'now' : at > 1 ? 'done' : '', at === 1 ? 'Working' : at > 1 ? 'Done' : 'Waiting');
  set('images', at === 2 ? 'now' : at > 2 ? 'done' : '', at === 2 ? 'Working' : at > 2 ? 'Done' : 'Waiting');
  $('current').textContent = job.done ? '' : job.kind === 'watch'
    ? (job.screens ? `${plural(job.screens, 'screen')} saved. Last: ${job.last}` : 'Click around the program. Press F10 when you are done.')
    : job.last;
}

function finished(s) {
  job.done = true;
  job.ended = Date.now();
  const ok = s.code === 0 && s.rel;
  job.rel = s.rel;
  paint();
  $('stop').hidden = true;
  $('finished').hidden = false;
  $('finished').classList.toggle('fail', !ok);
  $('openResult').hidden = !ok;
  const errLine = [...job.lines].reverse().find(l => /error/i.test(l));
  $('finishedText').textContent = ok
    ? `Saved ${plural(job.shots ?? 0, 'screenshot')} in ${clock(job.ended - job.started)}.`
    : errLine ? errLine.replace(/^Shipshot error:\s*/, '') : 'Stopped before it finished.';
}

$('stop').onclick = () => api('/api/stop', {});
$('again').onclick = () => { job = null; $('progress').hidden = true; $('form').hidden = false; $('target').focus(); };
$('openResult').onclick = () => { location.hash = 'run/' + encodeURIComponent(job.rel); };

async function poll(full) {
  let s;
  try { s = await api(`/api/state?from=${from}${full ? '&full=1' : ''}`); } catch { return; }
  if (full) {
    state = { apps: s.apps, runs: s.runs, out: s.out, defaultOut: s.defaultOut, fixedOut: s.fixedOut };
    renderAll();
    if (location.hash === '#settings' && !$('outDir').value) showSettings(); // opened straight onto Settings
  }
  if (s.running && !job) { job = newJob(s.target, s.target === 'any window' ? 'watch' : 'site'); from = 0; showProgress(); location.hash = 'new'; }
  if (s.lines.length && job) { take(s.lines); from = s.total; }
  if (s.running) wasRunning = true;
  else if (wasRunning && job && !job.done) { wasRunning = false; finished(s); poll(true); }
  paint();
}

// ---------- library, recent, saved apps ----------
const TRASH = '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';

function runCard(r) {
  const thumb = h('div', { class: 'thumb' });
  if (r.thumb) thumb.style.backgroundImage = `url("${outUrl(r.thumb)}")`;
  const del = h('button', { class: 'card-del', 'aria-label': `Delete ${r.name}, ${when(r.started)}`, title: 'Delete', onclick: () => deleteRun(r) });
  del.innerHTML = TRASH;
  return h('div', { class: 'card' },
    h('button', { class: 'card-open', onclick: () => { location.hash = 'run/' + encodeURIComponent(r.rel); } },
      thumb,
      h('div', { class: 'meta' }, h('b', {}, r.name), h('span', {}, r.target || ''), h('span', {}, `${plural(r.shots, 'shot')}, ${when(r.started)}`))),
    del);
}

// In-app yes/no. Resolves true only when the person presses the red button.
function ask(text, hint, yes = 'Delete') {
  return new Promise(done => {
    const back = $('confirm'), ret = document.activeElement;
    $('confirmText').textContent = text;
    $('confirmHint').textContent = hint || '';
    $('confirmYes').textContent = yes;
    back.hidden = false;
    $('confirmNo').focus();
    const close = v => { back.hidden = true; back.onkeydown = $('confirmYes').onclick = $('confirmNo').onclick = back.onclick = null; ret?.focus(); done(v); };
    $('confirmYes').onclick = () => close(true);
    $('confirmNo').onclick = () => close(false);
    back.onclick = e => { if (e.target === back) close(false); };
    back.onkeydown = e => { if (e.key === 'Escape') close(false); };
  });
}

async function deleteRun(r) {
  if (job && !job.done && job.rel === r.rel) return toast('That capture is still running.');
  const ok = await ask(`Delete ${r.name}?`, `The ${plural(r.shots, 'screenshot')} from ${when(r.started)} go to the Recycle Bin, so you can still get them back.`);
  if (!ok) return;
  const res = await api('/api/delete', { rel: r.rel });
  if (res.error) return toast(res.error);
  toast('Moved to the Recycle Bin.');
  if (location.hash.startsWith('#run/')) location.hash = 'library';
  poll(true);
}

function emptyLibrary() {
  return h('div', { class: 'empty', style: 'grid-column:1/-1' }, h('b', {}, 'No captures yet'), 'Start one and it will show up here.');
}

function renderAll() {
  renderSaved();
  $('libCount').textContent = state.runs.length || '';
  $('outPath').textContent = state.out.split(/[\\/]/).slice(-3).join('\\'); // Desktop\Screenshots\Shipshot
  $('outPath').title = state.out;
  $('recentWrap').hidden = !state.runs.length;
  $('recent').replaceChildren(...state.runs.slice(0, 4).map(runCard));
  renderLibrary();
  $('apps').replaceChildren(...(state.apps.length ? state.apps.map(a => h('div', { class: 'card' },
    h('div', { class: 'meta' },
      h('b', {}, a.label),
      h('span', {}, a.type === 'website' ? 'Website' : 'Desktop app'),
      h('span', { title: a.target }, a.target || ''),
      h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn', onclick: () => { setMode('site'); $('target').value = a.key; location.hash = 'new'; } }, 'Capture'))))) :
    [h('div', { class: 'empty', style: 'grid-column:1/-1' }, h('b', {}, 'No saved apps'), 'Add websites and desktop apps to apps.json to capture them in one click.')]));
}

function renderLibrary() {
  const q = $('search').value.trim().toLowerCase();
  const runs = state.runs.filter(r => !q || (r.name + ' ' + (r.target || '')).toLowerCase().includes(q));
  $('library').replaceChildren(...(runs.length ? runs.map(runCard) : [state.runs.length
    ? h('div', { class: 'empty', style: 'grid-column:1/-1' }, h('b', {}, 'Nothing matches'), 'Try part of the name or address.')
    : emptyLibrary()]));
}
$('search').addEventListener('input', renderLibrary);

// ---------- one run ----------
let run = null;

async function showRun(rel) {
  const r = await api('/api/run?rel=' + encodeURIComponent(rel));
  if (r.error) { $('runTitle').textContent = r.error; $('runTabs').replaceChildren(); $('runBody').replaceChildren(); return; }
  run = r;
  $('runTitle').textContent = r.display || r.app;
  const pages = r.shots.filter(s => s.kind === 'page').length;
  $('runFacts').replaceChildren(
    r.target ? h('span', {}, r.target) : null,
    h('span', {}, when(r.started)),
    h('span', {}, h('b', {}, plural(r.shots.length, 'screenshot')), pages ? ` from ${plural(pages, 'page')}` : ''));
  const tabs = [
    ['post', 'Ready to post', Object.values(r.share).flat().length],
    ['screens', 'Screens', r.shots.filter(s => s.kind !== 'mobile').length],
    ['phone', 'Phone', r.shots.filter(s => s.kind === 'mobile').length],
    ['promo', 'Promo images', r.promos.length],
    ['sheets', 'Contact sheets', r.sheets.length],
  ].filter(t => t[2]);
  const pick = store.get('tab', 'post');
  const first = tabs.find(t => t[0] === pick) ? pick : tabs[0]?.[0];
  $('runTabs').replaceChildren(...tabs.map(([k, label, n]) => h('button', { role: 'tab', 'data-tab': k, onclick: () => { store.set('tab', k); showTab(k); } }, label, h('span', {}, n))));
  if (first) showTab(first);
}

function tile(item, list, i, extra) {
  return h('div', { class: 'tile' },
    h('button', { class: 'img', onclick: () => openViewer(list, i), 'aria-label': 'View ' + item.title }, h('img', { src: outUrl(run.rel + '/' + item.src), loading: 'lazy', alt: '' })),
    h('div', { class: 'bar' }, h('span', { title: item.title }, item.title), extra || null,
      h('button', { class: 'mini', onclick: () => copyImage(item.src) }, 'Copy'),
      h('a', { class: 'mini', href: outUrl(run.rel + '/' + item.src), download: saveName(item.src) }, 'Save')));
}

function showTab(k) {
  for (const b of $('runTabs').children) b.setAttribute('aria-selected', String(b.dataset.tab === k));
  const body = $('runBody');
  body.replaceChildren();
  if (k === 'post') {
    for (const [p, files] of Object.entries(run.share)) {
      const spec = window.SHARE[p];
      const list = files.map(f => ({ src: f, title: titleFor(f) }));
      body.append(h('div', { class: 'group' },
        h('div', { class: 'group-head' }, h('h2', {}, PLATFORM[p] || p), h('small', {}, `${spec.w}×${spec.h}${NOTE[p] ? `. ${NOTE[p]}` : ''}`)),
        h('div', { class: 'tiles' }, list.map((it, i) => tile(it, list, i)))));
    }
  } else if (k === 'screens' || k === 'phone') {
    const shots = run.shots.filter(s => (k === 'phone') === (s.kind === 'mobile'));
    // The viewer walks every section of a long page before moving on to the next shot.
    const list = shots.flatMap(s => [s.file, ...(s.sections || [])].map((src, j, all) => ({ src, title: s.title, part: all.length > 1 ? `${j + 1} of ${all.length}` : '' })));
    body.append(h('div', { class: 'tiles ' + (k === 'phone' ? 'phone' : 'shots') }, shots.map(s => {
      const i = list.findIndex(it => it.src === s.file);
      const n = 1 + (s.sections || []).length;
      return tile({ src: s.file, title: s.title }, list, i, n > 1 ? h('small', {}, `${n} screens`) : null);
    })));
  } else {
    const files = k === 'promo' ? run.promos : run.sheets;
    const list = files.map(f => ({ src: f, title: titleFor(f) }));
    body.append(h('div', { class: 'tiles' }, list.map((it, i) => tile(it, list, i))));
  }
}

// Share and promo files start with their shot's number ("15-86-d.jpg"), so use that shot's real title.
function titleFor(file) {
  const n = parseInt(file.split('/').pop(), 10);
  const shot = run.shots.find(s => s.n === n);
  return shot ? shot.title.split(' / ').pop() : pretty(file);
}

const saveName = src => `${(run.display || run.app).replace(/[^\w.-]+/g, '-')}-${src.split('/').pop()}`;

$('runFolder').onclick = () => api('/api/open', { rel: run.rel, what: 'folder' });
$('runDelete').onclick = () => deleteRun({ rel: run.rel, name: run.display || run.app, shots: run.shots.length, started: run.started });
$('runGallery').onclick = () => api('/api/open', { rel: run.rel, what: 'gallery' });
$('openOut').onclick = () => api('/api/open', { what: 'folder' });
$('editApps').onclick = () => api('/api/open', { what: 'apps' });

// ---------- settings ----------
function showSettings() {
  $('outDir').value = state.out;
  $('settingsMsg').textContent = '';
  $('settingsMsg').className = 'error';
  const fixed = state.fixedOut;
  for (const id of ['outDir', 'browse', 'saveSettings', 'resetOut', 'moveRuns']) $(id).disabled = fixed;
  $('outHint').textContent = fixed
    ? 'This folder is set by the SHIPSHOT_OUT environment variable, so it can only be changed there.'
    : 'Each capture gets its own folder in here, named after the site and the time.';
}

$('browse').onclick = async () => {
  $('browse').disabled = true;
  const r = await api('/api/browse', { start: $('outDir').value });
  $('browse').disabled = false;
  if (r.path) $('outDir').value = r.path;
};
$('resetOut').onclick = () => { $('outDir').value = state.defaultOut; };
$('settingsForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('settingsMsg');
  msg.className = 'error';
  msg.textContent = '';
  const r = await api('/api/settings', { outDir: $('outDir').value.trim(), move: $('moveRuns').checked });
  if (r.error) { msg.textContent = r.error; return; }
  msg.className = 'ok-msg';
  msg.textContent = r.moved ? `Saved. Moved ${plural(r.moved, 'capture')} to the new folder.` : 'Saved. New captures go to this folder.';
  await poll(true);
  $('outDir').value = state.out;
});

// ---------- copy, viewer, toast ----------
async function copyImage(src) {
  try {
    let blob = await fetch(outUrl(run.rel + '/' + src)).then(r => r.blob());
    if (blob.type !== 'image/png') { // the clipboard only takes PNG
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      c.getContext('2d').drawImage(bmp, 0, 0);
      blob = await c.convertToBlob({ type: 'image/png' });
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Copied. Paste it into X, Discord or anywhere else.');
  } catch {
    toast('Could not copy that image. Use Save instead.');
  }
}

let toastTimer;
function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2600);
}

let vList = [], vAt = 0, vReturn = null;
function openViewer(list, i) {
  vList = list; vReturn = document.activeElement;
  $('viewer').hidden = false;
  showAt(i);
  $('vClose').focus();
}
function showAt(i) {
  vAt = (i + vList.length) % vList.length;
  const it = vList[vAt];
  $('vImg').src = outUrl(run.rel + '/' + it.src);
  $('vTitle').textContent = it.title;
  $('vPos').textContent = it.part || (vList.length > 1 ? `${vAt + 1} of ${vList.length}` : '');
  $('vSave').href = outUrl(run.rel + '/' + it.src);
  $('vSave').download = saveName(it.src);
  $('vPrev').hidden = $('vNext').hidden = vList.length < 2;
}
function closeViewer() { $('viewer').hidden = true; vReturn?.focus(); }
$('vPrev').onclick = () => showAt(vAt - 1);
$('vNext').onclick = () => showAt(vAt + 1);
$('vClose').onclick = closeViewer;
$('vCopy').onclick = () => copyImage(vList[vAt].src);
$('viewer').addEventListener('click', e => { if (e.target.classList.contains('viewer-stage')) closeViewer(); });
addEventListener('keydown', e => {
  if ($('viewer').hidden) return;
  if (e.key === 'Escape') closeViewer();
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); showAt(vAt + 1); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); showAt(vAt - 1); }
});

// ---------- start ----------
renderPlatforms();
setMode('site');
route();
poll(true);
setInterval(() => poll(false), 700);
