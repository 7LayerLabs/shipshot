import fs from 'node:fs';
import path from 'node:path';
import { makeRunDir, slug } from './common.mjs';

// One capture session: the folder, the numbered files and shots.json describing them.
export class Run {
  constructor(appName, meta = {}) {
    this.app = appName;
    this.dir = makeRunDir(appName);
    this.n = 0;
    this.meta = { app: appName, started: new Date().toISOString(), ...meta };
    this.shots = [];
    for (const sub of ['screens', 'full-page', 'mobile']) fs.mkdirSync(path.join(this.dir, sub), { recursive: true });
  }

  // kind: 'page' (a URL), 'screen' (a state reached by clicking), 'mobile'
  async shot(page, title, { kind = 'screen', full = false, url = page.url() } = {}) {
    this.n++;
    // file names lead with the most specific part: "VibeDeck / Settings / Answers" -> settings-answers
    const base = `${String(this.n).padStart(2, '0')}-${slug(title.split(' / ').slice(-2).join(' '))}`;
    const folder = kind === 'mobile' ? 'mobile' : 'screens';
    const file = `${folder}/${base}.png`;
    await page.screenshot({ path: path.join(this.dir, file), animations: 'disabled', caret: 'hide' });
    const entry = { n: this.n, title, kind, url, file };
    if (full) {
      entry.full = `full-page/${base}.png`;
      await page.screenshot({ path: path.join(this.dir, entry.full), fullPage: true, animations: 'disabled', caret: 'hide' })
        .catch(() => { delete entry.full; });
    }
    this.shots.push(entry);
    this.save();
    return entry;
  }

  save() {
    fs.writeFileSync(path.join(this.dir, 'shots.json'),
      JSON.stringify({ ...this.meta, finished: new Date().toISOString(), shots: this.shots }, null, 2));
  }

  finish() {
    this.save();
    for (const sub of ['screens', 'full-page', 'mobile']) {
      const p = path.join(this.dir, sub);
      if (fs.existsSync(p) && !fs.readdirSync(p).length) fs.rmdirSync(p);
    }
  }
}
