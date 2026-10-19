// Shipshot as a desktop app: a small local server plus a Chrome/Edge window in app mode
// (no tabs, no address bar). The window starts runs of shipshot.mjs and shows them live.
// Closing the window stops the app.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, exec, execSync, execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { outRoot, desktopDir, APP_HOME, DEFAULT_OUT, readSettings, writeSettings } from './common.mjs';
import { SHARE } from './gallery.mjs';

const HERE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(HERE, 'shipshot.mjs');
const HOME = APP_HOME;
const LOCK = path.join(HOME, 'app.json');

function findBrowser() {
  const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  for (const exe of ['Google/Chrome/Application/chrome.exe', 'Microsoft/Edge/Application/msedge.exe'])
    for (const r of roots) if (fs.existsSync(path.join(r, exe))) return path.join(r, exe);
  throw new Error('Could not find Chrome or Edge.');
}

// Its own browser profile, so the window is separate from your normal browsing and the
// browser process lives exactly as long as Shipshot windows are open.
function openWindow(url) {
  return spawn(findBrowser(), [`--app=${url}`, `--user-data-dir=${path.join(HOME, 'window')}`,
    '--window-size=1180,860', '--no-first-run', '--no-default-browser-check'], { stdio: 'ignore' });
}

const killTree = pid => { try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch {} };
const openPath = p => exec(`start "" "${p}"`, { shell: 'cmd.exe' });

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

function savedApps() {
  const apps = readJson(path.join(HERE, 'apps.json')) || {};
  return Object.entries(apps).map(([key, v]) => ({ key, type: v.type || 'electron', label: v.title || key, target: v.url || v.path }));
}

function pastRuns(limit = 300) {
  const runs = [];
  const root = outRoot();
  if (!fs.existsSync(root)) return runs;
  for (const app of fs.readdirSync(root)) {
    const dir = path.join(root, app);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const run of fs.readdirSync(dir)) {
      const m = readJson(path.join(dir, run, 'shots.json'));
      if (!m) continue;
      const first = m.shots.find(s => s.kind !== 'mobile') || m.shots[0];
      runs.push({ rel: `${app}/${run}`, name: m.display || m.app, mode: m.mode, started: m.started, target: m.target,
        shots: m.shots.length, thumb: first ? `${app}/${run}/${first.file}` : null });
    }
  }
  return runs.sort((a, b) => String(b.started).localeCompare(String(a.started))).slice(0, limit);
}

// Everything one run made, for the run page: its shots plus the promo, share and contact-sheet files.
function runDetail(rel) {
  const dir = inOut(rel);
  const m = readJson(path.join(dir, 'shots.json'));
  if (!m) throw new Error('That run is gone.');
  const list = sub => fs.existsSync(path.join(dir, sub)) ? fs.readdirSync(path.join(dir, sub)).filter(f => /\.(png|jpg)$/.test(f)).sort().map(f => `${sub}/${f}`) : [];
  const share = {};
  for (const k of Object.keys(SHARE)) { const files = list(`share/${k}`); if (files.length) share[k] = files; }
  const sheets = fs.readdirSync(dir).filter(f => /^contact-sheet.*\.png$/.test(f)).sort();
  return { rel, ...m, share, promos: list('promo'), sheets };
}

// A path inside the Screenshots folder, or an error. Keeps the app from reaching anywhere else.
function inOut(rel = '') {
  const root = path.resolve(outRoot()), p = path.resolve(root, rel);
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error('bad path');
  return p;
}

// Runs PowerShell without a window and resolves with what it printed.
function powershell(script, env = {}) {
  return new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', script],
    { windowsHide: true, env: { ...process.env, ...env } }, (err, out) => err ? reject(err) : resolve(String(out).trim())));
}

// The normal Windows folder picker, kept on top of the app window. Resolves with a path, or '' if cancelled.
function browseFolder(start) {
  return powershell(`Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = 'Choose where Shipshot saves your captures'
$d.ShowNewFolderButton = $true
if (Test-Path $env:ST_START) { $d.SelectedPath = $env:ST_START }
$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }
if ($d.ShowDialog($owner) -eq 'OK') { $d.SelectedPath }`, { ST_START: start });
}

// Moves a capture to the Recycle Bin, so a mistake can be undone from there.
async function recycle(rel) {
  const dir = inOut(rel);
  if (dir === path.resolve(outRoot()) || !fs.existsSync(path.join(dir, 'shots.json'))) throw new Error('That is not a capture folder.');
  await powershell(`Add-Type -AssemblyName Microsoft.VisualBasic
[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($env:ST_PATH, 'OnlyErrorDialogs', 'SendToRecycleBin')`, { ST_PATH: dir });
  const parent = path.dirname(dir); // the site's folder, once its last capture is gone
  if (fs.existsSync(parent) && !fs.readdirSync(parent).length) fs.rmdirSync(parent);
}

