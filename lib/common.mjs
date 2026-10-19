import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// The desktop Windows actually shows. It may or may not be the OneDrive one (a leftover
// OneDrive\Desktop folder can exist while Windows uses another), so ask Windows.
let desktop;
export function desktopDir() {
  if (desktop) return desktop;
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders', '/v', 'Desktop'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
      const m = out.match(/Desktop\s+REG_(?:EXPAND_)?SZ\s+(.+)/);
      const p = m && m[1].trim().replace(/%([^%]+)%/g, (_, k) => process.env[k] || '');
      if (p && fs.existsSync(p)) return (desktop = p);
    } catch {}
  }
  return (desktop = path.join(os.homedir(), 'Desktop'));
}

// Shipshot's own files (settings, the app window's browser profile, its log).
export const APP_HOME = path.join(process.env.LOCALAPPDATA || os.homedir(), 'Shipshot');
const SETTINGS = path.join(APP_HOME, 'settings.json');
export const DEFAULT_OUT = path.join(desktopDir(), 'Screenshots', 'Shipshot');

export function readSettings() {
  // Notepad and PowerShell may start the file with a byte-order mark, which JSON.parse rejects.
  try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8').replace(/^﻿/, '')); } catch { return {}; }
}
export function writeSettings(s) {
  fs.mkdirSync(APP_HOME, { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2));
}

// Where captures go: SHIPSHOT_OUT if set, else the folder picked in Settings, else the Desktop.
// Read every time, so a change in Settings applies to the next capture straight away.
export function outRoot() {
  return process.env.SHIPSHOT_OUT || process.env.SNAPTOUR_OUT || readSettings().outDir || DEFAULT_OUT;
}
export const OUT_ROOT = outRoot();

// Captures saved where earlier versions put them (under the old SnapTour name, or in a
// OneDrive Desktop folder Windows was not showing) come along to the real place, once.
const OLD_ROOTS = [
  path.join(os.homedir(), 'OneDrive', 'Desktop', 'Screenshots', 'Shipshot'),
  path.join(os.homedir(), 'OneDrive', 'Desktop', 'Screenshots', 'SnapTour'),
  path.join(desktopDir(), 'Screenshots', 'SnapTour'),
].filter(p => p !== DEFAULT_OUT);
if (OUT_ROOT === DEFAULT_OUT && !fs.existsSync(OUT_ROOT)) {
  const old = OLD_ROOTS.find(p => fs.existsSync(p));
  if (old) try { fs.mkdirSync(path.dirname(OUT_ROOT), { recursive: true }); fs.renameSync(old, OUT_ROOT); } catch {}
}

export function slug(s, max = 48) {
  return String(s || '')
    .toLowerCase()
    .replace(/https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || 'page';
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

// Screenshots/Shipshot/<app>/<date_time>/ ; every run gets its own folder so nothing is overwritten.
export function makeRunDir(appName) {
  const dir = path.join(OUT_ROOT, slug(appName), stamp());
  let out = dir, n = 2;
  while (fs.existsSync(out)) out = `${dir}-${n++}`;
  fs.mkdirSync(out, { recursive: true });
  return out;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function log(...a) {
  console.log('  ' + a.join(' '));
}

// Labels that mean "this button does something", not "this button shows something".
// Shipshot never clicks these, never types, and dismisses every confirm box.
export const DANGER = /\b(delete|remove|trash|discard|destroy|erase|undo|rewind|revert|reset|clear|wipe|log ?out|sign ?out|unsubscribe|cancel|buy|purchase|checkout|pay|subscribe|order|submit|send|post|publish|deploy|broadcast|run|execute|start|stop|kill|end|restart|reload|refresh|update|upgrade|install|uninstall|download|upload|import|export|save|apply|keep|accept|confirm|approve|reject|yes|ok|merge|commit|push|pull|sync|archive|transfer|invite|share|print|open here|add|new|create|duplicate|close|exit|quit|browse|pick|choose folder|judge|hide|toggle|sign ?in|log ?in|sign ?up|register|continue with)\b/i;
