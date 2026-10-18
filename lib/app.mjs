// SnapTour as a desktop app: a small local server plus a Chrome/Edge window in app mode
// (no tabs, no address bar). The window starts runs of snaptour.mjs and shows them live.
// Closing the window stops the app.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, exec, execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OUT_ROOT, desktopDir } from './common.mjs';
import { SHARE } from './gallery.mjs';
import { appHtml } from './app-ui.mjs';

const HERE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(HERE, 'snaptour.mjs');
const HOME = path.join(process.env.LOCALAPPDATA || os.homedir(), 'SnapTour');
const LOCK = path.join(HOME, 'app.json');

function findBrowser() {
  const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  for (const exe of ['Google/Chrome/Application/chrome.exe', 'Microsoft/Edge/Application/msedge.exe'])
    for (const r of roots) if (fs.existsSync(path.join(r, exe))) return path.join(r, exe);
  throw new Error('Could not find Chrome or Edge.');
}

// Its own browser profile, so the window is separate from your normal browsing and the
// browser process lives exactly as long as SnapTour windows are open.
function openWindow(url) {
  return spawn(findBrowser(), [`--app=${url}`, `--user-data-dir=${path.join(HOME, 'window')}`,
    '--window-size=1180,860', '--no-first-run', '--no-default-browser-check'], { stdio: 'ignore' });
}

const killTree = pid => { try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch {} };
const openPath = p => exec(`start "" "${p}"`, { shell: 'cmd.exe' });

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

function savedApps() {
  const apps = readJson(path.join(HERE, 'apps.json')) || {};
  return Object.entries(apps).map(([key, v]) => ({ key, type: v.type || 'electron', label: v.title || key }));
}

function pastRuns(limit = 30) {
  const runs = [];
  if (!fs.existsSync(OUT_ROOT)) return runs;
  for (const app of fs.readdirSync(OUT_ROOT)) {
    const dir = path.join(OUT_ROOT, app);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const run of fs.readdirSync(dir)) {
      const m = readJson(path.join(dir, run, 'shots.json'));
      if (!m) continue;
      const first = m.shots.find(s => s.kind !== 'mobile') || m.shots[0];
      runs.push({ rel: `${app}/${run}`, name: m.display || m.app, mode: m.mode, started: m.started,
        shots: m.shots.length, thumb: first ? `${app}/${run}/${first.file}` : null });
    }
  }
  return runs.sort((a, b) => String(b.started).localeCompare(String(a.started))).slice(0, limit);
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

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function serve(token) {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    // Only this window may use the app: right host (no DNS tricks) and the secret token.
    const port = req.socket.localPort;
    if (req.headers.host !== `127.0.0.1:${port}`) return send(res, 403, { error: 'forbidden' });
    const authed = u.searchParams.get('t') === token || req.headers['x-snaptour'] === token;
    try {
      if (u.pathname === '/' && authed) return send(res, 200, appHtml(token, SHARE), 'text/html; charset=utf-8');
      if (u.pathname === '/logo.svg') return send(res, 200, fs.readFileSync(path.join(HERE, 'assets', 'logo.svg')), TYPES['.svg']);
      if (!authed) return send(res, 403, { error: 'forbidden' });

      if (u.pathname.startsWith('/out/')) {
        const file = path.resolve(OUT_ROOT, decodeURIComponent(u.pathname.slice(5)));
        if (!file.startsWith(path.resolve(OUT_ROOT) + path.sep) || !TYPES[path.extname(file)] || !fs.existsSync(file)) return send(res, 404, { error: 'not found' });
        return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)]);
      }
      if (u.pathname === '/api/state') {
        const from = Number(u.searchParams.get('from')) || 0;
        return send(res, 200, {
          running: !!job.proc, code: job.code, target: job.target, lines: job.lines.slice(from), total: job.lines.length,
          dir: job.dir, rel: job.dir && path.relative(OUT_ROOT, job.dir).split(path.sep).join('/'),
          ...(u.searchParams.has('full') ? { apps: savedApps(), runs: pastRuns(), out: OUT_ROOT } : {})
        });
      }
      if (req.method !== 'POST') return send(res, 404, { error: 'not found' });
      let raw = '';
      for await (const c of req) raw += c;
      const body = raw ? JSON.parse(raw) : {};
      if (u.pathname === '/api/start') { start(body); return send(res, 200, { ok: true }); }
      if (u.pathname === '/api/stop') { if (job.proc) killTree(job.proc.pid); return send(res, 200, { ok: true }); }
      if (u.pathname === '/api/open') {
        const dir = body.rel ? path.resolve(OUT_ROOT, body.rel) : path.resolve(OUT_ROOT);
        if (dir !== path.resolve(OUT_ROOT) && !dir.startsWith(path.resolve(OUT_ROOT) + path.sep)) return send(res, 400, { error: 'bad path' });
        fs.mkdirSync(dir, { recursive: true });
        openPath(body.what === 'gallery' ? path.join(dir, 'index.html') : dir);
        return send(res, 200, { ok: true });
      }
      send(res, 404, { error: 'not found' });
    } catch (e) {
      send(res, 400, { error: e.message });
    }
  });
}

