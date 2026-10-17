#!/usr/bin/env node
// SnapTour: point it at a website, a saved desktop app, or any open window and it
// photographs every screen into Desktop\Screenshots\SnapTour\<name>\<date>\.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Run } from './lib/run.mjs';
import { captureWebsite, normalize } from './lib/web.mjs';
import { captureElectron } from './lib/electron.mjs';
import { buildOutputs } from './lib/gallery.mjs';
import { OUT_ROOT, slug, log } from './lib/common.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPS_FILE = path.join(HERE, 'apps.json');

const HELP = `
  SnapTour - screenshots every page and screen of an app or website

  snaptour <website>              menusparks.com, https://..., http://localhost:3001
  snaptour <saved app>            vibedeck   (desktop apps listed in apps.json)
  snaptour <electron folder|exe>  any Electron app folder
  snaptour watch [window title]   ANY program: you click around, it snaps each new screen
  snaptour list                   show saved apps and past runs
  snaptour gallery <run folder>   rebuild the gallery and promo images for a run

  options
    --name <folder>   name of the folder inside Screenshots\\SnapTour (default: site or app name)
    --max <n>         most pages to visit on a website (default 40)
    --depth <n>       how many clicks deep to explore each page (default 2)
    --minutes <n>     time limit (default 10)
    --no-clicks       only visit pages, do not click tabs and menus
    --no-mobile       skip the phone-size shots
    --no-full         skip the full-length page shots
    --no-promo        skip the promo images
    --headed          show the browser while it works
    --no-open         do not open the gallery when finished

  Output: ${OUT_ROOT}\\<name>\\<date_time>\\
`;

function parseArgs(argv) {
  const o = { _: [], max: 40, depth: 2, minutes: 10, clicks: true, mobile: true, full: true, promo: true, open: true, headed: false, maxScreens: 40, mobileMax: 12 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--name') o.name = argv[++i];
    else if (a === '--max') o.max = +argv[++i];
    else if (a === '--depth') o.depth = +argv[++i];
    else if (a === '--minutes') o.minutes = +argv[++i];
    else if (a === '--accent') o.accent = argv[++i];
    else if (a === '--no-clicks') o.clicks = false;
    else if (a === '--no-mobile') o.mobile = false;
    else if (a === '--no-full') o.full = false;
    else if (a === '--no-promo') o.promo = false;
    else if (a === '--no-open') o.open = false;
    else if (a === '--headed') o.headed = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else o._.push(a);
  }
  return o;
}

function loadApps() {
  try { return JSON.parse(fs.readFileSync(APPS_FILE, 'utf8')); } catch { return {}; }
}

const expandEnv = p => p && p.replace(/%([^%]+)%/g, (_, k) => process.env[k] || '');

function openFile(p) {
  exec(`start "" "${p}"`, { shell: 'cmd.exe' });
}

async function finish(run, o, accent) {
  run.finish();
  const { promos } = await buildOutputs(run.dir, { promo: o.promo, accent });
  console.log(`\n  Done. ${run.shots.length} screenshots${promos ? `, ${promos} promo images` : ''}.`);
  console.log(`  Folder: ${run.dir}\n`);
  if (o.open) openFile(path.join(run.dir, 'index.html'));
}

function listAll() {
  const apps = loadApps();
  console.log('\n  Saved apps (apps.json):');
  for (const [k, v] of Object.entries(apps)) console.log(`    ${k.padEnd(14)} ${v.type}  ${v.path}`);
  console.log(`\n  Past runs in ${OUT_ROOT}:`);
  if (!fs.existsSync(OUT_ROOT)) return console.log('    (none yet)\n');
  for (const app of fs.readdirSync(OUT_ROOT)) {
    const runs = fs.readdirSync(path.join(OUT_ROOT, app)).sort();
    console.log(`    ${app.padEnd(14)} ${runs.length} run(s), latest ${runs.at(-1) || '-'}`);
  }
  console.log('');
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const [cmd, ...rest] = o._;
  if (o.help || !cmd) return console.log(HELP);
  if (cmd === 'list') return listAll();

  if (cmd === 'gallery') {
    const dir = path.resolve(rest.join(' '));
    await buildOutputs(dir, { promo: o.promo, accent: o.accent || '#ffd400' });
    console.log(`  Rebuilt ${dir}`);
    if (o.open) openFile(path.join(dir, 'index.html'));
    return;
  }

  if (cmd === 'watch') {
    const win = rest.join(' ');
    const run = new Run(o.name || win || 'watch', { mode: 'watch', target: win || 'any window', display: o.name || win || 'Screenshots' });
    const py = spawnSync('python', [path.join(HERE, 'watch.py'), '--out', run.dir, '--name', run.app, '--window', win], { stdio: 'inherit' });
    if (py.status !== 0) throw new Error('watch mode stopped with an error');
    run.shots = JSON.parse(fs.readFileSync(path.join(run.dir, 'shots.json'), 'utf8')).shots;
    return finish(run, o, o.accent || '#ffd400');
  }

  const apps = loadApps();
  const target = [cmd, ...rest].join(' ');
  let app = apps[cmd.toLowerCase()];
  if (!app && fs.existsSync(target) && (fs.existsSync(path.join(target, 'package.json')) || /\.exe$/i.test(target))) {
    app = { type: 'electron', path: target, settle: 8000 };
  }

  if (app) {
    app = { settle: 8000, ...app, path: expandEnv(app.path), profile: expandEnv(app.profile) };
    const name = o.name || (apps[cmd.toLowerCase()] ? cmd : path.basename(app.path, '.exe'));
    console.log(`\n  SnapTour: ${name} (desktop app)\n`);
    const run = new Run(name, { mode: 'electron', target: app.path, display: app.title || name });
    await captureElectron(run, { ...app, title: app.title || name }, { ...o, size: [1600, 1000] });
    return finish(run, o, o.accent || app.accent || '#ffd400');
  }

  const url = /^https?:\/\//i.test(target) ? target : (/^(localhost|127\.)/.test(target) ? 'http://' : 'https://') + target;
  if (!normalize(url)) throw new Error(`Not a website, saved app, or folder: ${target}`);
  const name = o.name || slug(new URL(url).hostname.replace(/^www\./, '') + (new URL(url).port ? '-' + new URL(url).port : ''));
  console.log(`\n  SnapTour: ${url}\n`);
  const run = new Run(name, { mode: 'website', target: url, display: new URL(url).host.replace(/^www\./, '') });
  await captureWebsite(run, url, o);
  return finish(run, o, o.accent || '#ffd400');
}

main().catch(e => { console.error(`\n  SnapTour error: ${e.message}\n`); process.exit(1); });
