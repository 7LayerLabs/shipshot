// Website mode: visit every page on the same site, photograph it, then click through
// its tabs, menus and dialogs. Finishes with phone-size shots of the main pages.
import { chromium } from 'playwright-core';
import { explore, settle } from './explore.mjs';
import { sleep, log } from './common.mjs';

const LINK_DANGER = /log[\s_-]?(out|off)|sign[\s_-]?out|delete|remove|unsubscribe|cancel/i;
const ASSET = /\.(pdf|zip|png|jpe?g|gif|webp|svg|ico|mp4|mov|mp3|wav|csv|xlsx?|docx?|pptx?|json|xml|txt|dmg|exe|msi)$/i;

export async function launchBrowser(headed) {
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ channel, headless: !headed }); } catch {}
  }
  throw new Error('Could not start Chrome or Edge.');
}

// "Watch — Issue rundown · Maker & Machine" -> "Watch"; falls back to the URL path.
function shortTitle(title, url) {
  const first = String(title).split(/\s+[|·•—–-]\s+/)[0].trim();
  if (first.length >= 3) return first;
  const p = new URL(url).pathname.split('/').filter(Boolean).pop() || 'Home';
  return p.replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase());
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

async function autoScroll(page) {
  await page.evaluate(async () => {
    const step = innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight && y < 30000; y += step) {
      scrollTo({ top: y, behavior: 'instant' });
      await new Promise(r => setTimeout(r, 120));
    }
    scrollTo({ top: 0, behavior: 'instant' });
  }).catch(() => {});
  await sleep(600);
}

export async function captureWebsite(run, start, o) {
  const browser = await launchBrowser(o.headed);
  const deadline = Date.now() + o.minutes * 60000;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  ctx.on('page', p => { if (p !== page) p.close().catch(() => {}); });
  page.on('dialog', d => d.dismiss().catch(() => {}));

  const origin = new URL(start).origin;
  const queue = [normalize(start)];
  const queued = new Set(queue);
  const visited = new Set();
  const pages = [];
  const memory = { sigs: [], keys: new Set() };
  const enqueue = raw => {
    const u = normalize(raw, origin);
    if (u && !queued.has(u)) { queued.add(u); queue.push(u); }
  };

  while (queue.length && pages.length < o.max && Date.now() < deadline) {
    const url = queue.shift();
    let res;
    try { res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
    catch (e) { log(`skip (did not load): ${url}`); continue; }
    if (res && res.status() >= 400) { log(`skip (${res.status()}): ${url}`); continue; }
    await settle(page, 1200);
    const landed = normalize(page.url(), origin) || url;
    if (visited.has(landed)) continue;
    visited.add(landed);
    queued.add(landed);

    const name = new URL(landed).pathname === '/' ? 'Home' : shortTitle(await page.title().catch(() => ''), landed);
    await autoScroll(page);
    await run.shot(page, name, { kind: 'page', full: o.full, url: landed });
    pages.push({ url: landed, name });
    log(`page ${pages.length}: ${name}  (${landed})`);

    const links = await page.$$eval('a[href]', as => as.map(a => [a.href, (a.innerText || a.title || '').trim()])).catch(() => []);
    // Links are just page visits, so only the ones that change your account are skipped.
    for (const [href, text] of links) if (!LINK_DANGER.test(text + ' ' + href)) enqueue(href);

    if (o.clicks) {
      await explore(page, {
        title: name, memory, skip: o.skip, depth: o.depth, deadline,
        maxScreens: o.maxScreens,
        resetBase: async () => { await page.goto(landed, { waitUntil: 'domcontentloaded' }).catch(() => {}); await settle(page, 900); },
        shoot: t => run.shot(page, t, { kind: 'screen', url: landed }),
        onNavigate: enqueue
      });
    }
  }

  if (o.mobile && pages.length) {
    log('phone-size shots...');
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    });
    const mp = await phone.newPage();
    mp.on('dialog', d => d.dismiss().catch(() => {}));
    for (const p of pages.slice(0, o.mobileMax)) {
      try {
        await mp.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await settle(mp, 1000);
        await autoScroll(mp);
        await run.shot(mp, p.name, { kind: 'mobile', url: p.url });
      } catch { log(`phone shot failed: ${p.url}`); }
    }
    await phone.close();
  }
  await browser.close();
  return pages.length;
}
