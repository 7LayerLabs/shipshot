# SnapTour

Screenshots every page and screen of a website, an Electron desktop app, or any Windows program, then builds a gallery, promo images, contact sheets and images sized for X, Discord, GitHub, LinkedIn and Instagram.

## Setup

Needs Node 20+, Google Chrome or Microsoft Edge, and (for watch mode) Python 3 with Pillow.

```
npm install
node snaptour.mjs install     # SnapTour icon on the desktop and in the Start menu
```

## The app

Double-click the **SnapTour** desktop icon (or run `node snaptour.mjs app`). A window opens: type a site or pick a saved app, tick the platforms you want images for, press Start and watch it work. Past runs are listed underneath; click one to open its gallery. Closing the window stops SnapTour.

## Command line

```
node snaptour.mjs menusparks.com              # a website: every page, plus tabs, menus and dialogs
node snaptour.mjs menusparks.com --for x,discord   # also make images sized for X and Discord
node snaptour.mjs http://localhost:3001       # a local app
node snaptour.mjs vibedeck                    # a desktop app saved in apps.json
node snaptour.mjs watch VibeDeck              # any program: you click, it snaps each new screen (F8 shot, F10 done)
node snaptour.mjs list                        # saved apps and past runs
node snaptour.mjs gallery <run folder> --for all  # rebuild gallery, promo and share images for an old run
node snaptour.mjs folder                      # open the Screenshots folder
```

`SnapTour.bat` gives the same choices as a menu.

Options: `--name`, `--for <x,discord,github,linkedin,instagram,og|all>`, `--max`, `--depth`, `--minutes`, `--workers` (tabs at once, default 4), `--sections <n>` (screens per long page, default 10), `--no-sections`, `--no-clicks`, `--no-mobile`, `--no-promo`, `--accent <color>`, `--headed`, `--no-open`.

## Output

`Desktop\Screenshots\SnapTour\<name>\<date_time>\`

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

Set `SNAPTOUR_OUT` to save somewhere else.

## Saved apps (`apps.json`)

```json
{
  "vibedeck": { "type": "electron", "title": "VibeDeck", "path": "C:/Users/Derek/vibedeck", "profile": "%APPDATA%/vibedeck", "skip": "#runBtn" },
  "menusparks": { "type": "website", "url": "https://menusparks.com", "title": "MenuSparks", "accent": "#ff6a00" }
}
```

## Safety

SnapTour never types. It skips buttons whose labels mean an action (save, send, delete, run, buy, sign in, sign up, hide, toggle and more), skips submit buttons, dismisses every confirm box and never photographs pages on another site (a login redirect, say). Desktop apps run as a separate copy on a throwaway copy of their profile, with opening the browser, file pickers and message boxes switched off. Each app in `apps.json` can list extra `skip` selectors for controls that do things. The app window only answers itself: it listens on 127.0.0.1 with a secret token.
