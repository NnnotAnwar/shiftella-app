"""Render public/og-image.png (1200x630, the link preview) from tools/og/og.html.
Refresh the dashboard first: python3 tools/og/capture_dashboard.py

    python3 tools/og/render_og.py
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
    page.goto((ROOT / "tools/og/og.html").as_uri(), wait_until="networkidle")
    page.evaluate("document.fonts.ready")
    page.wait_for_timeout(500)
    page.screenshot(path=str(ROOT / "public/og-image.png"))
    b.close()
print("wrote public/og-image.png")
