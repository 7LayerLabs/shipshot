# SnapTour

Screenshots every page and screen of a website, an Electron desktop app, or any Windows program, then builds a gallery, promo images and a contact sheet from them.

## Setup

Needs Node 20+, Google Chrome or Microsoft Edge, and (for watch mode) Python 3 with Pillow and pywin32.

```
npm install
```

Double-click `SnapTour.bat` for a menu, or use the command line:

```
node snaptour.mjs menusparks.com            # a website: every page, plus tabs, menus and dialogs
node snaptour.mjs http://localhost:3001     # a local app
node snaptour.mjs vibedeck                  # a desktop app saved in apps.json
node snaptour.mjs watch VibeDeck            # any program: you click, it snaps each new screen (F8 shot, F10 done)
node snaptour.mjs list                      # saved apps and past runs
```

Options: `--name`, `--max`, `--depth`, `--minutes`, `--no-clicks`, `--no-mobile`, `--no-full`, `--no-promo`, `--headed`, `--no-open`.

## Output

`Desktop\Screenshots\SnapTour\<name>\<date_time>\`

- `screens/` every page and clicked screen
- `full-page/` whole scrolling pages
- `mobile/` phone-size shots
- `promo/` framed 16:9 and square images
- `contact-sheet.png` every screen on one image
- `index.html` gallery
- `shots.json` list of shots

Set `SNAPTOUR_OUT` to save somewhere else.

## Safety

SnapTour never types. It skips buttons whose labels mean an action (save, send, delete, run, buy, sign in, hide, toggle and more), skips submit buttons, and dismisses every confirm box. Desktop apps run as a separate copy on a throwaway copy of their profile, with opening the browser, file pickers and message boxes switched off. Each app in `apps.json` can list extra `skip` selectors for controls that do things.
