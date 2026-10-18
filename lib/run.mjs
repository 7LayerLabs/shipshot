import fs from 'node:fs';
import path from 'node:path';
import { makeRunDir, slug } from './common.mjs';
import { settle } from './explore.mjs';

const SUBS = ['screens', 'sections', 'mobile'];

// Runs inside the page. Finds what scrolls (the window, or the biggest scrolling panel in
// apps that scroll inside a div) and how much of the screen fixed bars cover at the top
// and bottom, so each section can start where the previous one ended.
function measureInPage() {
  const se = document.scrollingElement || document.documentElement;
  let box = null;
  if (se.scrollHeight <= innerHeight + 50) {
    let best = 0;
    for (const el of document.querySelectorAll('body *')) {
      if (el.scrollHeight <= el.clientHeight + 50 || el.clientHeight < innerHeight * 0.5) continue;
      if (!/(auto|scroll)/.test(getComputedStyle(el).overflowY)) continue;
      if (el.clientHeight * el.clientWidth > best) { best = el.clientHeight * el.clientWidth; box = el; }
    }
  }
  document.querySelectorAll('[data-snaptour-scroller]').forEach(e => e.removeAttribute('data-snaptour-scroller'));
  if (box) box.setAttribute('data-snaptour-scroller', '');
  const view = box ? box.getBoundingClientRect() : { top: 0, bottom: innerHeight };
  // Sticky headers only stick once the page has moved, so measure one step down.
  (box || window).scrollTo({ top: 300, behavior: 'instant' });
  let top = 0, bottom = 0;
  for (const el of document.querySelectorAll('body *')) {
    const pos = getComputedStyle(el).position;
    if (pos !== 'fixed' && pos !== 'sticky') continue;
    const r = el.getBoundingClientRect();
    if (r.width < innerWidth * 0.5 || r.height === 0 || r.height > innerHeight * 0.3) continue;
    if (r.top <= view.top + 2 && r.bottom > view.top) top = Math.max(top, r.bottom - view.top);
    else if (r.bottom >= view.bottom - 2 && r.top < view.bottom) bottom = Math.max(bottom, view.bottom - r.top);
  }
  (box || window).scrollTo({ top: 0, behavior: 'instant' });
  const height = view.bottom - view.top;
  return { height, step: Math.max(height * 0.4, height - top - bottom - 40), inner: !!box };
}

function scrollInPage([y, inner]) {
  const el = inner ? document.querySelector('[data-snaptour-scroller]') : document.scrollingElement || document.documentElement;
  if (!el) return 0;
  el.scrollTo({ top: y, behavior: 'instant' });
  return el.scrollHeight - el.clientHeight; // grows as lazy content loads
}

// One capture session: the folder, the numbered files and shots.json describing them.
export class Run {
  constructor(appName, meta = {}) {
    this.app = appName;
    this.dir = makeRunDir(appName);
    this.n = 0;
    this.meta = { app: appName, started: new Date().toISOString(), ...meta };
    this.shots = [];
    for (const sub of SUBS) fs.mkdirSync(path.join(this.dir, sub), { recursive: true });
  }

  // kind: 'page' (a URL), 'screen' (a state reached by clicking), 'mobile'.
  // sections: also shoot the rest of the page one screen at a time, at most this many shots in all.
  async shot(page, title, { kind = 'screen', sections = 0, url = page.url() } = {}) {
    const n = ++this.n;
    // file names lead with the most specific part: "VibeDeck / Settings / Answers" -> settings-answers
    const base = `${String(n).padStart(2, '0')}-${slug(title.split(' / ').slice(-2).join(' '))}`;
    const folder = kind === 'mobile' ? 'mobile' : 'screens';
    const file = `${folder}/${base}.png`;
    await page.screenshot({ path: path.join(this.dir, file), animations: 'disabled', caret: 'hide' });
    const entry = { n, title, kind, url, file };
    if (sections > 1) {
      const files = await this.sections(page, base, sections).catch(() => []);
      if (files.length) entry.sections = files;
    }
    this.shots.push(entry);
    this.save();
    return entry;
  }

  // Scrolls down one screen at a time (minus fixed headers and a little overlap) and
  // shoots each screen, so a long page becomes several readable images, not one tall one.
  async sections(page, base, max) {
    const m = await page.evaluate(measureInPage);
    const files = [];
    let y = 0, prev = 0;
    let end = await page.evaluate(scrollInPage, [0, m.inner]);
    while (files.length < max - 1 && prev < end) {
      y = Math.min(prev + m.step, end);
      if (y - prev < 40) break;
      end = await page.evaluate(scrollInPage, [y, m.inner]);
      await settle(page, { quiet: 200, max: 1200 });
      const file = `sections/${base}-${files.length + 2}.png`;
      await page.screenshot({ path: path.join(this.dir, file), animations: 'disabled', caret: 'hide' });
      files.push(file);
      prev = y;
    }
    await page.evaluate(scrollInPage, [0, m.inner]);
    return files;
  }

  save() {
    this.shots.sort((a, b) => a.n - b.n);
    fs.writeFileSync(path.join(this.dir, 'shots.json'),
      JSON.stringify({ ...this.meta, finished: new Date().toISOString(), shots: this.shots }, null, 2));
  }

  finish() {
    this.save();
    for (const sub of SUBS) {
      const p = path.join(this.dir, sub);
      if (fs.existsSync(p) && !fs.readdirSync(p).length) fs.rmdirSync(p);
    }
  }
}