async function alive(lock) {
  try { return (await fetch(`http://127.0.0.1:${lock.port}/logo.svg`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}

export async function startApp() {
  fs.mkdirSync(HOME, { recursive: true });
  // Already open? Just bring up another window on it.
  const lock = readJson(LOCK);
  if (lock && await alive(lock)) { openWindow(`http://127.0.0.1:${lock.port}/?t=${lock.token}`).unref(); return; }

  // Started from the desktop icon or a terminal: hand over to a hidden background copy
  // so no console window stays open, then get out of the way.
  if (!process.env.SNAPTOUR_APP_CHILD) {
    const logFd = fs.openSync(path.join(HOME, 'app.log'), 'w');
    spawn(process.execPath, [SCRIPT, 'app'], { detached: true, windowsHide: true, stdio: ['ignore', logFd, logFd], env: { ...process.env, SNAPTOUR_APP_CHILD: '1' } }).unref();
    return;
  }

  const token = crypto.randomBytes(16).toString('hex');
  const server = serve(token);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  fs.writeFileSync(LOCK, JSON.stringify({ port, token, pid: process.pid }));
  const win = openWindow(`http://127.0.0.1:${port}/?t=${token}`);
  console.log(`SnapTour app on port ${port}`);
  win.on('exit', () => {
    if (job.proc) killTree(job.proc.pid);
    try { fs.rmSync(LOCK); } catch {}
    process.exit(0);
  });
}

// Desktop and Start-menu shortcuts that open the app with the SnapTour icon.
export function install() {
  const targets = [
    path.join(desktopDir(), 'SnapTour.lnk'),
    path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'SnapTour.lnk')
  ];
  const ps = `$w = New-Object -ComObject WScript.Shell
foreach ($p in $env:ST_LINKS -split '\\|') {
  $s = $w.CreateShortcut($p)
  $s.TargetPath = $env:ST_NODE
  $s.Arguments = '"' + $env:ST_SCRIPT + '" app'
  $s.WorkingDirectory = $env:ST_HERE
  $s.IconLocation = $env:ST_ICON + ',0'
  $s.WindowStyle = 7
  $s.Description = 'SnapTour - screenshot every page of a website or app'
  $s.Save()
}`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    stdio: 'inherit',
    env: { ...process.env, ST_LINKS: targets.join('|'), ST_NODE: process.execPath, ST_SCRIPT: SCRIPT, ST_HERE: HERE, ST_ICON: path.join(HERE, 'assets', 'snaptour.ico') }
  });
  for (const t of targets) console.log(`  shortcut: ${t}`);
}