// New save folder. With `move`, every capture already saved comes along (rename on the same
// drive, copy then delete across drives). A capture that already exists there is left alone.
function setOutDir(dir, move) {
  if (job.proc) throw new Error('Wait for the capture to finish first.');
  if (!dir || !path.isAbsolute(dir)) throw new Error('Pick a full folder path, like D:\\Screenshots.');
  const from = path.resolve(outRoot()), to = path.resolve(dir);
  fs.mkdirSync(to, { recursive: true });
  let moved = 0;
  if (move && from !== to && fs.existsSync(from)) {
    if (to.startsWith(from + path.sep)) throw new Error('The new folder can not be inside the current one.');
    for (const site of fs.readdirSync(from)) {
      const src = path.join(from, site);
      if (!fs.statSync(src).isDirectory()) continue;
      for (const run of fs.readdirSync(src)) {
        const a = path.join(src, run), b = path.join(to, site, run);
        if (fs.existsSync(b)) continue;
        fs.mkdirSync(path.dirname(b), { recursive: true });
        try { fs.renameSync(a, b); } catch { fs.cpSync(a, b, { recursive: true }); fs.rmSync(a, { recursive: true, force: true }); }
        moved++;
      }
      if (!fs.readdirSync(src).length) fs.rmdirSync(src);
    }
  }
  writeSettings({ ...readSettings(), outDir: to === path.resolve(DEFAULT_OUT) ? undefined : to });
  return moved;
}

// The one run going on right now, if any.
const job = { proc: null, lines: [], dir: null, code: null, target: '' };

function start(body) {
  if (job.proc) throw new Error('A run is already going.');
  const target = String(body.target || '').trim();
  const args = body.mode === 'watch' ? ['watch', ...(target ? [target] : [])] : [target];
  if (body.mode !== 'watch' && !target) throw new Error('Type a website, or pick a saved app.');
  if (body.name) args.push('--name', String(body.name));
  const share = (body.share || []).filter(k => SHARE[k]);
  if (share.length) args.push('--for', share.join(','));
  for (const k of ['max', 'minutes', 'sections']) if (Number(body[k]) >= 0 && body[k] !== '') args.push(`--${k}`, String(Number(body[k])));
  if (body.mobile === false) args.push('--no-mobile');
  if (body.clicks === false) args.push('--no-clicks');
  if (body.headed) args.push('--headed');
  args.push('--no-open');

  Object.assign(job, { lines: [], dir: null, code: null, target: target || 'any window' });
  const proc = spawn(process.execPath, [SCRIPT, ...args], { cwd: HERE, windowsHide: true, env: { ...process.env, PYTHONUNBUFFERED: '1' } });
  job.proc = proc;
  let rest = '';
  const take = chunk => {
    const parts = (rest + chunk).split(/\r?\n/);
    rest = parts.pop();
    for (const l of parts) {
      if (!l.trim()) continue;
      job.lines.push(l.trim());
      const m = l.match(/Folder: (.+)$/);
      if (m) job.dir = m[1].trim();
    }
  };
  proc.stdout.on('data', take);
  proc.stderr.on('data', take);
  proc.on('close', code => { take('\n'); job.proc = null; job.code = code ?? 1; });
}

function send(res, code, body, type = 'application/json', cache = 'no-store') {
  res.writeHead(code, { 'content-type': type, 'cache-control': cache });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const ASSETS = path.join(HERE, 'assets');
const UI = path.join(HERE, 'ui');

// The window's page, with this session's token and the share sizes filled in.
const page = token => fs.readFileSync(path.join(UI, 'index.html'), 'utf8')
  .replace('__TOKEN__', token).replace('__SHARE__', JSON.stringify(SHARE));

// A file from a public folder (assets/ or ui/), or null.
function publicFile(dir, rel) {
  const file = path.resolve(dir, decodeURIComponent(rel));
  return file.startsWith(dir + path.sep) && TYPES[path.extname(file)] && fs.existsSync(file) ? file : null;
}

function serve(token) {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    // Only this window may use the app: right host (no DNS tricks) and the secret token.
    const port = req.socket.localPort;
    if (req.headers.host !== `127.0.0.1:${port}`) return send(res, 403, { error: 'forbidden' });
    const authed = u.searchParams.get('t') === token || req.headers['x-shipshot'] === token;
    try {
      if (u.pathname === '/' && authed) return send(res, 200, page(token), 'text/html; charset=utf-8');
      // The logo, font, styles and script hold no secrets; everything else needs the token.
      for (const [prefix, dir] of [['/assets/', ASSETS], ['/ui/', UI]]) {
        if (!u.pathname.startsWith(prefix)) continue;
        const file = publicFile(dir, u.pathname.slice(prefix.length));
        return file ? send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)]) : send(res, 404, { error: 'not found' });
      }
      if (!authed) return send(res, 403, { error: 'forbidden' });

      if (u.pathname.startsWith('/out/')) {
        const file = inOut(decodeURIComponent(u.pathname.slice(5)));
        if (!TYPES[path.extname(file)] || !fs.existsSync(file)) return send(res, 404, { error: 'not found' });
        return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)], 'max-age=300');
      }
      if (u.pathname === '/api/run') return send(res, 200, runDetail(u.searchParams.get('rel')));
      if (u.pathname === '/api/state') {
        const from = Number(u.searchParams.get('from')) || 0;
        return send(res, 200, {
          running: !!job.proc, code: job.code, target: job.target, lines: job.lines.slice(from), total: job.lines.length,
          dir: job.dir, rel: job.dir && path.relative(outRoot(), job.dir).split(path.sep).join('/'),
          ...(u.searchParams.has('full') ? { apps: savedApps(), runs: pastRuns(), out: outRoot(), defaultOut: DEFAULT_OUT, fixedOut: !!process.env.SHIPSHOT_OUT } : {})
        });
      }
      if (req.method !== 'POST') return send(res, 404, { error: 'not found' });
      let raw = '';
      for await (const c of req) raw += c;
      const body = raw ? JSON.parse(raw) : {};
      if (u.pathname === '/api/start') { start(body); return send(res, 200, { ok: true }); }
      if (u.pathname === '/api/stop') { if (job.proc) killTree(job.proc.pid); return send(res, 200, { ok: true }); }
      if (u.pathname === '/api/browse') return send(res, 200, { path: await browseFolder(body.start || outRoot()) });
      if (u.pathname === '/api/settings') return send(res, 200, { moved: setOutDir(body.outDir, body.move), out: outRoot() });
      if (u.pathname === '/api/delete') { await recycle(body.rel); return send(res, 200, { ok: true }); }
      if (u.pathname === '/api/open') {
        const dir = inOut(body.rel);
        fs.mkdirSync(dir, { recursive: true });
        const apps = path.join(HERE, 'apps.json');
        // First time: start the person's own apps.json from the example, so there is something to edit.
        if (body.what === 'apps' && !fs.existsSync(apps)) fs.copyFileSync(path.join(HERE, 'apps.example.json'), apps);
        openPath(body.what === 'gallery' ? path.join(dir, 'index.html') : body.what === 'apps' ? apps : dir);
        return send(res, 200, { ok: true });
      }
      send(res, 404, { error: 'not found' });
    } catch (e) {
      send(res, 400, { error: e.message });
    }
  });
}

