# Screenshot harness

Renders the **real app** (its own pages and components) against an in-memory
fake Supabase filled with **invented** demo data, then captures the README
screenshots with Playwright. Nothing talks to a real backend: the Supabase
client module is swapped out at build time, and the capture script aborts every
request that is not to the local server or the web-font hosts.

## Re-shoot

```sh
corepack yarn screenshots            # light theme → docs/screenshots/*.png
corepack yarn screenshots --dark     # dark theme instead
corepack yarn screenshots --only dashboard billing --out /tmp/shots
corepack yarn screenshots --billing free --only dashboard billing --out /tmp/shots
```

`--billing` swaps the demo subscription: `trial` (20 days left), `trial3` (3 days
left), `free` (the trial ended → Free), `past_due`, `ended` (the paid Stripe
subscription was canceled → Free; the dashboard shows the one-time "ended"
dialog) or `cancel_scheduled` (switched to Free, ends at the period end);
without it the org pays for Business (the README shots). By hand: set `localStorage['demo-billing']` and reload.

Needs Python 3 with `playwright` (`pip install playwright && playwright install chromium`)
and Pillow. `pngquant` is used for optimisation when installed; otherwise Pillow
quantises to 256 colours.

To browse the demo app by hand: `corepack yarn vite --config tools/screenshots/vite.config.ts`
→ http://127.0.0.1:5199 (open it with a `cs` browser language, or set
`localStorage.language = 'cs'`).

## Pieces

| File | What it does |
| --- | --- |
| `vite.config.ts` | The app's Vite config + a plugin that resolves every import of `src/shared/api/supabaseClient.ts` to the fake, and an inline script that pins `Date` (default `2026-12-10T10:30+01:00`, override with `SCREENSHOT_NOW`). Port `SCREENSHOT_PORT` (5199). |
| `fake/supabaseClient.ts` | supabase-js look-alike: `from().select()` with PostgREST embeds (`alias:table!fk(...)`, `profiles:user_id(...)`), filters (`eq/neq/gt/gte/lt/lte/is/in/or/contains/like`), `order/limit/range/single/maybeSingle`, count/head, insert/update/upsert/delete, RPC stubs, auth session, realtime no-ops, `functions.invoke`. |
| `fake/demoData.ts` | The dataset: "Kavárna U Mostu" (Malá Strana, Karlín, Vinohrady), 12 invented people, roles incl. two custom ones, a published rota for the current month (short/long-week pattern), the owner's last three months of worked shifts, a live board, time off, swaps, open shifts, member/name requests, announcements and a Business subscription. All dates are relative to the pinned "now". |
| `capture.py` | Playwright: Czech UI + default colour scheme via the app's own localStorage preferences, desktop 1440×900 @2x and mobile 390×844 @3x, one function per shot. |
| `optimize.py` | Shrinks the PNGs. |
| `run.py` | Starts the server, captures, optimises, stops the server. |

When a new screen needs data, add the table rows to `demoData.ts` (and a
foreign key to `FKS` in the fake client if a select string embeds through it).
The harness is excluded from the app build (`tsc -b` / `vite build` never see
it); `corepack yarn tsc -p tools/screenshots` type-checks it on its own.
