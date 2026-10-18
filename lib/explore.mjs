// Click-through explorer shared by website and desktop-app modes.
// A "screen" is whatever the page shows after a chain of safe clicks (a tab, a dialog,
// a settings panel). Screens are found breadth-first and each new one is photographed once.
import { DANGER, sleep, log } from './common.mjs';

// Runs inside the page. Tags every safe clickable with data-shipshot-i and describes it.
function collectInPage({ danger, skip }) {
  const re = new RegExp(danger, 'i');
  document.querySelectorAll('[data-shipshot-i]').forEach(e => e.removeAttribute('data-shipshot-i'));
  const sel = 'button, [role=button], [role=tab], summary, [aria-haspopup], [data-tab], [data-view], a[href^="#"]';
  const bad = '.xterm, [role=menu], [role=listbox], select, [contenteditable=true], input, textarea';
  const out = [];
  const counts = {};
  for (const el of document.querySelectorAll(sel)) {
    if (el.closest(bad)) continue;
    if (skip && el.closest(skip)) continue;
    if (el.matches('[role=menuitem],[role=option],[role=menuitemradio],[role=menuitemcheckbox],[role=switch],[role=checkbox],[role=radio]')) continue;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
    if (el.closest('a[href]:not([href^="#"])')) continue; // real links: the crawler visits them, desktop mode ignores them
    if (el.closest('a[target=_blank]')) continue;
    const inForm = el.closest('form');
    if (inForm && el.tagName === 'BUTTON' && (el.getAttribute('type') || 'submit') === 'submit') continue;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.right < 0 || r.left > innerWidth) continue;
    let label = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
    if (!label || re.test(label)) continue;
    // "Settings (Ctrl+,)" -> "Settings", "Review 21" -> "Review"
    label = label.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+\d+%?$/, '').slice(0, 60) || label.slice(0, 60);
    const chrome = !!el.closest('nav, header, aside, footer, [role=navigation], [role=banner], [role=contentinfo], .statusbar, .status-bar, .titlebar')
      && !el.closest('dialog, [role=dialog]');
    const base = (chrome ? 'chrome' : 'page') + '|' + label;
    counts[base] = (counts[base] || 0) + 1;
    el.setAttribute('data-shipshot-i', String(out.length));
    out.push({ i: out.length, key: base + '|' + counts[base], label, chrome });
  }
  return out;
}

// Runs inside the page. The visible text, line by line, minus terminals and digits
// (clocks, counters and meters change on their own and would look like new screens).
function textLinesInPage() {
  const lines = new Set();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || !n.textContent.trim()) return NodeFilter.FILTER_REJECT;
      if (p.closest('.xterm, script, style, noscript, [aria-hidden=true]')) return NodeFilter.FILTER_REJECT;
      if (p.checkVisibility && !p.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  while (walk.nextNode() && lines.size < 600) {
    const t = walk.currentNode.textContent.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (t.length > 1) lines.add(t);
  }
  // A new tab, an open dialog or an expanded section is a new screen even when only a
  // line or two of text changed, so each one counts as three lines.
  const open = 'dialog[open], [role=dialog], [role=alertdialog], [aria-modal=true], [aria-selected=true], [aria-expanded=true], details[open]';
  for (const el of document.querySelectorAll(open)) {
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const name = (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    for (let k = 0; k < 3; k++) lines.add(`\u0000${el.tagName}|${name}|${k}`);
  }
  return [...lines];
}

function distance(a, b) {
  const A = new Set(a), B = new Set(b);
  let d = 0;
  for (const x of A) if (!B.has(x)) d++;
  for (const x of B) if (!A.has(x)) d++;
  return d;
}

// Runs inside the page. Resolves once nothing has changed for `quiet` ms and the images
// on screen have loaded, or after `max` ms. Terminals, clocks, video and progress bars
// are ignored because they never stop changing.
function quietInPage({ quiet, max }) {
  return new Promise(done => {
    const t0 = performance.now();
    let last = t0, fonts = !document.fonts;
    document.fonts?.ready.then(() => { fonts = true; });
    const live = '.xterm, canvas, video, [aria-live], [role=status], [role=timer], [role=progressbar], [role=marquee]';
    const mo = new MutationObserver(recs => {
      for (const r of recs) {
        const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        if (!el || !el.closest(live)) { last = performance.now(); return; }
      }
    });
    mo.observe(document, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['class', 'hidden', 'open', 'src', 'aria-hidden', 'aria-expanded', 'aria-selected'] });
    const imagesIn = () => [...document.images].every(i => {
      if (i.complete) return true;
      const r = i.getBoundingClientRect();
      return r.bottom < 0 || r.top > innerHeight || r.width === 0;
    });
    const tick = () => {
      const now = performance.now();
      if (now - t0 >= max || (fonts && now - last >= quiet && imagesIn())) { mo.disconnect(); done(); }
      else setTimeout(tick, 50);
    };
    tick();
  });
}