async function alive(lock) {
  try { return (await fetch(`http://127.0.0.1:${lock.port}/assets/logo.svg`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}

export async function startApp() {
  fs.mkdirSync(HOME, { recursive: true });
  // Already open? Just bring up another window on it.
  const lock = readJson(LOCK);
  if (lock && await alive(lock)) { openWindow(`http://127.0.0.1:${lock.port}/?t=${lock.token}`).unref(); return; }

  // Started from the desktop icon or a terminal: hand over to a hidden background copy
  // so no console window stays open, then get out of the way.
  if (!process.env.SHIPSHOT_APP_CHILD) {
    const logFd = fs.openSync(path.join(HOME, 'app.log'), 'w');
    spawn(process.execPath, [SCRIPT, 'app'], { detached: true, windowsHide: true, stdio: ['ignore', logFd, logFd], env: { ...process.env, SHIPSHOT_APP_CHILD: '1' } }).unref();
    return;
  }

  const token = crypto.randomBytes(16).toString('hex');
  const server = serve(token);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  fs.writeFileSync(LOCK, JSON.stringify({ port, token, pid: process.pid }));
  const win = openWindow(`http://127.0.0.1:${port}/?t=${token}`);
  console.log(`Shipshot app on port ${port}`);
  win.on('exit', () => {
    if (job.proc) killTree(job.proc.pid);
    try { fs.rmSync(LOCK); } catch {}
    process.exit(0);
  });
}

// Desktop and Start-menu shortcuts that open the app with the Shipshot icon.
export function install() {
  const targets = [
    path.join(desktopDir(), 'Shipshot.lnk'),
    path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Shipshot.lnk')
  ];
  const ps = `$w = New-Object -ComObject WScript.Shell
foreach ($p in $env:ST_LINKS -split '\\|') {
  $s = $w.CreateShortcut($p)
  $s.TargetPath = $env:ST_NODE
  $s.Arguments = '"' + $env:ST_SCRIPT + '" app'
  $s.WorkingDirectory = $env:ST_HERE
  $s.IconLocation = $env:ST_ICON + ',0'
  $s.WindowStyle = 7
  $s.Description = 'Shipshot - screenshot every page of a website or app'
  $s.Save()
}`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    stdio: 'inherit',
    env: { ...process.env, ST_LINKS: targets.join('|'), ST_NODE: process.execPath, ST_SCRIPT: SCRIPT, ST_HERE: HERE, ST_ICON: path.join(HERE, 'assets', 'shipshot.ico') }
  });
  for (const t of targets) console.log(`  shortcut: ${t}`);
  // Shipshot used to be called SnapTour; its old shortcuts would start nothing now. Earlier
  // versions also put the desktop one in OneDrive\Desktop even when Windows showed another desktop.
  for (const t of targets) fs.rmSync(t.replace(/Shipshot\.lnk$/, 'SnapTour.lnk'), { force: true });
  const oneDrive = path.join(os.homedir(), 'OneDrive', 'Desktop');
  if (path.resolve(oneDrive) !== path.resolve(desktopDir()))
    for (const name of ['Shipshot.lnk', 'SnapTour.lnk']) fs.rmSync(path.join(oneDrive, name), { force: true });
}
