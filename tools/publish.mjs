// Publishes a clean copy of Shipshot to the public repo github.com/dbtech45/Shipshot.
// The copy is `git archive HEAD`, so whatever .gitattributes marks export-ignore
// (your tasks/ notes and your own apps.json) never leaves this PC.
//
//   node tools/publish.mjs "What changed in this version"
//
// Needs the dbtech45 account in the GitHub CLI: gh auth login (it can sit next to other accounts).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = 'dbtech45/Shipshot';
const AUTHOR = ['DBTech45', '282960278+dbtech45@users.noreply.github.com'];
const HERE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(process.env.LOCALAPPDATA || os.homedir(), 'Shipshot', 'public-repo');
const message = process.argv.slice(2).join(' ').trim();

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
const git = (args, opts) => run('git', args, opts);
const fail = m => { console.error(`\n  ${m}\n`); process.exit(1); };

if (!message) fail('Say what changed: node tools/publish.mjs "What changed"');
if (git(['status', '--porcelain'], { cwd: HERE })) fail('Commit your changes first; only committed work is published.');

// Push as dbtech45 without switching the CLI's active account: the token goes to git
// through the environment, not the command line.
let token;
try { token = run('gh', ['auth', 'token', '--user', 'dbtech45']); } catch { fail('The dbtech45 account is not in the GitHub CLI. Run: gh auth login'); }
const auth = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
  GIT_CONFIG_VALUE_0: 'Authorization: Basic ' + Buffer.from(`x-access-token:${token}`).toString('base64') };
const url = `https://github.com/${REPO}.git`;

// A working copy of the public repo, kept between publishes.
if (!fs.existsSync(path.join(WORK, '.git'))) {
  fs.mkdirSync(WORK, { recursive: true });
  git(['init', '-q', '-b', 'main'], { cwd: WORK });
  git(['remote', 'add', 'origin', url], { cwd: WORK });
}
try { git(['pull', '-q', 'origin', 'main'], { cwd: WORK, env: auth }); } catch { /* new, empty repo */ }

// Replace everything with the current committed version.
for (const f of fs.readdirSync(WORK)) if (f !== '.git') fs.rmSync(path.join(WORK, f), { recursive: true, force: true });
const zip = path.join(os.tmpdir(), `shipshot-${Date.now()}.zip`);
git(['archive', '--format=zip', '-o', zip, 'HEAD'], { cwd: HERE });
run('tar', ['-xf', zip, '-C', WORK]);
fs.rmSync(zip);

git(['add', '-A'], { cwd: WORK });
if (!git(['status', '--porcelain'], { cwd: WORK })) { console.log('\n  Nothing new to publish.\n'); process.exit(0); }
git(['-c', `user.name=${AUTHOR[0]}`, '-c', `user.email=${AUTHOR[1]}`, 'commit', '-q', '-m', message], { cwd: WORK });
git(['push', '-q', 'origin', 'main'], { cwd: WORK, env: auth });
console.log(`\n  Published to https://github.com/${REPO}\n`);
