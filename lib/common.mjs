import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Desktop is redirected to OneDrive on this PC; fall back to the plain one elsewhere.
export function desktopDir() {
  const od = path.join(os.homedir(), 'OneDrive', 'Desktop');
  return fs.existsSync(od) ? od : path.join(os.homedir(), 'Desktop');
}

export const OUT_ROOT = process.env.SNAPTOUR_OUT || path.join(desktopDir(), 'Screenshots', 'SnapTour');

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

// Screenshots/SnapTour/<app>/<date_time>/ ; every run gets its own folder so nothing is overwritten.
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
// SnapTour never clicks these, never types, and dismisses every confirm box.
export const DANGER = /\b(delete|remove|trash|discard|destroy|erase|undo|rewind|revert|reset|clear|wipe|log ?out|sign ?out|unsubscribe|cancel|buy|purchase|checkout|pay|subscribe|order|submit|send|post|publish|deploy|broadcast|run|execute|start|stop|kill|end|restart|reload|refresh|update|upgrade|install|uninstall|download|upload|import|export|save|apply|keep|accept|confirm|approve|reject|yes|ok|merge|commit|push|pull|sync|archive|transfer|invite|share|print|open here|add|new|create|duplicate|close|exit|quit|browse|pick|choose folder|judge|hide|toggle|sign ?in|log ?in|follow|following|unfollow|favou?rite|bookmark|like|unlike|vote|rate|pin|unpin|ask|generate|regenerate|analy[sz]e|summari[sz]e|track|untrack)\b/i;
