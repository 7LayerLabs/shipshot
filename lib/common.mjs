import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Desktop is redirected to OneDrive on this PC; fall back to the plain one elsewhere.
export function desktopDir() {
  const od = path.join(os.homedir(), 'OneDrive', 'Desktop');
  return fs.existsSync(od) ? od : path.join(os.homedir(), 'Desktop');
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

// Shipshot used to be called SnapTour: bring runs saved under the old name along, once.
const OLD_ROOT = path.join(desktopDir(), 'Screenshots', 'SnapTour');
if (OUT_ROOT === DEFAULT_OUT && fs.existsSync(OLD_ROOT) && !fs.existsSync(OUT_ROOT)) {
  try { fs.renameSync(OLD_ROOT, OUT_ROOT); } catch {}
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
