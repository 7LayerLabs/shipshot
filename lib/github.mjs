// GitHub links: find the app a public repo holds and hand back something Shipshot can capture.
// A repo with a live website is captured there. Otherwise (only with the person's OK, since it
// runs the repo's code) it is downloaded and started on this PC: an Electron app, a web app's
// dev server, or a plain folder of HTML.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { APP_HOME, slug, log, sleep } from './common.mjs';
import { cleanEnv } from './electron.mjs';
import { launchBrowser } from './web.mjs';

// "github.com/owner/repo", with or without https://, .git, or a path after it.
export function parseRepo(target) {
  const m = String(target || '').trim().match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/i);
  return m ? { owner: m[1], name: m[2], full: `${m[1]}/${m[2]}`, url: `https://github.com/${m[1]}/${m[2]}` } : null;
}

async function repoInfo(repo) {
  let r;
  try {
    r = await fetch(`https://api.github.com/repos/${repo.full}`, { headers: { 'user-agent': 'Shipshot', accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) });
  } catch { throw new Error('Could not reach GitHub. Check the internet connection.'); }
  if (r.status === 404) throw new Error(`${repo.full} was not found on GitHub. Shipshot only works with public repos.`);
  if (r.status === 403) throw new Error('GitHub is limiting requests from this PC for now. Try again in a few minutes.');
  if (!r.ok) throw new Error(`GitHub answered ${r.status} for ${repo.full}.`);
  return r.json();
}

async function answers(url) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(15000) })).ok; } catch { return false; }
}

// The repo's live website: its "Website" field, else its GitHub Pages site. Null if neither answers.
export async function liveSite(repo) {
  const info = await repoInfo(repo);
  const urls = [];
  const home = String(info.homepage || '').trim();
  if (home) urls.push(/^https?:\/\//i.test(home) ? home : 'https://' + home);
  if (info.has_pages) {
    const owner = repo.owner.toLowerCase();
    urls.push(repo.name.toLowerCase() === `${owner}.github.io` ? `https://${owner}.github.io/` : `https://${owner}.github.io/${repo.name}/`);
  }
  for (const u of urls) if (!/^https?:\/\/(www\.)?github\.com\//i.test(u) && await answers(u)) return { url: u, title: info.name };
  return null;
}

// npm and friends are .cmd files on Windows, which only start through the shell, so the
// command goes over as one line with any argument that has spaces quoted.
const line = (cmd, args) => [cmd, ...args.map(a => /[\s"]/.test(a) ? `"${a}"` : a)].join(' ');

// Runs a command and resolves when it ends; rejects with its last lines if it fails.
function run(cmd, args, cwd, what) {
  return new Promise((resolve, reject) => {
    const p = spawn(line(cmd, args), { cwd, shell: true, windowsHide: true, env: cleanEnv() });
    let tail = '';
    const keep = d => { tail = (tail + d).slice(-2000); };
    p.stdout.on('data', keep);
    p.stderr.on('data', keep);
    p.on('error', e => reject(e.code === 'ENOENT' ? new Error(`${what} needs ${cmd}, which is not installed.`) : e));
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`${what} failed:\n${tail.trim().split(/\r?\n/).slice(-8).join('\n')}`)));
  });
}

function killTree(p) {
  if (!p || p.exitCode != null) return;
  try {
    if (process.platform === 'win32') execSync(`taskkill /PID ${p.pid} /T /F`, { stdio: 'ignore' });
    else process.kill(-p.pid);
  } catch {}
}

// Shallow copy kept in Shipshot's own folder, refreshed to the latest commit each time.
async function download(repo) {
  const dir = path.join(APP_HOME, 'repos', slug(`${repo.owner}-${repo.name}`, 80));
  if (fs.existsSync(path.join(dir, '.git'))) {
    log(`repo: Updating ${repo.full}`);
    await run('git', ['fetch', '--depth', '1', 'origin', 'HEAD'], dir, 'Updating the repo');
    await run('git', ['reset', '--hard', 'FETCH_HEAD'], dir, 'Updating the repo');
  } else {
    log(`repo: Downloading ${repo.full}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    await run('git', ['clone', '--depth', '1', repo.url + '.git', dir], path.dirname(dir), 'Downloading the repo');
  }
  return dir;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain' };

// A plain folder of HTML, served on a free local port. Never serves anything outside the folder.
async function serveFolder(root) {
  const server = http.createServer((req, res) => {
    let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, stop: () => server.close() };
}

// Starts the web app's dev script and resolves with the local address it prints.
async function startDevServer(dir, script) {
  log(`repo: Starting the app (npm run ${script})`);
  const port = 4300 + Math.floor(Math.random() * 500);
  const p = spawn(line('npm', ['run', script]), {
    cwd: dir, shell: true, windowsHide: true, detached: process.platform !== 'win32',
    env: { ...cleanEnv(), PORT: String(port), BROWSER: 'none', FORCE_COLOR: '0', NO_COLOR: '1' }
  });
  const stop = () => killTree(p);
  process.on('exit', stop);
  let out = '', url = null, ended = false;
  const read = d => {
    out = (out + d).slice(-4000);
    const m = String(d).replace(/\x1b\[[0-9;]*m/g, '').match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):\d+[^\s'"]*/);
    if (m && !url) url = m[0].replace(/0\.0\.0\.0|\[::1?\]/, 'localhost');
  };
  p.stdout.on('data', read);
  p.stderr.on('data', read);
  p.on('close', () => { ended = true; });

  // Wait for an address in its output (or, failing that, the PORT we gave it), then for it to answer.
  for (let waited = 0; waited < 180000; waited += 500) {
    if (ended) break;
    const guess = url || (waited > 20000 ? `http://localhost:${port}/` : null);
    if (guess && await answers(guess)) return { url: guess, stop };
    await sleep(500);
  }
  stop();
  throw new Error(`The app did not start.\n${out.trim().split(/\r?\n/).slice(-8).join('\n')}`);
}

// A Node app Shipshot can start: at the top of the repo, else one folder down (repos often keep
// it in frontend/ or web/ next to a backend). Null if there is none.
function findNodeApp(root) {
  const read = dir => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { return null; } };
  const LIKELY = ['frontend', 'web', 'client', 'app', 'site', 'ui'];
  const subs = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && !/^(\.|node_modules$)/.test(e.name)).map(e => e.name)
    .sort((a, b) => ((LIKELY.indexOf(a) + 1 || 99) - (LIKELY.indexOf(b) + 1 || 99)) || a.localeCompare(b));
  for (const dir of [root, ...subs.map(d => path.join(root, d))]) {
    const pkg = read(dir);
    if (!pkg) continue;
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const script = ['dev', 'start', 'serve', 'preview'].find(s => pkg.scripts?.[s]);
    const electron = !!deps.electron || /\belectron\b/.test(Object.values(pkg.scripts || {}).join(' '));
    if (electron || script) return { dir, pkg, deps, script, electron };
  }
  return null;
}

// A dev server can be up while the app only shows its framework's error screen (often because
// it needs keys the repo leaves out). Returns that error's text, or null if the app looks fine.
async function errorScreen(url) {
  const browser = await launchBrowser(false);
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: 120000 }).catch(() => {});
    await sleep(3000);
    return await page.evaluate(() => {
      const vite = document.querySelector('vite-error-overlay')?.shadowRoot;
      if (vite) return vite.querySelector('.message')?.textContent || 'Vite error';
      const next = document.querySelector('nextjs-portal')?.shadowRoot?.querySelector('[data-nextjs-dialog]');
      return next ? next.innerText.split('\n').filter(Boolean).slice(1, 4).join('\n') : null;
    });
  } finally { await browser.close(); }
}

