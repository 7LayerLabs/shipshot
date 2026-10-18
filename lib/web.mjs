// Website mode: visit every page on the same site, photograph it, then click through
// its tabs, menus and dialogs. Several tabs work at once. Finishes with phone-size shots
// of the main pages.
import { chromium } from 'playwright-core';
import { explore, settle } from './explore.mjs';
import { sleep, log } from './common.mjs';

const LINK_DANGER = /log[\s_-]?(out|off)|sign[\s_-]?out|delete|remove|unsubscribe|cancel/i;
const ASSET = /\.(pdf|zip|png|jpe?g|gif|webp|svg|ico|mp4|mov|mp3|wav|csv|xlsx?|docx?|pptx?|json|xml|txt|dmg|exe|msi)$/i;
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

export async function launchBrowser(headed) {
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ channel, headless: !headed }); } catch {}
  }
  throw new Error('Could not start Chrome or Edge.');
}

// "/auth/login" -> "Login", "/" -> "Home"
function pathName(url) {
  const p = new URL(url).pathname.split('/').filter(Boolean).pop() || 'Home';
  return decodeURIComponent(p).replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase());
}

// "Watch — Issue rundown · Maker & Machine" -> "Watch"; falls back to the URL path.
function shortTitle(title, url) {
  const first = String(title).split(/\s+[|·•—–-]\s+/)[0].trim();
  return first.length >= 3 ? first : pathName(url);
}

function host(u) { return u.hostname.replace(/^www\./, ''); }

export function normalize(raw, origin) {
  let u;
  try { u = new URL(raw, origin); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (origin && host(u) !== host(new URL(origin))) return null;
  if (ASSET.test(u.pathname)) return null;
  // keep hash routes (#/settings), drop plain anchors (#pricing)
  if (!/^#!?\//.test(u.hash)) u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/.test(k)) u.searchParams.delete(k);
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.href;
}

// Every tab gets the same rules: never leave a popup open, dismiss every confirm box.
function guard(page) {
  page.on('popup', p => p.close().catch(() => {}));
  page.on('dialog', d => d.dismiss().catch(() => {}));
  return page;
}

// Runs `work(item, page)` over `items` with `n` tabs at once. `items` may grow while it runs.
async function pool(ctx, n, items, work, more = () => true) {
  let busy = 0;
  const tab = async () => {
    const page = guard(await ctx.newPage());
    for (;;) {
      const item = more() ? items.shift() : undefined;
      if (item === undefined) {
        if (!busy) break; // nothing to take and nobody left who could add more
        await sleep(100);
        continue;
      }
      busy++;
      try { await work(item, page); } catch (e) { log(`skip (${e.message.split('\n')[0]})`); }
      busy--;
    }
    await page.close().catch(() => {});
  };
  await Promise.all(Array.from({ length: n }, tab));
}

export async function captureWebsite(run, start, o) {
  const browser = await launchBrowser(o.headed);
  const deadline = Date.now() + o.minutes * 60000;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

  const origin = new URL(start).origin;
  const queue = [normalize(start)];
  const queued = new Set(queue);
  const visited = new Set();
  const pages = [];
  const names = new Set();
  let brand = null, inFlight = 0;
  const memory = { sigs: [], keys: new Set() };
  const enqueue = raw => {
    const u = normalize(raw, origin);
    if (u && !queued.has(u)) { queued.add(u); queue.push(u); }
  };

  async function visit(url, page) {
    inFlight++;
    try {
      let res;
      try { res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
      catch { return log(`skip (did not load): ${url}`); }
      if (res && res.status() >= 400) return log(`skip (${res.status()}): ${url}`);
      await settle(page, { load: true, quiet: 400, max: 3000 });
      if (host(new URL(page.url())) !== host(new URL(origin))) return log(`skip (goes to ${new URL(page.url()).host}): ${url}`);
      const landed = normalize(page.url(), origin) || url;
      if (visited.has(landed) || pages.length >= o.max) return;
      visited.add(landed);
      queued.add(landed);

      // Pages titled just "Acme" (the same as the home page) are named from their URL instead.
      const title = await page.title().catch(() => '');
      let name = new URL(landed).pathname === '/' ? 'Home' : shortTitle(title, landed);
      if (new URL(landed).pathname === '/') brand = shortTitle(title, landed);
      if (name === brand || names.has(name)) name = pathName(landed);
      if (names.has(name)) name = `${name} (${new URL(landed).pathname})`;
      names.add(name);
      pages.push({ url: landed, name });
      const n = pages.length;

      await run.shot(page, name, { kind: 'page', sections: o.sections, url: landed });
      log(`page ${n}: ${name}  (${landed})`);

      const links = await page.$$eval('a[href]', as => as.map(a => [a.href, (a.innerText || a.title || '').trim()])).catch(() => []);
      // Links are just page visits, so only the ones that change your account are skipped.
      for (const [href, text] of links) if (!LINK_DANGER.test(text + ' ' + href)) enqueue(href);

      if (o.clicks) {
        await explore(page, {
          title: name, memory, skip: o.skip, depth: o.depth, deadline,
          maxScreens: o.maxScreens,
          resetBase: async () => { await page.goto(landed, { waitUntil: 'domcontentloaded' }).catch(() => {}); await settle(page, { load: true, quiet: 300 }); },
          shoot: t => run.shot(page, t, { kind: 'screen', url: landed }),
          onNavigate: enqueue
        });
      }
    } finally { inFlight--; }
  }

  // The first page is done alone, so its links fill the queue before the other tabs start.
  const first = queue.shift();
  await pool(ctx, 1, [first], visit);
  await pool(ctx, o.workers, queue, visit, () => pages.length + inFlight < o.max && Date.now() < deadline);
  await ctx.close();

  if (o.mobile && pages.length) {
    log('phone-size shots...');
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE
    });
    await pool(phone, o.workers, pages.slice(0, o.mobileMax), async (p, mp) => {
      try {
        await mp.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await settle(mp, { load: true, quiet: 400, max: 3000 });
        await run.shot(mp, p.name, { kind: 'mobile', url: p.url });
      } catch { log(`phone shot failed: ${p.url}`); }
    });
    await phone.close();
  }
  await browser.close();
  return pages.length;
}
