// =============================================================================
// SHARED: Europe/Prague calendar math (the app's business time zone).
// Pure — Intl does the zone lookups, so DST is handled. See telegram_test.ts /
// telegram-webhook/bot_test.ts.
// =============================================================================

export const TZ = 'Europe/Prague';

/** Offset of `TZ` from UTC at instant `ms`, in ms (+1h → 3_600_000). */
function tzOffsetMs(ms: number): number {
    const p = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
        }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]),
    );
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Prague calendar date of an instant: { y, m (1–12), d }. */
export function pragueDate(at: Date): { y: number; m: number; d: number } {
    const shifted = new Date(at.getTime() + tzOffsetMs(at.getTime()));
    return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
}

/** The UTC instant of Prague midnight starting y-m-d (m / d may overflow: month 13 → next January). */
export function pragueMidnight(y: number, m: number, d: number): Date {
    const guess = Date.UTC(y, m - 1, d);
    let t = guess - tzOffsetMs(guess);
    t = guess - tzOffsetMs(t); // DST edge: re-check at the found instant
    return new Date(t);
}