// What to capture for a repo: { kind: 'site', url, title, stop? } or { kind: 'electron', path, title }.
export async function prepareRepo(repo, o) {
  log(`repo: Looking up ${repo.full}`);
  const live = await liveSite(repo);
  if (live) { log(`repo: Live site ${live.url}`); return { kind: 'site', ...live }; }
  if (!o.runRepo) throw new Error(`${repo.full} has no live website, so Shipshot would have to download it and run it on this PC. Only do that for code you trust; to go ahead, add --run-repo.`);

  const repoDir = await download(repo);
  const found = findNodeApp(repoDir);
  if (found) {
    const { dir, pkg, deps, script, electron } = found;
    if (dir !== repoDir) log(`repo: The app is in ${path.relative(repoDir, dir)}`);
    log('repo: Installing packages (npm install)');
    await run('npm', ['install', '--no-audit', '--no-fund'], dir, 'npm install');
    // Some apps run "electron ." without listing Electron, expecting it installed globally.
    if (electron && !deps.electron) await run('npm', ['install', '--no-save', '--no-audit', '--no-fund', 'electron'], dir, 'Installing Electron');
    // Electron fetches its program in an install step that npm does not always run.
    if (electron && !fs.existsSync(path.join(dir, 'node_modules', 'electron', 'dist')))
      await run(process.execPath, [path.join('node_modules', 'electron', 'install.js')], dir, 'Downloading Electron');
    if (electron) {
      // Many Electron apps start from built files ("out/main/index.js") that are not in the repo.
      const main = path.join(dir, pkg.main || 'index.js');
      const built = () => [main, main + '.js'].some(f => fs.existsSync(f));
      if (!built() && pkg.scripts?.build) {
        log('repo: Building the app (npm run build)');
        await run('npm', ['run', 'build'], dir, 'npm run build');
      }
      if (!built()) throw new Error(`${repo.full} is an Electron app that has to be built before it runs, and it has no "build" script Shipshot can use. Build it yourself, then give Shipshot the folder: ${dir}`);
      return { kind: 'electron', path: dir, title: pkg.productName || repo.name };
    }
    const server = await startDevServer(dir, script);
    const err = await errorScreen(server.url);
    if (err) {
      server.stop();
      const env = ['.env.example', '.env.sample', '.env.local.example'].find(f => fs.existsSync(path.join(dir, f)));
      throw new Error(`${repo.full} started, but shows an error instead of the app${env ? ` (it needs settings the repo leaves out, see ${env})` : ''}:
${err.trim()}`);
    }
    return { kind: 'site', title: repo.name, ...server };
  }
  const site = ['', 'docs', 'public', 'dist', 'build', 'site'].map(d => path.join(repoDir, d)).find(d => fs.existsSync(path.join(d, 'index.html')));
  if (site) { log('repo: Serving its HTML files'); return { kind: 'site', title: repo.name, ...await serveFolder(site) }; }
  throw new Error(`Could not tell how to run ${repo.full}. Shipshot can run Node web apps (a "dev" or "start" script), Electron apps and plain HTML sites.`);
}