// Waits until the page has stopped changing. `load: true` after a navigation also waits
// (briefly) for the load event, so data fetched on start-up has a chance to arrive.
export async function settle(page, { quiet = 250, max = 2000, load = false, min = 0 } = {}) {
  const t0 = Date.now();
  await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
  if (load) await page.waitForLoadState('load', { timeout: 4000 }).catch(() => {});
  await page.evaluate(quietInPage, { quiet, max }).catch(() => {});
  if (Date.now() - t0 < min) await sleep(min - (Date.now() - t0));
}

/**
 * Explore one page. `resetBase` must bring the page back to its starting screen.
 * `shoot(title)` takes the photo. `onNavigate(url)` hears about clicks that left the page.
 * `memory` ({ sigs, keys }) is shared across pages so the same menu is not shot twice.
 */
export async function explore(page, opts) {
  const {
    title, resetBase, shoot, onNavigate, memory,
    skip = '', depth = 2, maxScreens = 30, maxClicks = 120, deadline = Infinity, settleMs = 2000
  } = opts;
  const args = { danger: DANGER.source, skip };
  const collect = () => page.evaluate(collectInPage, args).catch(() => []);
  const sig = () => page.evaluate(textLinesInPage).catch(() => []);
  const seen = sig => memory.sigs.some(s => distance(s, sig) <= 2);
  const startUrl = page.url();

  async function clickKey(key) {
    const c = (await collect()).find(x => x.key === key);
    if (!c) return false;
    try {
      await page.locator(`[data-shipshot-i="${c.i}"]`).first().click({ timeout: 2500 });
    } catch { return false; }
    await settle(page, { max: settleMs });
    return true;
  }

  async function goTo(state) {
    await resetBase();
    for (const key of state.path) if (!(await clickKey(key))) return false;
    return true;
  }

  // Back to `state` before the next click. Escape closes most dialogs and menus and is
  // far quicker than reloading, so try it first and only reload if the screen differs.
  async function backTo(state) {
    if (page.url() === startUrl) {
      if (distance(await sig(), state.sig) <= 2) return true;
      await page.keyboard.press('Escape').catch(() => {});
      await settle(page, { max: 1000 });
      if (page.url() === startUrl && distance(await sig(), state.sig) <= 2) return true;
    }
    return goTo(state);
  }

  const baseSig = await sig();
  if (!seen(baseSig)) memory.sigs.push(baseSig);
  const states = [{ path: [], labels: [], sig: baseSig }];
  let clicks = 0, screens = 0;

  for (let si = 0; si < states.length; si++) {
    const st = states[si];
    if (st.path.length >= depth) continue;
    if (si > 0 && !(await goTo(st))) continue;
    // A deeper screen only explores what its click revealed (the buttons in a dialog that
    // just opened, say). Re-clicking the parent's own tabs with it open only makes near-copies.
    const all = await collect();
    st.keys = new Set(all.map(c => c.key));
    const cands = st.parent ? all.filter(c => !st.parent.keys.has(c.key)) : all;
    for (const c of cands) {
      if (clicks >= maxClicks || screens >= maxScreens || Date.now() > deadline) return screens;
      const gk = c.chrome ? 'chrome|' + c.label : st.path.join('>') + '>' + c.key;
      if (memory.keys.has(gk)) continue;
      memory.keys.add(gk);
      if (!(await backTo(st))) break;
      clicks++;
      if (!(await clickKey(c.key))) continue;
      if (page.url() !== startUrl) {
        onNavigate?.(page.url());
        continue;
      }
      const s = await sig();
      if (page.url() !== startUrl) { onNavigate?.(page.url()); continue; } // a late redirect, e.g. to a sign-in page
      if (seen(s)) continue;
      memory.sigs.push(s);
      const labels = [...st.labels, c.label];
      await shoot(`${title} / ${labels.join(' / ')}`);
      screens++;
      log(`screen: ${labels.join(' > ')}`);
      states.push({ path: [...st.path, c.key], labels, sig: s, parent: st });
    }
  }
  return screens;
}
