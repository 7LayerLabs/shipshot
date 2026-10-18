"""Shipshot watch mode: works with ANY program on the PC.

You click around the app yourself. A moment after every click Shipshot photographs the
window in front (just that window, not the whole screen) and skips it if nothing changed.
  F8  = take a shot right now
  F10 = finished (Ctrl+C in this window works too)
"""
import argparse
import ctypes
import ctypes.wintypes as wt
import json
import os
import re
import sys
import time
from datetime import datetime

from PIL import Image, ImageChops, ImageGrab, ImageStat

# Window titles can hold any character; don't let one crash the printout when it is piped.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

user32 = ctypes.windll.user32
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)  # real pixel sizes on scaled displays
except Exception:
    user32.SetProcessDPIAware()

VK_LBUTTON, VK_F8, VK_F10 = 0x01, 0x77, 0x79
CLICK_DELAY = 0.8   # let the app finish drawing after a click
SAME = 1.5          # average pixel change below this = same screen, skip


def down(vk):
    return user32.GetAsyncKeyState(vk) & 0x8000


def front_window():
    hwnd = user32.GetForegroundWindow()
    n = user32.GetWindowTextLengthW(hwnd)
    buf = ctypes.create_unicode_buffer(n + 1)
    user32.GetWindowTextW(hwnd, buf, n + 1)
    return hwnd, buf.value


def window_box(hwnd):
    r = wt.RECT()
    # the visible frame, without Windows' invisible resize border
    if ctypes.windll.dwmapi.DwmGetWindowAttribute(hwnd, 9, ctypes.byref(r), ctypes.sizeof(r)) != 0:
        user32.GetWindowRect(hwnd, ctypes.byref(r))
    return r.left, r.top, r.right, r.bottom


def slug(s, n=48):
    return (re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:n]) or "window"


def fingerprint(img):
    return img.convert("L").resize((64, 40))


def changed(a, b):
    if a is None or b is None:
        return True
    return ImageStat.Stat(ImageChops.difference(a, b)).mean[0] > SAME


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", default="app")
    ap.add_argument("--window", default="", help="only shoot windows whose title contains this")
    a = ap.parse_args()

    screens = os.path.join(a.out, "screens")
    os.makedirs(screens, exist_ok=True)
    own = ctypes.windll.kernel32.GetConsoleWindow()
    started = datetime.now().isoformat()
    shots, last = [], {}
    want = a.window.lower()

    def save():
        with open(os.path.join(a.out, "shots.json"), "w", encoding="utf-8") as f:
            json.dump({"app": a.name, "mode": "watch", "target": a.window or "any window",
                       "started": started, "finished": datetime.now().isoformat(), "shots": shots}, f, indent=2)

    def snap(force=False):
        hwnd, title = front_window()
        if not hwnd or hwnd == own or not title:
            return
        if want and want not in title.lower():
            return
        box = window_box(hwnd)
        if box[2] - box[0] < 50 or box[3] - box[1] < 50:
            return
        img = ImageGrab.grab(bbox=box, all_screens=True)
        fp = fingerprint(img)
        if not force and not changed(fp, last.get(hwnd)):
            return
        last[hwnd] = fp
        n = len(shots) + 1
        name = f"{n:02d}-{slug(title)}.png"
        img.save(os.path.join(screens, name))
        shots.append({"n": n, "title": title, "kind": "screen", "url": "", "file": f"screens/{name}"})
        save()
        print(f"  [{n}] saved: {title}", flush=True)

    print(f"\n  Watching {'windows named ' + repr(a.window) if a.window else 'whatever window is in front'}.")
    print("  Click through the app. F8 = shot now, F10 = done.\n", flush=True)
    was_down, due, f8 = False, None, False
    try:
        snap(force=True)
        while True:
            now = time.time()
            is_down = bool(down(VK_LBUTTON))
            if was_down and not is_down:
                due = now + CLICK_DELAY
            was_down = is_down
            if due and now >= due:
                due = None
                snap()
            if down(VK_F8) and not f8:
                snap(force=True)
            f8 = bool(down(VK_F8))
            if down(VK_F10):
                break
            time.sleep(0.03)
    except KeyboardInterrupt:
        pass
    save()
    print(f"\n  Done: {len(shots)} shots.", flush=True)


if __name__ == "__main__":
    sys.exit(main())
