<img src="assets/lockup.svg" alt="Shipshot" height="36">

Screenshots every page and screen of a website, an Electron desktop app, or any Windows program, then gives you readable screen-sized shots plus images sized for X, Discord, GitHub, LinkedIn and Instagram. Free, Windows only. Page: https://dbtech45.com/shipshot

## Setup

Needs Windows 10 or 11, Node.js 20+, Google Chrome or Microsoft Edge, and (for watch mode only) Python 3 with Pillow.

Download and unzip, then double-click **Setup.bat**. It installs what Shipshot needs, puts a Shipshot icon on the desktop and in the Start menu, and opens the app. By hand:

```
npm install
node shipshot.mjs install     # desktop and Start-menu shortcuts
node shipshot.mjs app         # open the app
```

## The app

Double-click the **Shipshot** icon. The window has four places:

- **New capture**: type a site, `localhost:3001` or a saved app (or switch to *Any program*), tick where you want to post, press Start capture. Progress shows pages, tabs and dialogs, phone shots and post-ready images as they happen.
- **Library**: every capture. Open one to see *Ready to post*, *Screens*, *Phone*, *Promo images* and *Contact sheets*. **Copy** puts an image on the clipboard to paste into X or Discord; **Save** downloads it. Delete moves a capture to the Recycle Bin.
- **Saved apps**: the entries in `apps.json`.
- **Settings**: where captures are saved, with Browse and an option to move existing captures.

Closing the window stops Shipshot.

## Command line

```
node shipshot.mjs yoursite.com                # a website: every page, plus tabs, menus and dialogs
node shipshot.mjs yoursite.com --for x,discord     # also make images sized for X and Discord
node shipshot.mjs http://localhost:3001       # a local app
node shipshot.mjs myapp                       # a desktop app or site saved in apps.json
node shipshot.mjs watch Photoshop             # any program: you click, it snaps each new screen (F8 shot, F10 done)
node shipshot.mjs list                        # saved apps and past runs
node shipshot.mjs gallery <run folder> --for all  # rebuild gallery, promo and share images for an old run
node shipshot.mjs folder                      # open the Screenshots folder
```

`Shipshot.bat` gives the same choices as a menu.

Options: `--name`, `--for <x,discord,github,linkedin,instagram,og|all>`, `--max`, `--depth`, `--minutes`, `--workers` (tabs at once, default 4), `--sections <n>` (screens per long page, default 10), `--no-sections`, `--no-clicks`, `--no-mobile`, `--no-promo`, `--accent <color>`, `--headed`, `--no-open`.

## Output

`Desktop\Screenshots\Shipshot\<name>\<date_time>\`

- `screens/` every page (top of the page) and every clicked screen
- `sections/` the rest of each long page, one screen at a time (no zooming out to read a giant image)
- `mobile/` phone-size shots
- `promo/` framed 16:9 and square images
- `share/<platform>/` framed images at each platform's size and file limit:

  | `--for` | Size | Images |
  |---|---|---|
  | `x` | 1600x900 | best 4, under 5 MB |
  | `discord` | 1920x1080 | best 8 |
  | `github` | 1280x640 | 1 (repo social preview, under 1 MB) |
  | `linkedin` | 1200x627 | best 6 |
  | `instagram` | 1080x1350 | 6 (uses the phone shots) |
  | `og` | 1200x630 | 1 (link preview card) |

- `contact-sheet-N.png` twelve screens per sheet
- `index.html` gallery (arrow keys step down a long page, then on to the next)
- `shots.json` list of shots

Change the folder in Settings (stored in `%LOCALAPPDATA%\Shipshot\settings.json`), or set `SHIPSHOT_OUT`, which wins over Settings.

## Saved apps (`apps.json`)

Sites and desktop apps you capture often. Copy `apps.example.json` to `apps.json` (or press **Edit apps.json** in the app, which does it for you) and change the entries:

```json
{
  "mysite": { "type": "website", "title": "My Site", "url": "https://example.com", "accent": "#1f3fd1" },
  "myapp": { "type": "electron", "title": "My App", "path": "C:/path/to/my-electron-app", "profile": "%APPDATA%/my-electron-app", "skip": "#deleteButton, .danger" }
}
```

`skip` lists CSS selectors for controls Shipshot must never click. `apps.json` is yours and is never shared.

## Your accounts and keys

Shipshot does not use any online service, API key or subscription. Everything runs on your PC with your own Chrome or Edge, and nothing is uploaded.

## Safety

Shipshot never types. It skips buttons whose labels mean an action (save, send, delete, run, buy, sign in, sign up, hide, toggle and more), skips submit buttons, dismisses every confirm box and never photographs pages on another site (a login redirect, say). Desktop apps run as a separate copy on a throwaway copy of their profile, with opening the browser, file pickers and message boxes switched off. Each app in `apps.json` can list extra `skip` selectors for controls that do things. The app window only answers itself: it listens on 127.0.0.1 with a secret token.
