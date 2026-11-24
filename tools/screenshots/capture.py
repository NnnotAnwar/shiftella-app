"""
Capture README screenshots of the real app running on the screenshot harness
(tools/screenshots/vite.config.ts: fake in-memory Supabase + pinned clock).

    python3 tools/screenshots/capture.py [--base http://127.0.0.1:5199] [--out docs/screenshots] [--only name ...] [--dark]

Every request that is not to the local harness or the web-font hosts is
aborted, so nothing can reach a real backend.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
ALLOWED_HOSTS = {"127.0.0.1", "localhost", "fonts.googleapis.com", "fonts.gstatic.com", "api.fontshare.com", "cdn.fontshare.com"}

DESKTOP = {"viewport": {"width": 1440, "height": 900}, "device_scale_factor": 2}
MOBILE = {
    "viewport": {"width": 390, "height": 844},
    "device_scale_factor": 3,
    "is_mobile": True,
    "has_touch": True,
    "user_agent": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
    ),
}

# Czech UI (or --lang), default theme (light) + default colour scheme, via the app's own
# localStorage preferences (PreferencesContext / ThemeContext).
PREFS_SCRIPT = """
(() => {
  try {
    localStorage.setItem('language', '%LANG%');
    localStorage.setItem('time-format', '24h');
    localStorage.setItem('theme', '%THEME%');
    localStorage.setItem('combo-key', 'lilac-indigo');
    localStorage.setItem('schedule-view', 'grid');
    // Notifications were already looked at (no stale unread dot).
    localStorage.setItem('notifications_seen_at:00000000-0000-4000-8001-000000000001', new Date().toISOString());
  } catch (e) {}
})();
"""


def settle(page: Page, extra_ms: int = 900) -> None:
    page.wait_for_load_state("networkidle")
    # Wait until no skeleton loaders / page loader are left.
    try:
        page.wait_for_function(
            "() => !document.querySelector('span.animate-pulse, p.animate-pulse')",
            timeout=8000,
        )
    except Exception:  # noqa: BLE001 — still take the shot, but say so
        print(f"  ! loaders still visible on {page.url}")
    page.wait_for_timeout(extra_ms)


def go(page: Page, base: str, path: str) -> None:
    page.goto(base + path)
    settle(page)


# --- Shots ---------------------------------------------------------------------
# UI text the shots look for, per --lang (keep in sync with src/shared/i18n).
UI_TEXT = {
    "cs": {"brush": "Klepnutím na prázdné políčko", "balances": "Zůstatky", "mine": "Moje směny", "more": "Více"},
    "en": {"brush": "Tap an empty cell", "balances": "Balances", "mine": "My shifts", "more": "More"},
    "sk": {"brush": "Ťuknutím na prázdne políčko", "balances": "Zostatky", "mine": "Moje zmeny", "more": "Viac"},
    "uk": {"brush": "Натисніть на порожню клітинку", "balances": "Залишки", "mine": "Мої зміни", "more": "Більше"},
}
TEXT = UI_TEXT["cs"]


def shot_dashboard(page: Page, base: str, out: Path) -> None:
    go(page, base, "/")
    page.screenshot(path=out / "desktop-dashboard.png")


def scroll_to_text(page: Page, text: str, offset: int = 24) -> None:
    el = page.get_by_text(text, exact=False).first
    top = el.evaluate("e => e.getBoundingClientRect().top + window.scrollY")
    page.evaluate(f"window.scrollTo(0, {top - offset})")
    page.wait_for_timeout(500)


def shot_schedule(page: Page, base: str, out: Path) -> None:
    go(page, base, "/schedule")
    # The roster grid sits under the team / leave / open-shift cards.
    scroll_to_text(page, TEXT["brush"])
    page.screenshot(path=out / "schedule-grid.png")


def shot_my_hours(page: Page, base: str, out: Path) -> None:
    go(page, base, "/overview")
    page.screenshot(path=out / "my-hours.png")


def shot_requests(page: Page, base: str, out: Path) -> None:
    go(page, base, "/requests")
    page.screenshot(path=out / "requests.png")


def shot_announcements(page: Page, base: str, out: Path) -> None:
    go(page, base, "/announcements")
    page.screenshot(path=out / "announcements.png")


def shot_leave(page: Page, base: str, out: Path) -> None:
    go(page, base, "/schedule")
    page.get_by_role("button", name=TEXT["balances"]).first.click()
    page.wait_for_timeout(800)
    page.screenshot(path=out / "leave-balances.png")


def shot_timeoff(page: Page, base: str, out: Path) -> None:
    go(page, base, "/schedule")
    scroll_to_text(page, TEXT["balances"], 120)
    page.screenshot(path=out / "timeoff-card.png")


def shot_billing(page: Page, base: str, out: Path) -> None:
    go(page, base, "/billing")
    page.screenshot(path=out / "billing.png")


def shot_palette(page: Page, base: str, out: Path) -> None:
    go(page, base, "/")
    page.keyboard.press("Meta+k")
    page.wait_for_timeout(800)
    page.screenshot(path=out / "command-palette.png")


DEMO_EVA = "00000000-0000-4000-8001-000000000005"


def shot_documents(page: Page, base: str, out: Path) -> None:
    # The owner looks at a barista's documents (amber + red expiry chips).
    go(page, base, f"/profile/{DEMO_EVA}")
    scroll_to_text(page, "Dokumenty", 160)
    page.screenshot(path=out / "documents.png")


def shot_mobile_documents(page: Page, base: str, out: Path) -> None:
    go(page, base, f"/profile/{DEMO_EVA}")
    scroll_to_text(page, "Dokumenty", 120)
    page.screenshot(path=out / "mobile-documents.png")


def shot_mobile_home(page: Page, base: str, out: Path) -> None:
    go(page, base, "/")
    page.screenshot(path=out / "mobile-home.png")


def shot_mobile_schedule(page: Page, base: str, out: Path) -> None:
    go(page, base, "/schedule")
    page.get_by_role("button", name=TEXT["mine"]).click()
    page.wait_for_timeout(800)
    page.screenshot(path=out / "mobile-schedule.png")


def shot_mobile_more(page: Page, base: str, out: Path) -> None:
    go(page, base, "/")
    page.get_by_role("button", name=TEXT["more"]).click()
    page.wait_for_timeout(2500)
    page.screenshot(path=out / "mobile-more.png")


DESKTOP_SHOTS = {
    "dashboard": shot_dashboard,
    "schedule": shot_schedule,
    "my-hours": shot_my_hours,
    "requests": shot_requests,
    "announcements": shot_announcements,
    "billing": shot_billing,
    "leave": shot_leave,
    "timeoff": shot_timeoff,
    "palette": shot_palette,
    "documents": shot_documents,
}
MOBILE_SHOTS = {
    "mobile-home": shot_mobile_home,
    "mobile-schedule": shot_mobile_schedule,
    "mobile-more": shot_mobile_more,
    "mobile-documents": shot_mobile_documents,
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:5199")
    ap.add_argument("--out", default=str(ROOT / "docs/screenshots"))
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--dark", action="store_true", help="dark theme instead of light")
    ap.add_argument(
        "--billing",
        default=None,
        choices=["trial", "trial3", "free", "past_due", "ended", "cancel_scheduled", "beta"],
        help="subscription scenario in the demo data (default: paid Business)",
    )
    ap.add_argument(
        "--demo-org",
        default=None,
        choices=["fresh", "on"],
        help="demo-data scenario: a new owner (setup checklist + 'try demo data') or demo data on (banner)",
    )
    ap.add_argument("--lang", default="cs", choices=["cs", "en", "sk", "uk"], help="UI language (default: cs)")
    args = ap.parse_args()
    global TEXT
    TEXT = UI_TEXT[args.lang]

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    theme = "dark" if args.dark else "light"
    problems: list[str] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch()

        def run(shots: dict, ctx_opts: dict) -> None:
            ctx = browser.new_context(
                locale={"cs": "cs-CZ", "en": "en-GB", "sk": "sk-SK", "uk": "uk-UA"}[args.lang],
                timezone_id="Europe/Prague",
                color_scheme=theme,
                reduced_motion="reduce",
                service_workers="block",
                **ctx_opts,
            )
            ctx.add_init_script(PREFS_SCRIPT.replace("%THEME%", theme).replace("%LANG%", args.lang))
            if args.billing:
                ctx.add_init_script(f"try {{ localStorage.setItem('demo-billing', '{args.billing}'); }} catch (e) {{}}")
            if args.demo_org:
                ctx.add_init_script(f"try {{ localStorage.setItem('demo-org', '{args.demo_org}'); }} catch (e) {{}}")

            def guard(route):
                host = urlparse(route.request.url).hostname or ""
                if host in ALLOWED_HOSTS:
                    route.continue_()
                else:
                    problems.append(f"blocked request: {route.request.url}")
                    route.abort()

            ctx.route("**/*", guard)
            page = ctx.new_page()
            page.on("console", lambda m: problems.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
            for name, fn in shots.items():
                if args.only and name not in args.only:
                    continue
                print(f"-> {name}")
                fn(page, args.base, out)
            ctx.close()

        run(DESKTOP_SHOTS, DESKTOP)
        run(MOBILE_SHOTS, MOBILE)
        browser.close()

    for p in problems:
        print("  !", p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
