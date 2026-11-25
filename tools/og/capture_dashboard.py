"""Fresh Czech dashboard screenshot for the landing page + OG image.

Runs against the screenshot harness (corepack yarn vite --config tools/screenshots/vite.config.ts,
port 5199 by default): fake Supabase, pinned clock 10:30, demo café, owner Petra.

    python3 tools/og/capture_dashboard.py [--base http://127.0.0.1:5199]
Writes public/landing/dashboard-{960,1600}.webp and tools/og/dashboard@2x.png.
"""
import argparse
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PREFS = """try {
  localStorage.setItem('language','cs'); localStorage.setItem('time-format','24h');
  localStorage.setItem('theme','light'); localStorage.setItem('combo-key','lilac-indigo');
  localStorage.removeItem('demo-auth');
  localStorage.setItem('notifications_seen_at:00000000-0000-4000-8001-000000000001', new Date().toISOString());
} catch (e) {}"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:5199")
    base = ap.parse_args().base
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=2, locale="cs-CZ",
                            timezone_id="Europe/Prague", color_scheme="light", service_workers="block")
        ctx.add_init_script(PREFS)
        page = ctx.new_page()
        page.goto(base + "/", wait_until="networkidle")
        page.wait_for_function("() => !document.querySelector('span.animate-pulse, p.animate-pulse')", timeout=10000)
        page.wait_for_timeout(1500)
        out = ROOT / "tools/og/dashboard@2x.png"
        page.screenshot(path=str(out))
        b.close()
    im = Image.open(out).convert("RGB")
    for w in (960, 1600):
        im.resize((w, w * 10 // 16), Image.LANCZOS).save(ROOT / f"public/landing/dashboard-{w}.webp", "WEBP", quality=86, method=6)
    print("ok", im.size)


if __name__ == "__main__":
    main()
