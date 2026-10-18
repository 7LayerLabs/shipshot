// The page shown in the SnapTour app window. Talks to lib/app.mjs over /api/*.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function appHtml(token, share) {
  const shareChips = Object.entries(share).map(([k, p]) =>
    `<label class="chip"><input type="checkbox" name="share" value="${k}"><span>${esc(p.label.replace(/ \(.*\)/, '').replace('GitHub social preview', 'GitHub'))}<small>${p.w}&times;${p.h}</small></span></label>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SnapTour</title><link rel="icon" href="/logo.svg">
<style>
:root{--bg:#0c0d10;--panel:#15171c;--panel2:#1b1e24;--line:#262a33;--ink:#eceef2;--mute:#8b909c;--accent:#ffd400;--bad:#ff6b6b;--ok:#5fd38d}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:14.5px/1.5 "Inter","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}
button,input{font:inherit;color:inherit}
.wrap{max-width:1040px;margin:auto;padding:26px 28px 50px}
header{display:flex;align-items:center;gap:14px;margin-bottom:22px}
header img{width:42px;height:42px}header h1{font-size:22px;margin:0;letter-spacing:-.01em}header p{margin:0;color:var(--mute);font-size:13px}
header .sp{flex:1}
.btn{background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:8px 14px;cursor:pointer;white-space:nowrap}
.btn:hover{border-color:#3a3f4b}.btn.primary{background:var(--accent);border-color:var(--accent);color:#111;font-weight:650;padding:12px 26px;font-size:15.5px}
.btn.primary:hover{filter:brightness(1.07)}.btn.stop{background:#2a1517;border-color:#5a2a2e;color:#ffb3b3;font-weight:600;padding:12px 26px;font-size:15.5px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:22px}
.seg{display:inline-flex;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:3px;margin-bottom:16px}
.seg button{background:none;border:0;border-radius:7px;padding:7px 16px;cursor:pointer;color:var(--mute)}
.seg button.on{background:var(--panel2);color:var(--ink);box-shadow:0 0 0 1px var(--line)}
.row{display:flex;gap:12px;align-items:stretch;flex-wrap:wrap}
.target{flex:1;min-width:260px;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:12px 14px;font-size:16px;outline:none}
.target:focus,.name:focus,.opts input[type=number]:focus{border-color:var(--accent)}
.name{width:220px;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:12px 14px;outline:none}
.hint{color:var(--mute);font-size:13px;margin:10px 0 0}.hint b{color:var(--ink);font-weight:600}
.saved{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.saved button{background:none;border:1px dashed var(--line);border-radius:999px;padding:4px 12px;cursor:pointer;color:var(--mute);font-size:13px}
.saved button:hover{color:var(--ink);border-color:var(--mute)}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:var(--mute);margin:22px 0 10px;font-weight:600}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip input{position:absolute;opacity:0;pointer-events:none}
.chip span{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:10px;padding:7px 13px;cursor:pointer;line-height:1.25;background:var(--bg)}
.chip small{color:var(--mute);font-size:11.5px}
.chip input:checked+span{border-color:var(--accent);background:#ffd40014}.chip input:checked+span small{color:#d9c25a}
.chip input:focus-visible+span{outline:2px solid var(--accent);outline-offset:2px}
details{margin-top:18px}summary{cursor:pointer;color:var(--mute);font-size:13.5px}summary:hover{color:var(--ink)}
.opts{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px 22px;margin-top:14px}
.opts label{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--mute);font-size:13.5px}
.opts input[type=number]{width:74px;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:6px 8px;outline:none;text-align:right}
.opts input[type=checkbox]{accent-color:var(--accent);width:16px;height:16px}
.go{display:flex;align-items:center;gap:16px;margin-top:22px}.go .msg{color:var(--bad);font-size:13.5px}
.live{margin-top:18px}
.status{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.dot{width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 0 #ffd40080;animation:pulse 1.4s infinite}
.dot.done{background:var(--ok);animation:none}.dot.fail{background:var(--bad);animation:none}
@keyframes pulse{70%{box-shadow:0 0 0 9px #ffd40000}100%{box-shadow:0 0 0 0 #ffd40000}}
.status b{font-size:15.5px}.stats{color:var(--mute);font-size:13.5px}.status .sp{flex:1}
.log{margin-top:14px;background:#08090b;border:1px solid var(--line);border-radius:10px;padding:12px 14px;height:210px;overflow:auto;
font:12.5px/1.6 ui-monospace,"Cascadia Mono",Consolas,monospace;color:#b9bec9;white-space:pre-wrap}
.log .p{color:var(--ink)}.log .s{color:#d9c25a}.log .e{color:var(--bad)}
.runs{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
.run{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;cursor:pointer;transition:border-color .15s,transform .15s;text-align:left;padding:0}
.run:hover{border-color:var(--accent);transform:translateY(-2px)}
.run .th{aspect-ratio:16/10;background:#000 center top/cover no-repeat}
.run .meta{padding:9px 12px}.run .meta b{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.run .meta span{color:var(--mute);font-size:12.5px}
.empty{color:var(--mute);font-size:13.5px}
[hidden]{display:none!important}
@media(max-width:640px){.wrap{padding:18px 16px 40px}.name{width:100%}header p{display:none}}
</style></head><body><div class="wrap">
<header><img src="/logo.svg" alt=""><div><h1>SnapTour</h1><p>Screenshots of every page and screen, ready to post</p></div><div class="sp"></div>
<button class="btn" id="openOut">Open Screenshots folder</button></header>

<div class="card">
  <div class="seg" id="mode"><button class="on" data-m="site">Website or app</button><button data-m="watch">Any program (you click)</button></div>
  <div class="row">
    <input class="target" id="target" placeholder="menusparks.com, localhost:3001, or a saved app" autocomplete="off" spellcheck="false">
    <input class="name" id="name" placeholder="Folder name (optional)" autocomplete="off" spellcheck="false">
  </div>
  <div class="saved" id="saved"></div>
  <p class="hint" id="hintSite">Visits every page, clicks through tabs, menus and dialogs (never buttons that change things), and shoots long pages one screen at a time.</p>
  <p class="hint" id="hintWatch" hidden>Type part of a window title, or leave it empty for whatever window you click on. Then click around that program: each new screen is shot. <b>F8</b> = shot now, <b>F10</b> = done.</p>

  <h2>Also make images for</h2>
  <div class="chips" id="share">${shareChips}</div>

  <details id="more"><summary>More options</summary><div class="opts">
    <label>Most pages <input type="number" id="max" min="1" value="40"></label>
    <label>Time limit (minutes) <input type="number" id="minutes" min="1" value="10"></label>
    <label>Shots per long page <input type="number" id="sections" min="0" value="10"></label>
    <label>Phone-size shots <input type="checkbox" id="mobile" checked></label>
    <label>Click tabs and menus <input type="checkbox" id="clicks" checked></label>
    <label>Show the browser <input type="checkbox" id="headed"></label>
  </div></details>

  <div class="go"><button class="btn primary" id="start">Start</button><button class="btn stop" id="stop" hidden>Stop</button><span class="msg" id="msg"></span></div>

  <div class="live" id="live" hidden>
    <div class="status"><span class="dot" id="dot"></span><b id="title"></b><span class="stats" id="stats"></span><span class="sp"></span>
      <button class="btn" id="openGallery" hidden>Open gallery</button><button class="btn" id="openFolder" hidden>Open folder</button></div>
    <div class="log" id="log"></div>
  </div>
</div>

<h2>Past runs</h2>
<div class="runs" id="runs"></div>
</div>
<script>
const T=${JSON.stringify(token)},$=id=>document.getElementById(id);
const api=(p,body)=>fetch(p+(p.includes('?')?'&':'?')+'t='+T,{method:body?'POST':'GET',headers:{'x-snaptour':T,'content-type':'application/json'},body:body&&JSON.stringify(body)}).then(r=>r.json());
const store={get(k,d){try{const v=localStorage.getItem('st:'+k);return v==null?d:JSON.parse(v)}catch{return d}},set(k,v){try{localStorage.setItem('st:'+k,JSON.stringify(v))}catch{}}};
let mode='site',from=0,running=false,started=0,rel=null,counts={p:0,s:0,m:0};

// remember choices between runs
const fields=['max','minutes','sections','mobile','clicks','headed'];
for(const f of fields){const v=store.get(f);if(v!=null)$(f)[$(f).type==='checkbox'?'checked':'value']=v}
const shareOn=store.get('share',['x','discord']);
document.querySelectorAll('[name=share]').forEach(c=>c.checked=shareOn.includes(c.value));

function setMode(m){mode=m;document.querySelectorAll('#mode button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));
$('target').placeholder=m==='watch'?'Window title, e.g. Photoshop (optional)':'menusparks.com, localhost:3001, or a saved app';
$('hintSite').hidden=m==='watch';$('hintWatch').hidden=m!=='watch';$('saved').hidden=m==='watch';$('more').hidden=m==='watch';}
$('mode').onclick=e=>{if(e.target.dataset.m)setMode(e.target.dataset.m)};

const ago=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})};
function renderRuns(runs){const box=$('runs');box.replaceChildren();
if(!runs.length){const p=document.createElement('p');p.className='empty';p.textContent='Nothing yet. Your runs will show up here.';box.append(p);return}
for(const r of runs){const b=document.createElement('button');b.className='run';b.title='Open the gallery';
const th=document.createElement('div');th.className='th';if(r.thumb)th.style.backgroundImage='url("/out/'+r.thumb.split('/').map(encodeURIComponent).join('/')+'?t='+T+'")';
const m=document.createElement('div');m.className='meta';const n=document.createElement('b');n.textContent=r.name;const s=document.createElement('span');s.textContent=r.shots+' shots \\u00b7 '+ago(r.started);
m.append(n,s);b.append(th,m);b.onclick=()=>api('/api/open',{rel:r.rel,what:'gallery'});box.append(b)}}
function renderSaved(apps){const box=$('saved');box.replaceChildren();
for(const a of apps){const b=document.createElement('button');b.textContent=a.label+(a.type==='electron'?'  (desktop app)':'');b.onclick=()=>{$('target').value=a.key;$('target').focus()};box.append(b)}}

function addLines(lines){const log=$('log'),stick=log.scrollTop+log.clientHeight>=log.scrollHeight-20;
for(const l of lines){const d=document.createElement('div');d.textContent=l;
if(/^page \\d+:/.test(l)){d.className='p';counts.p++}else if(/^screen:/.test(l)){d.className='s';counts.s++}
else if(/error|failed/i.test(l))d.className='e';if(/^\\[\\d+\\] saved/.test(l))counts.s++;log.append(d)}
if(stick)log.scrollTop=log.scrollHeight}
const clock=()=>{const s=Math.round((Date.now()-started)/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
function stats(){const bits=[];if(counts.p)bits.push(counts.p+' page'+(counts.p>1?'s':''));if(counts.s)bits.push(counts.s+' screen'+(counts.s>1?'s':''));
$('stats').textContent=[clock(),...bits].join(' \\u00b7 ')}

async function poll(full){const s=await api('/api/state?from='+from+(full?'&full=1':''));
if(full){renderSaved(s.apps);renderRuns(s.runs)}
if(s.lines.length){addLines(s.lines);from=s.total}
if(s.running){if(!running){running=true;started=started||Date.now();showLive(s.target)}stats()}
else if(running){running=false;finished(s)}
return s}
function showLive(target){$('live').hidden=false;$('dot').className='dot';$('title').textContent='Working on '+target;
$('start').hidden=true;$('stop').hidden=false;$('openGallery').hidden=$('openFolder').hidden=true}
async function finished(s){$('start').hidden=false;$('stop').hidden=true;rel=s.rel;const ok=s.code===0&&s.rel;
$('dot').className='dot '+(ok?'done':'fail');$('title').textContent=ok?'Done':'Stopped';stats();
$('openGallery').hidden=$('openFolder').hidden=!rel;if(ok)api('/api/open',{rel,what:'gallery'});poll(true)}

$('start').onclick=async()=>{$('msg').textContent='';
const share=[...document.querySelectorAll('[name=share]:checked')].map(c=>c.value);store.set('share',share);
const body={mode,target:$('target').value,name:$('name').value,share};
for(const f of fields){const el=$(f);body[f]=el.type==='checkbox'?el.checked:el.value;store.set(f,body[f])}
const r=await api('/api/start',body);if(r.error){$('msg').textContent=r.error;return}
from=0;counts={p:0,s:0,m:0};started=Date.now();$('log').replaceChildren();running=true;showLive(mode==='watch'?($('target').value||'any window'):$('target').value)};
$('target').onkeydown=e=>{if(e.key==='Enter')$('start').click()};
$('stop').onclick=()=>api('/api/stop',{});
$('openGallery').onclick=()=>api('/api/open',{rel,what:'gallery'});
$('openFolder').onclick=()=>api('/api/open',{rel,what:'folder'});
$('openOut').onclick=()=>api('/api/open',{what:'folder'});
poll(true);setInterval(()=>poll(false),700);
</script></body></html>`;
}
