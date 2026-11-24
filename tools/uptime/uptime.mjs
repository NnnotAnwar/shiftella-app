// Uptime check for production (docs/uptime.md). Run by .github/workflows/uptime.yml
// every 5 minutes; no accounts, no dependencies — Node 22's fetch only.
//
//   node tools/uptime/uptime.mjs check   <state-file>   → checks, decides, writes the new state
//
// What "up" means (all read-only, public):
//   1. https://shiftella.app/ serves the app's index.html,
//   2. every JS/CSS file it references loads, and the lazy landing-page chunk
//      plus the landing images it references load,
//   3. prod Supabase answers: Auth /auth/v1/health and a read-only RPC through
//      PostgREST → Postgres (billing_free_beta, the one the landing page calls as
//      a guest), using the publishable key read from the live bundle (it is
//      public by design, so nothing is stored here).
// A failed request is retried; a failed round is re-checked once after a pause,
// so a single blip never alerts. Alerts go out only when the state CHANGES
// (up → down, down → up), through the existing Telegram bot.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const SITE = process.env.UPTIME_SITE ?? 'https://shiftella.app';
export const SUPABASE = process.env.UPTIME_SUPABASE ?? 'https://dcqvipzjqxpbaymaxhxu.supabase.co';
const TIMEOUT_MS = 20_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch with a timeout and up to `tries` attempts on network errors / 5xx. */
async function get(url, { tries = 3, init = {} } = {}) {
    let last;
    for (let i = 0; i < tries; i++) {
        if (i) await sleep(3_000 * i);
        try {
            const res = await fetch(url, { redirect: 'follow', ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
            if (res.status < 500) return res;
            last = new Error(`HTTP ${res.status}`);
        } catch (e) {
            last = e;
        }
    }
    throw new Error(`${url}: ${last?.cause?.code ?? last?.message ?? last}`);
}

async function expectOk(url, what, init) {
    const res = await get(url, { init });
    if (!res.ok) throw new Error(`${what}: HTTP ${res.status} (${url})`);
    return res;
}

/** One round of checks → list of failure messages (empty = all good). */
export async function runChecks(site = SITE, supabase = SUPABASE) {
    const failures = [];
    const attempt = async (fn) => {
        try {
            await fn();
        } catch (e) {
            failures.push(e.message);
        }
    };

    let assets = [];
    let bundles = '';
    await attempt(async () => {
        const html = await (await expectOk(`${site}/`, 'site')).text();
        if (!html.includes('id="root"')) throw new Error(`site: ${site}/ is not the app's index.html`);
        assets = [...new Set(html.match(/\/assets\/[^"']+\.(?:js|css)/g) ?? [])];
        if (!assets.length) throw new Error('site: index.html references no /assets/ files');
    });

    await Promise.all(
        assets.map((a) =>
            attempt(async () => {
                const body = await (await expectOk(`${site}${a}`, 'asset')).text();
                if (a.endsWith('.js')) bundles += body;
            }),
        ),
    );

    // Landing: the lazy chunk and the images it shows.
    await attempt(async () => {
        if (!bundles) return; // already reported above
        const chunk = bundles.match(/LandingPage-[A-Za-z0-9_-]+\.js/)?.[0];
        const images = new Set(['/landing/dashboard-960.webp']);
        if (chunk) {
            const js = await (await expectOk(`${site}/assets/${chunk}`, 'landing chunk')).text();
            for (const img of js.match(/\/landing\/[A-Za-z0-9_.-]+\.webp/g) ?? []) images.add(img);
        }
        for (const img of images) {
            const res = await expectOk(`${site}${img}`, 'landing image');
            if (!(res.headers.get('content-type') ?? '').startsWith('image/')) throw new Error(`landing image: ${img} is not an image`);
        }
    });

    // Supabase (only if we could read the publishable key from the live bundle).
    await attempt(async () => {
        if (!bundles) return;
        const key = bundles.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0];
        if (!key) throw new Error('supabase: no publishable key in the live bundle');
        const headers = { apikey: key };
        await expectOk(`${supabase}/auth/v1/health`, 'supabase auth', { headers });
        const rpc = await expectOk(`${supabase}/rest/v1/rpc/billing_free_beta`, 'supabase database', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: '{}',
        });
        const value = await rpc.json();
        if (typeof value !== 'boolean') throw new Error(`supabase database: unexpected answer ${JSON.stringify(value)}`);
    });

    return failures;
}

/**
 * The state machine. `prev` = last recorded state (null on the very first run).
 * Returns the state to record and the alert to send (or null).
 */
export function decide(prev, failures, now = Date.now()) {
    const status = failures.length ? 'down' : 'up';
    if (!prev) {
        // First run ever: only an outage is news.
        return { state: { status, since: now }, alert: status === 'down' ? { kind: 'down', failures } : null };
    }
    if (prev.status === status) return { state: prev, alert: null };
    return {
        state: { status, since: now },
        alert: status === 'down' ? { kind: 'down', failures } : { kind: 'up', downFor: now - prev.since },
    };
}

export function formatDuration(ms) {
    const min = Math.max(1, Math.round(ms / 60_000));
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    return `${h} h ${min % 60} min`;
}

/** The Telegram text (plain text, no parse mode). */
export function formatAlert(alert, runUrl = '') {
    if (alert.kind === 'down') {
        const list = alert.failures.slice(0, 8).map((f) => `• ${f}`).join('\n');
        return `🔴 Shiftella is DOWN\n\n${list}${runUrl ? `\n\n${runUrl}` : ''}`;
    }
    if (alert.kind === 'test') return '🧪 Shiftella uptime alerts are set up. This is a test message.';
    return `✅ Shiftella is back up (was down for ${formatDuration(alert.downFor)}).`;
}

export async function sendTelegram(token, chatId, text) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Telegram sendMessage: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function readState(file) {
    try {
        const s = JSON.parse(await readFile(file, 'utf8'));
        return s && (s.status === 'up' || s.status === 'down') && Number.isFinite(s.since) ? s : null;
    } catch {
        return null;
    }
}

/** GitHub Actions plumbing: step outputs + the run summary (no-ops elsewhere). */
async function report(lines, outputs) {
    console.log(lines.join('\n')); // `::warning::` lines become annotations
    if (process.env.GITHUB_STEP_SUMMARY) {
        const md = lines.map((l) => l.replace(/^::\w+::/, '> ')).join('\n');
        await writeFile(process.env.GITHUB_STEP_SUMMARY, md + '\n', { flag: 'a' });
    }
    if (process.env.GITHUB_OUTPUT) {
        await writeFile(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { flag: 'a' });
    }
}

async function main() {
    const [cmd, stateFile = '.uptime-state.json'] = process.argv.slice(2);
    const token = process.env.TELEGRAM_ALERT_BOT_TOKEN ?? '';
    const chatId = process.env.TELEGRAM_ALERT_CHAT_ID ?? '';
    const telegram = Boolean(token && chatId);
    const runUrl = process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : '';

    if (cmd === 'test-alert') {
        if (!telegram) {
            await report(['::warning::TELEGRAM_ALERT_BOT_TOKEN / TELEGRAM_ALERT_CHAT_ID are not set — see docs/uptime.md'], {});
            process.exitCode = 1;
            return;
        }
        await sendTelegram(token, chatId, formatAlert({ kind: 'test' }));
        await report(['Test alert sent.'], {});
        return;
    }
    if (cmd !== 'check') {
        console.error('usage: node tools/uptime/uptime.mjs check <state-file> | test-alert');
        process.exitCode = 2;
        return;
    }

    let failures = await runChecks();
    if (failures.length) {
        // Confirm before believing it: one more round after a pause.
        console.log(`First round failed (${failures.length}); re-checking in 45 s…`);
        await sleep(Number(process.env.UPTIME_RECHECK_MS ?? 45_000));
        failures = await runChecks();
    }

    const prev = await readState(stateFile);
    const { state, alert } = decide(prev, failures);
    const lines = [
        `### Uptime: ${failures.length ? '🔴 DOWN' : '✅ up'} (previously ${prev?.status ?? 'unknown'})`,
        ...failures.map((f) => `- ${f}`),
    ];

    let alerted = 'no';
    if (alert) {
        if (telegram) {
            try {
                await sendTelegram(token, chatId, formatAlert(alert, runUrl));
                alerted = 'telegram';
            } catch (e) {
                // Keep the old state so the next run tries the alert again.
                lines.push(`::warning::${e.message}`);
                await report(lines, { status: state.status, changed: 'true', alerted: 'failed' });
                return;
            }
        } else {
            lines.push('::notice::State changed, but the Telegram secrets are not set — no alert sent (docs/uptime.md).');
        }
    }
    await writeFile(stateFile, JSON.stringify(state) + '\n');
    await report(lines, { status: state.status, changed: String(Boolean(alert)), alerted });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((e) => {
        console.error(e);
        process.exitCode = 1;
    });
}
