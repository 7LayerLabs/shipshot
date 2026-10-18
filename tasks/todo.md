# DONE 2026-10-18: fully working, much faster, readable shots, desktop app, share sizes

Baseline measured 2026-10-18 on the current code:
- Local test site (7 small pages, `scratchpad/fixture/server.mjs`): **61s**.
- menusparks.com `--max 6`: **46s** (5 pages, ~5-9s each, phone shots 17s one at a time).
- Full-page shots are one tall image: Home was **2880 x 17,810 px**, so you have to zoom to ~10% to see it whole.

Target: 3-4x faster (local site ~15s, menusparks ~15s), and no image taller than one screen.

### A. Readable shots: "sections" instead of one tall full-page image
- [x] While scrolling the page (it already scrolls once to load lazy images), take one screen-sized shot per scroll step: `sections/05-home-2.png`, `-3.png`... Each is 1440x900 (2880x1800 px), the same as what you see in a browser.
- [x] Each step is one screen minus the sticky header height minus a small overlap, so no text is hidden under the header or cut between two shots. The last shot is aligned to the bottom of the page.
- [x] Cap at 10 sections per page (`--sections <n>`, `--no-sections` to turn off). This replaces `full-page/` (`--no-full` still works as the old name).
- [x] Gallery: one card per page with a "1 of 6" badge; the lightbox steps through a page's sections with the arrow keys before going to the next page.
- [x] Contact sheet: split into sheets of 12 shots (`contact-sheet-1.png`, `-2.png`...) instead of one image that keeps growing, and link them from the gallery.

### B. Speed
- [x] Crawl with 4 tabs at once (`--workers <n>`, default 4). They share the queue and the "already seen this screen" memory. Desktop-app mode stays one window.
- [x] Replace fixed sleeps (1.2s per page, 0.7s per click, 0.9s per reset, plus up to 3s waiting for the network to go quiet) with "wait until the page stops changing": no DOM changes for 300ms and visible images loaded, with a cap. Fast pages go on right away; slow ones still get waited on.
- [x] Scroll once per page and take the sections during that scroll, instead of scrolling and then rendering a separate giant full-page image.
- [x] After a click opens a dialog, press Escape and check whether the screen is back to where it was before reloading the whole page (reloads are the slowest part of exploring). Fall back to a reload if not.
- [x] Phone shots with 4 tabs at once too.
- [x] Promo images: reuse one browser and render several at once.

### C. Fixes so everything works
- [x] Off-site redirects get photographed: `/login` -> example.com was shot and labelled as your page (reproduced). Skip when the landed site is different.
- [x] Missed screens: switching the Monthly/Yearly tabs and opening a `<details>` were not shot (reproduced) because a change of 2 or fewer text lines counts as "same". Also count which tab is selected, which dialogs are open and what is expanded.
- [x] Pages with the same title all get the same name (menusparks: login and register are both "MenuSparks"). Fall back to the URL ("Login", "Register") when a title repeats or equals the home page title.
- [x] Page titles are put into the gallery lightbox as HTML, so a crawled page's title can run script in `index.html` (reproduced). Use textContent.
- [x] `apps.json` VibeDeck path is out of date (moved to `C:/Users/Derek/vibedeck`), so `snaptour vibedeck` fails.
- [x] `apps.json` ignores `type`, so website presets are impossible. Support `{ "type": "website", "url": ... }`.
- [x] `--name` does not change the label for websites, so localhost runs say "LOCALHOST:3001".
- [x] Watch mode: Ctrl+C also kills Node, so the gallery is never built. Ignore Ctrl+C in Node while watch.py runs.
- [x] `SnapTour.bat` "open folder" hardcodes the OneDrive path and ignores `SNAPTOUR_OUT`. Add `snaptour folder`.
- [x] Help/README: add `--accent`, `--workers`, `--sections`; README says pywin32 but only Pillow is needed.

