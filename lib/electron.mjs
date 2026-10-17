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

function copyProfile(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  if (!src || !fs.existsSync(src)) return false;
  fs.cpSync(src, dest, {
    recursive: true,
    filter: p => !PROFILE_SKIP.test(path.basename(p)),
    errorOnExist: false, force: true
  });
  return true;
}

function resolveLaunch(target) {
  if (/\.exe$/i.test(target)) return { executablePath: target, args: [], cwd: path.dirname(target) };
  const local = path.join(target, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
  if (!fs.existsSync(local)) throw new Error(`No Electron found in ${target} (run npm install there first).`);
  return { executablePath: local, args: [target], cwd: target };
}

// Programs started from inside Claude Code inherit its variables; keep them out of the app.
function cleanEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_') || k === 'CLAUDE_EFFORT') delete env[k];
  return env;
}

export async function captureElectron(run, app, o) {
  const profile = path.join(os.tmpdir(), `snaptour-profile-${Date.now()}`);
  const copied = copyProfile(app.profile, profile);
  log(copied ? 'using a throwaway copy of your app profile' : 'using a fresh empty profile');
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
    log(`waiting ${Math.round(app.settle / 1000)}s for the app to finish starting...`);
    await settle(page, app.settle);

    const name = app.title || run.app;
    await run.shot(page, `${name} - main screen`, { kind: 'page' });
    log('page 1: main screen');

    if (o.clicks) {
      // Apps save things like "sidebar hidden" in localStorage, which survives a reload.
      // Put it back the way it started before every reset so each screen starts clean.
      const saved = await page.evaluate(() => JSON.stringify({ ...localStorage })).catch(() => null);
      const restore = () => page.evaluate(s => { localStorage.clear(); Object.assign(localStorage, JSON.parse(s)); }, saved).catch(() => {});
      await explore(page, {
        title: name, memory: { sigs: [], keys: new Set() },
        skip: app.skip || '', depth: o.depth, deadline, maxScreens: o.maxScreens,
        settleMs: app.clickSettle || 900,
        resetBase: async () => { if (saved) await restore(); await page.reload().catch(() => {}); await settle(page, app.resetSettle || 2500); },
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
