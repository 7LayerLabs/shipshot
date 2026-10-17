// Turns a run folder into: index.html (browse every shot), promo/ (framed 16:9 and
// square images ready to post) and contact-sheet.png (every screen on one image).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from './web.mjs';
import { slug, log } from './common.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const FONT = `"Inter","Segoe UI Variable Display","Segoe UI",system-ui,sans-serif`;

function galleryHtml(m, promos, accent) {
  const kinds = { page: 'Pages', screen: 'Screens', mobile: 'Phone' };
  const counts = Object.fromEntries(Object.keys(kinds).map(k => [k, m.shots.filter(s => s.kind === k).length]));
  const when = new Date(m.started).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const cards = m.shots.map((s, i) => `
    <figure class="card ${s.kind}" data-kind="${s.kind}" data-i="${i}">
      <div class="thumb"><img loading="lazy" src="${esc(s.file)}" alt=""></div>
      <figcaption><span class="n">${String(s.n).padStart(2, '0')}</span><span class="t">${esc(s.title)}</span>
      ${s.full ? `<a class="full" href="${esc(s.full)}" target="_blank">Full page</a>` : ''}</figcaption>
    </figure>`).join('');
  const promoCards = promos.map(p => `<a class="promo" href="${esc(p)}" target="_blank"><img loading="lazy" src="${esc(p)}" alt=""></a>`).join('');
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
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:20px}
.card{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;cursor:zoom-in;transition:transform .18s,border-color .18s}
.card:hover{transform:translateY(-3px);border-color:var(--accent)}
.thumb{aspect-ratio:16/10;overflow:hidden;background:#000}.card.mobile .thumb{aspect-ratio:9/16;max-height:520px}
.thumb img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
figcaption{display:flex;align-items:center;gap:10px;padding:11px 14px;font-size:13.5px}
.n{font:600 12px ui-monospace,Consolas,monospace;color:var(--accent)}.t{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.full{color:var(--mute);font-size:12px;text-decoration:none;border:1px solid var(--line);border-radius:6px;padding:2px 8px}.full:hover{color:var(--ink)}
.promos{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.promo img{width:100%;display:block;border-radius:10px;border:1px solid var(--line)}
.hide{display:none}
#lb{position:fixed;inset:0;background:rgba(5,6,8,.94);display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px;z-index:9}
#lb.on{display:flex}#lb img{max-width:94vw;max-height:84vh;border-radius:8px;box-shadow:0 30px 80px rgba(0,0,0,.6)}
#lb p{margin:0;color:var(--mute)}#lb b{color:var(--ink)}
@media(max-width:600px){header,main{padding-left:16px;padding-right:16px}.grid{grid-template-columns:1fr}}
</style></head><body>
<header><h1>${esc(m.display || m.app)}</h1>
<div class="sub"><b>${m.shots.length}</b> shots &middot; ${esc(when)}${m.target ? ` &middot; ${esc(m.target)}` : ''}</div>
<div class="bar" id="bar"><button class="on" data-f="all">All ${m.shots.length}</button>
${Object.entries(kinds).filter(([k]) => counts[k]).map(([k, v]) => `<button data-f="${k}">${v} ${counts[k]}</button>`).join('')}</div></header>
<main>
${promos.length ? `<h2>Promo images</h2><div class="promos">${promoCards}</div><h2>Every screen</h2>` : ''}
<div class="grid" id="grid">${cards}</div></main>
<div id="lb"><img alt=""><p></p></div>
<script>
const cards=[...document.querySelectorAll('.card')],lb=document.getElementById('lb');let cur=0;
document.getElementById('bar').onclick=e=>{const f=e.target.dataset.f;if(!f)return;
document.querySelectorAll('#bar button').forEach(b=>b.classList.toggle('on',b===e.target));
cards.forEach(c=>c.classList.toggle('hide',f!=='all'&&c.dataset.kind!==f));};
const vis=()=>cards.filter(c=>!c.classList.contains('hide'));
function show(c){cur=vis().indexOf(c);lb.querySelector('img').src=c.querySelector('img').src;
lb.querySelector('p').innerHTML='<b>'+c.querySelector('.n').textContent+'</b> &nbsp;'+c.querySelector('.t').textContent;lb.classList.add('on');}
cards.forEach(c=>c.addEventListener('click',e=>{if(!e.target.closest('a'))show(c)}));
lb.onclick=()=>lb.classList.remove('on');
addEventListener('keydown',e=>{if(!lb.classList.contains('on'))return;const v=vis();
if(e.key==='Escape')lb.classList.remove('on');if(e.key==='ArrowRight')show(v[(cur+1)%v.length]);if(e.key==='ArrowLeft')show(v[(cur-1+v.length)%v.length]);});
</script></body></html>`;
}

function promoHtml({ img, title, app, accent, w, h, phone }) {
  const square = w === h;
  const shot = phone
    ? `<div class="phone"><img src="${img}"></div>`
    : `<div class="win"><div class="dots"><i></i><i></i><i></i></div><div class="vp"><img src="${img}"></div></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{width:${w}px;height:${h}px;overflow:hidden}
body{background:radial-gradient(120% 90% at 85% 0%,${accent}2e 0%,transparent 55%),radial-gradient(90% 80% at 0% 100%,#3a4bff1f 0%,transparent 60%),#0b0c10;
font-family:${FONT};color:#f2f3f6;display:flex;flex-direction:column;padding:${square ? 72 : 70}px ${square ? 72 : 96}px 0}
.k{font-size:${square ? 22 : 22}px;letter-spacing:.14em;text-transform:uppercase;color:${accent};font-weight:600}
h1{font-size:${square ? 58 : 60}px;letter-spacing:-.025em;line-height:1.05;margin-top:12px;max-width:${square ? 900 : 1500}px;font-weight:700}
.stage{flex:1;position:relative;margin-top:${square ? 48 : 44}px}
.win{position:absolute;left:0;right:0;top:0;bottom:-40px;border-radius:16px 16px 0 0;overflow:hidden;background:#15171c;
border:1px solid #ffffff1f;box-shadow:0 40px 120px #000000b0,0 0 0 1px #00000080}
.dots{height:38px;display:flex;gap:9px;align-items:center;padding-left:18px;background:#1b1d23;border-bottom:1px solid #ffffff14}
.dots i{width:12px;height:12px;border-radius:50%;background:#3a3d46}.dots i:first-child{background:${accent}}
.vp{position:absolute;top:38px;left:0;right:0;bottom:0;overflow:hidden}.vp img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block}
.phone{position:absolute;left:50%;transform:translateX(-50%);top:0;width:${square ? 400 : 430}px;bottom:-60px;border-radius:52px;padding:14px;background:#1a1c22;
border:1px solid #ffffff24;box-shadow:0 40px 120px #000000b0}.phone img{width:100%;border-radius:40px;display:block}
</style></head><body><div class="k">${esc(app)}</div><h1>${esc(title)}</h1><div class="stage">${shot}</div></body></html>`;
}

function contactHtml(m, accent) {
  const shots = m.shots.filter(s => s.kind !== 'mobile');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:2400px;background:#0b0c10;color:#eceef2;font-family:${FONT};padding:60px}
h1{font-size:44px;letter-spacing:-.02em}p{color:#8b909c;font-size:20px;margin:6px 0 40px}
.g{display:grid;grid-template-columns:repeat(4,1fr);gap:28px}
.c{background:#15171c;border:1px solid #24272f;border-radius:12px;overflow:hidden}
.c div{aspect-ratio:16/10;overflow:hidden}.c img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.c span{display:block;padding:12px 16px;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.c b{color:${accent};margin-right:10px;font-family:Consolas,monospace}
</style></head><body><h1>${esc(m.display || m.app)}</h1><p>${shots.length} screens</p><div class="g">
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

export async function buildOutputs(dir, { promo = true, promoMax = 12, accent = '#ffd400' } = {}) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'shots.json'), 'utf8'));
  const promos = [];
  if (promo && m.shots.length) {
    log('making promo images...');
    fs.mkdirSync(path.join(dir, 'promo'), { recursive: true });
    const browser = await launchBrowser(false);
    const page = await browser.newPage();
    const tmp = path.join(dir, '_render.html');
    const render = async (html, w, h, out) => {
      fs.writeFileSync(tmp, html);
      await page.setViewportSize({ width: w, height: h });
      await page.goto(pathToFileURL(tmp).href);
      await page.waitForLoadState('load');
      await page.screenshot({ path: path.join(dir, out) });
    };
    const picks = [...pickPromos(m.shots, promoMax), ...m.shots.filter(s => s.kind === 'mobile').slice(0, 4)];
    for (const s of picks) {
      const img = pathToFileURL(path.join(dir, s.file)).href;
      const title = caption(s.title);
      const base = `promo/${String(s.n).padStart(2, '0')}-${slug(s.title, 40)}`;
      const phone = s.kind === 'mobile';
      if (!phone) {
        await render(promoHtml({ img, title, app: m.display || m.app, accent, w: 1920, h: 1080 }), 1920, 1080, `${base}-16x9.png`);
        promos.push(`${base}-16x9.png`);
      }
      await render(promoHtml({ img, title, app: m.display || m.app, accent, w: 1080, h: 1080, phone }), 1080, 1080, `${base}-square.png`);
      promos.push(`${base}-square.png`);
    }
    if (m.shots.some(s => s.kind !== 'mobile')) {
      fs.writeFileSync(tmp, contactHtml(m, accent));
      await page.setViewportSize({ width: 2400, height: 1200 });
      await page.goto(pathToFileURL(tmp).href); // sits in the run folder, so shot paths resolve
      await page.waitForLoadState('load');
      await page.screenshot({ path: path.join(dir, 'contact-sheet.png'), fullPage: true });
    }
    fs.rmSync(tmp, { force: true });
    await browser.close();
  }
  fs.writeFileSync(path.join(dir, 'index.html'), galleryHtml(m, promos, accent));
  return { promos: promos.length };
}