### E. A real app on the PC (added by Derek 2026-10-18)
- [x] Logo: an SVG mark, plus `snaptour.ico` (16-256 px) and a PNG.
- [x] `snaptour app`: opens SnapTour in its own window (Chrome/Edge app mode, no tabs or address bar, no new dependencies). Type a site or pick a saved app, tick options and share sizes, press Start, watch progress live, then open the gallery or folder. Past runs are listed. Closing the window stops the app.
- [x] Desktop shortcut "SnapTour" with the icon and no console window (`snaptour install` creates it; Start menu too).

### F. Images sized for X, Discord, etc. (added by Derek 2026-10-18)
- [x] `--for x,discord,github,linkedin,instagram,og` (or tick them in the app). Each makes `share/<platform>/` with framed images at that platform's size and file limit:
  - X: 1600x900, best 4, JPEG under 5 MB
  - Discord: 1920x1080, best 8, under 10 MB
  - GitHub: social preview 1280x640 (Home). README shots skipped: `screens/` already fits a README.
  - LinkedIn: 1200x627; Instagram: 1080x1350 portrait; OG link preview: 1200x630
- [x] Gallery shows a "Share" section per platform.

### D. Check it
- [x] Re-run the local test site and menusparks.com, compare times with the baseline, and look at the shots.
- [x] Run `snaptour vibedeck` (desktop-app mode) end to end.
- [x] Watch mode: started it and stopped it with a synthetic F8 + F10; gallery built. A real click-through still needs Derek.

## Review (2026-10-18)

Timing, same machine and settings as the baseline (PC had under 1 GB RAM free during the tests):

| Run | Before | After |
|---|---|---|
| Local test site, 7 pages | 61s | 30s (now also shoots the Yearly tab, makes 10 sections for Home and share images) |
| menusparks.com `--max 6` | 46s | 15s |
| VibeDeck desktop app | (broken: bad path, then locked cookie file) | 80s, 13 screens, finished before the 3 min limit |

Biggest image is now one screen (2880x1800). menusparks Home = 8 readable screens instead of one 2880 x ~15,000 px image.

What changed:
- `lib/run.mjs`: `sections` replaces `full-page/`. Measures the scroller (window or the biggest scrolling panel) and fixed header/footer bars, steps one screen minus bars minus 40px, last shot aligned to the bottom, at most `--sections` (10).
- `lib/explore.mjs`: `settle()` waits for "no DOM change for N ms + images on screen loaded" with a cap, ignoring terminals/clocks/video. Screen signatures count selected tabs, open dialogs and expanded sections (x3). Escape before reload. Re-checks the URL before every shot (a late Google sign-in redirect was being shot).
- `lib/web.mjs`: tab pool (`--workers`, default 4) for pages and phone shots; first page alone so its links fill the queue. Off-site landings skipped. Repeated titles named from the URL.
- `lib/gallery.mjs`: renders promos/share/contact sheets with 4 tabs in one browser. `SHARE` presets, `share/<platform>/*.jpg` with quality stepped down to fit the size limit. Contact sheets of 12. Lightbox walks sections, uses textContent.
- `lib/electron.mjs`: profile copied file by file so files the open app has locked are skipped (VibeDeck was open and its Cookies file aborted the run). Quiet-based waits.
- `lib/common.mjs`: never clicks sign up / register / "continue with".
- `snaptour.mjs`: `--for`, `--workers`, `--sections`, `--no-sections` (`--no-full` alias), `app`, `install`, `folder`; website presets in `apps.json` (added `menusparks`); `--name`/preset title used as the label; Ctrl+C ignored in Node during watch.
- `watch.py`: UTF-8 output (a window title with "◑" crashed it when piped, i.e. in the app).
- New `lib/app.mjs` + `lib/app-ui.mjs`: local server on 127.0.0.1 (random port, secret token, Host check, `/out/` confined to the output folder) + Chrome/Edge `--app` window with its own profile under `%LOCALAPPDATA%\SnapTour\window`. Launcher re-spawns itself hidden; closing the window kills the server and any running job. Log: `%LOCALAPPDATA%\SnapTourpp.log`.
- New `assets/logo.svg`, `logo.png`, `snaptour.ico` (built by `tools/make-icon.mjs`). Shortcuts created on the OneDrive Desktop and in the Start menu.
- `SnapTour.bat`: app, share sizes, folder, install. README rewritten.

