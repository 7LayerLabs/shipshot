// Desktop-app mode for Electron apps (VibeDeck and friends).
// Starts a SEPARATE copy of the app on a throwaway copy of its profile, so your real
// window, settings and history are never touched, then clicks through every screen.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { _electron } from 'playwright-core';
import { explore, settle } from './explore.mjs';
import { sleep, log } from './common.mjs';

const PROFILE_SKIP = /^(Cache|Code Cache|GPUCache|DawnGraphiteCache|DawnWebGPUCache|GPUPersistentCache|GrShaderCache|ShaderCache|blob_storage|Crashpad|Singleton.*|lockfile|.*\.enc)$/i;

// File by file, so a file the running app has locked (its cookies, say) is skipped
// instead of stopping the whole copy. Returns how many were skipped, or -1 for no profile.
function copyProfile(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  if (!src || !fs.existsSync(src)) return -1;
  let locked = 0;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (PROFILE_SKIP.test(e.name)) continue;
    const from = path.join(src, e.name), to = path.join(dest, e.name);
    if (e.isDirectory()) locked += copyProfile(from, to);
    else try { fs.copyFileSync(from, to); } catch { locked++; }
  }
  return locked;
}

function resolveLaunch(target) {
  if (/\.exe$/i.test(target)) return { executablePath: target, args: [], cwd: path.dirname(target) };
  const local = path.join(target, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
  if (!fs.existsSync(local)) throw new Error(`No Electron found in ${target} (run npm install there first).`);
  return { executablePath: local, args: [target], cwd: target };
}

// Programs started from inside Claude Code inherit its variables; keep them out of the app.
export function cleanEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_') || k === 'CLAUDE_EFFORT') delete env[k];
  return env;
}

export async function captureElectron(run, app, o) {
  const profile = path.join(os.tmpdir(), `shipshot-profile-${Date.now()}`);
  const locked = copyProfile(app.profile, profile);
  log(locked < 0 ? 'using a fresh empty profile' : 'using a throwaway copy of your app profile'
    + (locked ? ` (${locked} file${locked > 1 ? "s" : ""} in use by the open app were left out)` : ''));
  const { executablePath, args, cwd } = resolveLaunch(app.path);
  const deadline = Date.now() + o.minutes * 60000;

  const eapp = await _electron.launch({
    executablePath, cwd, env: cleanEnv(),
    args: [...args, `--user-data-dir=${profile}`],
    timeout: 60000
  });
  const pid = eapp.process().pid;

  try {
    // Nothing the tour clicks may open your browser, a file picker or a yes/no box.
    await eapp.evaluate(({ shell, dialog }) => {
      shell.openExternal = async () => {};
      shell.openPath = async () => '';
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
      dialog.showSaveDialog = async () => ({ canceled: true });
      dialog.showMessageBox = async (a, b) => { const opt = b || a || {}; return { response: opt.cancelId ?? 0, checkboxChecked: false }; };
    });

    const page = await eapp.firstWindow();
    page.on('dialog', d => d.dismiss().catch(() => {}));
    for (let i = 0; i < 60 && !/^(https?|file):/.test(page.url()); i++) await sleep(500);

    const [w, h] = o.size;
    await eapp.evaluate(({ BrowserWindow }, [w, h]) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      if (win.isMaximized()) win.unmaximize();
      win.setSize(w, h);
      win.center();
      win.focus();
    }, [w, h]);
    log(`waiting up to ${Math.round(app.settle / 1000)}s for the app to finish starting...`);
    await settle(page, { load: true, quiet: 1000, max: app.settle });

    const name = app.title || run.app;
    await run.shot(page, `${name} - main screen`, { kind: 'page', sections: o.sections });
    log('page 1: main screen');

    if (o.clicks) {
      // Apps save things like "sidebar hidden" in localStorage, which survives a reload.
      // Put it back the way it started before every reset so each screen starts clean.
      const saved = await page.evaluate(() => JSON.stringify({ ...localStorage })).catch(() => null);
      const restore = () => page.evaluate(s => { localStorage.clear(); Object.assign(localStorage, JSON.parse(s)); }, saved).catch(() => {});
      await explore(page, {
        title: name, memory: { sigs: [], keys: new Set() },
        skip: app.skip || '', depth: o.depth, deadline, maxScreens: o.maxScreens,
        settleMs: app.clickSettle || 2000,
        resetBase: async () => { if (saved) await restore(); await page.reload().catch(() => {}); await settle(page, { load: true, quiet: 600, max: app.resetSettle || 4000 }); },
        shoot: t => run.shot(page, t, { kind: 'screen' })
      });
    }
  } finally {
    await Promise.race([eapp.close().catch(() => {}), sleep(8000)]);
    try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch {}
    await sleep(1000);
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch {}
  }
}
