// Turns a run folder into: index.html (browse every shot), promo/ (framed 16:9 and
// square images ready to post), share/<platform>/ (sized for X, Discord, GitHub...) and
// contact-sheet-N.png (twelve screens per sheet).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from './web.mjs';
import { slug, log } from './common.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const FONT = `"Inter","Segoe UI Variable Display","Segoe UI",system-ui,sans-serif`;
const SHEET = 12; // shots per contact sheet: 4 x 3 stays readable without zooming

// Sizes and limits each platform wants. `phone`: use the phone shots when there are some.
export const SHARE = {
  x:         { label: 'X',                     w: 1600, h: 900,  max: 4, mb: 5 },
  discord:   { label: 'Discord',               w: 1920, h: 1080, max: 8, mb: 10 },
  github:    { label: 'GitHub social preview', w: 1280, h: 640,  max: 1, mb: 1 },
  linkedin:  { label: 'LinkedIn',              w: 1200, h: 627,  max: 6, mb: 5 },
  instagram: { label: 'Instagram',             w: 1080, h: 1350, max: 6, mb: 8, phone: true },
  og:        { label: 'Link preview (Open Graph)', w: 1200, h: 630, max: 1, mb: 1 },
};

function galleryHtml(m, promos, sheets, share, accent) {
  const kinds = { page: 'Pages', screen: 'Screens', mobile: 'Phone' };
  const counts = Object.fromEntries(Object.keys(kinds).map(k => [k, m.shots.filter(s => s.kind === k).length]));
  const when = new Date(m.started).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const cards = m.shots.map(s => {
    const imgs = [s.file, ...(s.sections || [])];
    return `
    <figure class="card ${s.kind}" data-kind="${s.kind}" data-imgs="${esc(imgs.join(' '))}">
      <div class="thumb"><img loading="lazy" src="${esc(s.file)}" alt="">${imgs.length > 1 ? `<span class="sec">${imgs.length} screens tall</span>` : ''}</div>
      <figcaption><span class="n">${String(s.n).padStart(2, '0')}</span><span class="t">${esc(s.title)}</span>
      ${s.full ? `<a class="full" href="${esc(s.full)}" target="_blank">Full page</a>` : ''}</figcaption>
    </figure>`;
  }).join('');
  const strip = (files, cls = 'promos') => `<div class="${cls}">${files.map(p => `<a class="promo" href="${esc(p)}" target="_blank"><img loading="lazy" src="${esc(p)}" alt=""></a>`).join('')}</div>`;
  const shareHtml = Object.entries(share).map(([k, files]) =>
    `<h3>${esc(SHARE[k].label)} <span>${SHARE[k].w}&times;${SHARE[k].h} &middot; share/${k}/</span></h3>${strip(files)}`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.display || m.app)} screenshots</title>