Not verified / open:
- Watch mode's Ctrl+C fix could not be tested automatically (needs a real console Ctrl+C). F10 path verified.
- Gallery card order follows capture order, which with 4 tabs is not strictly page order.
- `X` and other share sets pick the first pages, not the "best" ones (ranking is in Phase 3).
- Nothing committed yet.

---

# Later: SnapTour roadmap (proposed 2026-10-16)

Goal: one command turns a project into images and clips that are ready to post on GitHub (README, PRs, releases), Discord showcase channels and X.

## Phase 0: fixes

Moved into "NOW" above, except: the gallery never linking `contact-sheet.png` (covered in A).

## Phase 1: share-ready output (Discord, X)

- [x] `share/` folder with platform presets (done 2026-10-18, see above). Still open: Product Hunt 1270x760.
- [ ] Animated tour: a GIF for READMEs (it autoplays) and an MP4 for X (X does not accept WebM). Slideshow of the best shots with crossfades, or Playwright's recordVideo of the live tour. Uses ffmpeg if it is installed.
- [ ] Better headlines: use the page's h1 or meta description instead of "Home". Put captions in an editable `captions.json`, then `snaptour gallery` rebuilds the promos from it.
- [ ] Watch mode: every shot is titled with the window title, so every promo says the same thing. Add F9 to name the current screen.
- [ ] Auto brand: take the accent from `theme-color` or the favicon, and show the real URL in a browser address bar on the promo frame.
- [ ] Hero templates: desktop with an overlapping phone, and three fanned screens.
- [ ] Gallery buttons: Copy image (paste straight into Discord or X), Copy alt text, Download. Add OG tags so a hosted gallery link shows a preview card.
- [ ] `share/post.txt`: a draft caption plus alt text per image. Optional Claude API pass to pick the best shots and write the text.

## Phase 2: GitHub "new build" workflow

- [ ] Cross-platform + CI: `open`/`xdg-open`, no `taskkill` off Windows, `--no-open` automatically when `CI` is set, Linux Chrome.
- [ ] Per-project `snaptour.config.json` in the repo: url, pages, skip selectors, accent, captions, login.
- [ ] `--pages /,/pricing,/app`: a fixed shot list with stable file names and `--out docs/screenshots`, so README image links update in place every build.
- [ ] Build-to-build diff: compare with the previous run and mark new, changed and removed screens, with before/after images ("What changed in this build").
- [ ] GitHub Action: shoot the preview URL (e.g. a Vercel preview) on push/PR/release, post a PR comment with the changed screens, attach promos to the release.
- [ ] `README-shots.md`: a markdown grid you can paste.

## Phase 3: capture quality

- [ ] `snaptour login <url>`: sign in once in a visible browser, save the session, reuse it. Dashboards are usually what people want to show.
- [ ] Clean shots: hide cookie banners and chat widgets, wait for images and skeleton loaders, `--theme dark|light|both`.
- [ ] Redaction: `--mask` selectors (Playwright `mask`) and automatic blur for emails and keys. Electron mode copies your real profile, so real data ends up in the shots.
- [ ] Smarter crawl: start from sitemap.xml, and allow at most 2 pages per URL pattern so blog posts do not use up the 40-page budget.
- [ ] Rank shots: drop near-duplicates and blank or loading frames before picking promos.

## Phase 4: packaging

- [ ] package.json: `bin`, description and license, so `npx snaptour` works; publish to npm.
- [ ] `snaptour publish`: deploy a run's gallery to Vercel or GitHub Pages.
- [ ] Smoke test against a tiny local fixture site (redirects, odd titles, a dialog).

## Review

(fill in after building)