<style>
:root{--bg:#0c0d10;--panel:#15171c;--line:#24272f;--ink:#eceef2;--mute:#8b909c;--accent:${accent}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 ${FONT}}
header{padding:40px 32px 20px;max-width:1500px;margin:auto}
h1{font-size:34px;letter-spacing:-.02em;margin:0 0 4px}
.sub{color:var(--mute)}.sub b{color:var(--ink);font-weight:600}
.bar{display:flex;gap:8px;flex-wrap:wrap;margin-top:22px}
.bar button{background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:7px 15px;font:inherit;cursor:pointer}
.bar button.on{background:var(--accent);color:#111;border-color:var(--accent);font-weight:600}
main{max-width:1500px;margin:auto;padding:8px 32px 60px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:var(--mute);margin:34px 0 14px}
h3{font-size:16px;margin:22px 0 10px}h3 span{color:var(--mute);font-weight:400;font-size:13px;margin-left:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:20px}
.card{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;cursor:zoom-in;transition:transform .18s,border-color .18s}
.card:hover{transform:translateY(-3px);border-color:var(--accent)}
.thumb{aspect-ratio:16/10;overflow:hidden;background:#000;position:relative}.card.mobile .thumb{aspect-ratio:9/16;max-height:520px}
.thumb img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.sec{position:absolute;right:10px;bottom:10px;background:#000c;color:var(--ink);border:1px solid #ffffff2a;border-radius:999px;padding:2px 10px;font-size:12px}
figcaption{display:flex;align-items:center;gap:10px;padding:11px 14px;font-size:13.5px}
.n{font:600 12px ui-monospace,Consolas,monospace;color:var(--accent)}.t{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.full{color:var(--mute);font-size:12px;text-decoration:none;border:1px solid var(--line);border-radius:6px;padding:2px 8px}.full:hover{color:var(--ink)}
.promos{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.promo img{width:100%;display:block;border-radius:10px;border:1px solid var(--line)}
.hide{display:none}
#lb{position:fixed;inset:0;background:rgba(5,6,8,.94);display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px;z-index:9}
#lb.on{display:flex}#lb img{max-width:94vw;max-height:84vh;border-radius:8px;box-shadow:0 30px 80px rgba(0,0,0,.6)}
#lb p{margin:0;color:var(--mute)}#lb b{color:var(--ink)}#lb i{font-style:normal;color:var(--accent)}
@media(max-width:600px){header,main{padding-left:16px;padding-right:16px}.grid{grid-template-columns:1fr}}
</style></head><body>
<header><h1>${esc(m.display || m.app)}</h1>
<div class="sub"><b>${m.shots.length}</b> shots &middot; ${esc(when)}${m.target ? ` &middot; ${esc(m.target)}` : ''}</div>
<div class="bar" id="bar"><button class="on" data-f="all">All ${m.shots.length}</button>
${Object.entries(kinds).filter(([k]) => counts[k]).map(([k, v]) => `<button data-f="${k}">${v} ${counts[k]}</button>`).join('')}</div></header>
<main>
${shareHtml ? `<h2>Ready to post</h2>${shareHtml}` : ''}
${promos.length ? `<h2>Promo images</h2>${strip(promos)}` : ''}
${sheets.length ? `<h2>Contact sheets</h2>${strip(sheets)}` : ''}
${shareHtml || promos.length || sheets.length ? '<h2>Every screen</h2>' : ''}
<div class="grid" id="grid">${cards}</div></main>
<div id="lb"><img alt=""><p><b></b> &nbsp;<span></span> <i></i></p></div>
<script>
const cards=[...document.querySelectorAll('.card')],lb=document.getElementById('lb'),img=lb.querySelector('img');let cur=0,sub=0;
document.getElementById('bar').onclick=e=>{const f=e.target.dataset.f;if(!f)return;
document.querySelectorAll('#bar button').forEach(b=>b.classList.toggle('on',b===e.target));
cards.forEach(c=>c.classList.toggle('hide',f!=='all'&&c.dataset.kind!==f));};
const vis=()=>cards.filter(c=>!c.classList.contains('hide'));
const imgs=c=>c.dataset.imgs.split(' ');
// A long page is several screens: the arrows go down the page first, then to the next card.
function show(c,k=0){const v=vis();cur=v.indexOf(c);const l=imgs(c);sub=(k+l.length)%l.length;img.src=l[sub];
lb.querySelector('b').textContent=c.querySelector('.n').textContent;lb.querySelector('span').textContent=c.querySelector('.t').textContent;
lb.querySelector('i').textContent=l.length>1?(sub+1)+' of '+l.length:'';lb.classList.add('on');}
function step(d){const v=vis(),c=v[cur],l=imgs(c);if(sub+d>=0&&sub+d<l.length)return show(c,sub+d);
const n=v[(cur+d+v.length)%v.length];show(n,d<0?imgs(n).length-1:0);}
cards.forEach(c=>c.addEventListener('click',e=>{if(!e.target.closest('a'))show(c)}));
lb.onclick=()=>lb.classList.remove('on');
addEventListener('keydown',e=>{if(!lb.classList.contains('on'))return;
if(e.key==='Escape')lb.classList.remove('on');if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();step(1)}if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();step(-1)}});
</script></body></html>`;
}

// A framed shot with a headline. Everything scales with the canvas, so the same layout
// works from a 1200x627 LinkedIn card to a 1080x1350 Instagram post.
function promoHtml({ img, title, app, accent, w, h, phone }) {
  const s = Math.min(w, h) / 1080;
  const narrow = w / h < 1.3;
  const px = n => `${Math.round(n * s)}px`;
  const shot = phone
    ? `<div class="phone"><img src="${img}"></div>`
    : `<div class="win"><div class="dots"><i></i><i></i><i></i></div><div class="vp"><img src="${img}"></div></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{width:${w}px;height:${h}px;overflow:hidden}
body{background:radial-gradient(120% 90% at 85% 0%,${accent}2e 0%,transparent 55%),radial-gradient(90% 80% at 0% 100%,#3a4bff1f 0%,transparent 60%),#0b0c10;
font-family:${FONT};color:#f2f3f6;display:flex;flex-direction:column;padding:${px(70)} ${px(narrow ? 72 : 96)} 0}
.k{font-size:${px(22)};letter-spacing:.14em;text-transform:uppercase;color:${accent};font-weight:600}
h1{font-size:${px(narrow ? 58 : 60)};letter-spacing:-.025em;line-height:1.05;margin-top:${px(12)};max-width:${Math.round(w * (narrow ? 0.85 : 0.78))}px;font-weight:700}
.stage{flex:1;position:relative;margin-top:${px(44)}}
.win{position:absolute;left:0;right:0;top:0;bottom:-40px;border-radius:${px(16)} ${px(16)} 0 0;overflow:hidden;background:#15171c;
border:1px solid #ffffff1f;box-shadow:0 40px 120px #000000b0,0 0 0 1px #00000080}
.dots{height:${px(38)};display:flex;gap:${px(9)};align-items:center;padding-left:${px(18)};background:#1b1d23;border-bottom:1px solid #ffffff14}
.dots i{width:${px(12)};height:${px(12)};border-radius:50%;background:#3a3d46}.dots i:first-child{background:${accent}}
.vp{position:absolute;top:${px(38)};left:0;right:0;bottom:0;overflow:hidden}.vp img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block}
.phone{position:absolute;left:50%;transform:translateX(-50%);top:0;width:${Math.round(h * 0.4)}px;bottom:-60px;border-radius:${px(52)};padding:${px(14)};background:#1a1c22;
border:1px solid #ffffff24;box-shadow:0 40px 120px #000000b0}.phone img{width:100%;border-radius:${px(40)};display:block}
</style></head><body><div class="k">${esc(app)}</div><h1>${esc(title)}</h1><div class="stage">${shot}</div></body></html>`;
}

function contactHtml(m, shots, sheet, sheets, accent) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:2400px;background:#0b0c10;color:#eceef2;font-family:${FONT};padding:60px}
h1{font-size:44px;letter-spacing:-.02em}p{color:#8b909c;font-size:20px;margin:6px 0 40px}
.g{display:grid;grid-template-columns:repeat(4,1fr);gap:28px}
.c{background:#15171c;border:1px solid #24272f;border-radius:12px;overflow:hidden}
.c div{aspect-ratio:16/10;overflow:hidden}.c img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.c span{display:block;padding:12px 16px;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.c b{color:${accent};margin-right:10px;font-family:Consolas,monospace}
</style></head><body><h1>${esc(m.display || m.app)}</h1><p>${sheets > 1 ? `Sheet ${sheet} of ${sheets} &middot; ` : ''}${shots.length} screens</p><div class="g">
${shots.map(s => `<div class="c"><div><img src="${esc(s.file)}"></div><span><b>${String(s.n).padStart(2, '0')}</b>${esc(s.title)}</span></div>`).join('')}
</div></body></html>`;
}

// Short caption for a promo: the last part of "VibeDeck / Settings / Answers" reads best.
function caption(t) {
  const parts = t.split(' / ');
  return parts.length > 1 ? parts.slice(1).join('  /  ') : t.replace(/\s+[-|]\s+.*$/, '');
}

// Every page first, then clicked screens taken in turns from each page, so one page
// with twelve filter tabs does not fill the whole promo set.
function pickPromos(shots, max) {
  const pages = shots.filter(s => s.kind === 'page');
  const byParent = new Map();
  for (const s of shots.filter(s => s.kind === 'screen')) {
    const k = s.title.split(' / ')[0];
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(s);
  }
  const out = pages.slice(0, max);
  const lists = [...byParent.values()];
  for (let round = 0; out.length < max && lists.some(l => l[round]); round++)
    for (const l of lists) if (l[round] && out.length < max) out.push(l[round]);
  return out.sort((a, b) => a.n - b.n);
}

// Renders HTML snippets to images with a few tabs at once. Each job:
// { html, w, h, out, full?, jpeg?: maxMB }. JPEGs drop quality until they fit the limit.
async function renderAll(dir, jobs, tabs = 4) {
  if (!jobs.length) return;
  const browser = await launchBrowser(false);
  const queue = [...jobs];
  await Promise.all(Array.from({ length: Math.min(tabs, jobs.length) }, async (_, i) => {
    const page = await browser.newPage();
    const tmp = path.join(dir, `_render-${i}.html`); // sits in the run folder, so shot paths resolve
    for (let job; (job = queue.shift());) {
      fs.writeFileSync(tmp, job.html);
      await page.setViewportSize({ width: job.w, height: job.h });
      await page.goto(pathToFileURL(tmp).href);
      await page.waitForLoadState('load');
      const out = path.join(dir, job.out);
      if (!job.jpeg) { await page.screenshot({ path: out, fullPage: !!job.full }); continue; }
      for (const quality of [90, 80, 70, 55]) {
        await page.screenshot({ path: out, type: 'jpeg', quality });
        if (fs.statSync(out).size <= job.jpeg * 1e6) break;
      }
    }
    fs.rmSync(tmp, { force: true });
  }));
  await browser.close();
}

export async function buildOutputs(dir, { promo = true, promoMax = 12, accent = '#ffd400', share = [] } = {}) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'shots.json'), 'utf8'));
  const app = m.display || m.app;
  const promos = [], sheets = [], shared = {}, jobs = [];
  const frame = (s, w, h, phone) => promoHtml({ img: pathToFileURL(path.join(dir, s.file)).href, title: caption(s.title), app, accent, w, h, phone });
  const name = s => `${String(s.n).padStart(2, '0')}-${slug(s.title, 40)}`;
  const phones = m.shots.filter(s => s.kind === 'mobile');

  if (promo && m.shots.length) {
    fs.mkdirSync(path.join(dir, 'promo'), { recursive: true });
    for (const s of [...pickPromos(m.shots, promoMax), ...phones.slice(0, 4)]) {
      const phone = s.kind === 'mobile';
      if (!phone) {
        jobs.push({ html: frame(s, 1920, 1080), w: 1920, h: 1080, out: `promo/${name(s)}-16x9.png` });
        promos.push(`promo/${name(s)}-16x9.png`);
      }
      jobs.push({ html: frame(s, 1080, 1080, phone), w: 1080, h: 1080, out: `promo/${name(s)}-square.png` });
      promos.push(`promo/${name(s)}-square.png`);
    }
    const desk = m.shots.filter(s => s.kind !== 'mobile');
    const count = Math.ceil(desk.length / SHEET);
    for (let i = 0; i < count; i++) {
      const out = `contact-sheet-${i + 1}.png`;
      jobs.push({ html: contactHtml(m, desk.slice(i * SHEET, (i + 1) * SHEET), i + 1, count, accent), w: 2400, h: 1200, out, full: true });
      sheets.push(out);
    }
  }

  for (const k of share) {
    const p = SHARE[k];
    if (!p || !m.shots.length) continue;
    fs.mkdirSync(path.join(dir, 'share', k), { recursive: true });
    const usePhone = p.phone && phones.length;
    const picks = usePhone ? phones.slice(0, p.max) : pickPromos(m.shots, p.max);
    shared[k] = [];
    for (const s of picks) {
      const out = p.max === 1 ? `share/${k}/${k === 'github' ? 'social-preview' : 'preview'}.jpg` : `share/${k}/${name(s)}.jpg`;
      jobs.push({ html: frame(s, p.w, p.h, usePhone), w: p.w, h: p.h, out, jpeg: p.mb });
      shared[k].push(out);
    }
  }

  if (jobs.length) {
    log(`making ${jobs.length} promo and share images...`);
    await renderAll(dir, jobs);
  }
  fs.writeFileSync(path.join(dir, 'index.html'), galleryHtml(m, promos, sheets, shared, accent));
  return { promos: promos.length, shared: Object.values(shared).flat().length };
}
