// =============================================================================
// EDGE FUNCTION: calendar-feed   (verify_jwt = false — the token is the auth)
// -----------------------------------------------------------------------------
// GET /functions/v1/calendar-feed?token=<64 hex>
//   → text/calendar with the token owner's PUBLISHED rota (last 30 days, next
//     180 days) plus their approved time off as all-day events.
//
// Calendar apps (Google, Apple, Outlook) poll this URL without signing in, so:
//   • the token is looked up with the service role; everything after that is
//     filtered strictly by the token's user AND their current organization —
//     nothing else is ever read;
//   • an unknown / malformed token gets a bare 404 (no hint whether it existed);
//   • responses carry Cache-Control + an ETag, and a matching If-None-Match
//     gets 304, so frequent polling stays cheap. Two indexed queries per hit.
// Tokens are created / replaced by public.calendar_feed_token() (migration
// 20261124130000_calendar_feeds_and_member_import.sql).
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCalendar, feedWindow, isValidToken, type FeedLanguage, type FeedShift, type FeedTimeOff } from './ics.ts';

const CACHE_SECONDS = 900; // 15 min — calendar apps poll far less often anyway

function plain(status: number, body: string, extra: Record<string, string> = {}) {
    return new Response(body, {
        status,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
    });
}

async function etagOf(body: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
    const hex = Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
    return `"${hex}"`;
}

Deno.serve(async (req) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return plain(405, 'Method not allowed.', { Allow: 'GET, HEAD' });

    const token = new URL(req.url).searchParams.get('token')?.trim().toLowerCase();
    if (!isValidToken(token)) return plain(404, 'Not found.');

    try {
        const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // 1. Token → its owner (+ their current organization and language).
        const { data: feed } = await admin.from('calendar_feeds').select('user_id').eq('token', token).maybeSingle();
        if (!feed) return plain(404, 'Not found.');
        const userId = feed.user_id as string;

        const [{ data: profile }, { data: prefs }] = await Promise.all([
            admin.from('profiles').select('organization_id').eq('id', userId).maybeSingle(),
            admin.from('notification_preferences').select('language').eq('user_id', userId).maybeSingle(),
        ]);
        const orgId = profile?.organization_id as string | null | undefined;
        if (!orgId) return plain(404, 'Not found.');
        // Feed copy is cs/en only: Slovak → Czech, Ukrainian (and anything else) → English.
        const language: FeedLanguage = /^(cs|sk)\b/i.test(prefs?.language ?? '') ? 'cs' : 'en';

        // 2. Their published rota + approved time off in the window — this user, this org only.
        const win = feedWindow(Date.now());
        const [shiftsRes, timeOffRes] = await Promise.all([
            admin
                .from('scheduled_shifts')
                .select('id, starts_at, ends_at, all_day, note, updated_at, created_at, locations:location_id(name)')
                .eq('user_id', userId)
                .eq('organization_id', orgId)
                .eq('published', true)
                .gte('starts_at', win.fromISO)
                .lt('starts_at', win.toISO)
                .order('starts_at', { ascending: true })
                .limit(1000),
            admin
                .from('time_off')
                .select('id, kind, starts_on, ends_on, created_at')
                .eq('user_id', userId)
                .eq('organization_id', orgId)
                .eq('status', 'approved')
                .lte('starts_on', win.toDate)
                .gte('ends_on', win.fromDate)
                .limit(500),
        ]);
        if (shiftsRes.error || timeOffRes.error) return plain(503, 'Temporarily unavailable.', { 'Retry-After': '300' });

        type ShiftRow = Omit<FeedShift, 'location_name'> & { locations: { name: string | null } | { name: string | null }[] | null };
        const shifts: FeedShift[] = ((shiftsRes.data ?? []) as unknown as ShiftRow[]).map(({ locations, ...s }) => ({
            ...s,
            location_name: (Array.isArray(locations) ? locations[0]?.name : locations?.name) ?? null,
        }));

        const body = buildCalendar({ language, shifts, timeOff: (timeOffRes.data ?? []) as FeedTimeOff[] });
        const etag = await etagOf(body);
        const headers = {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'inline; filename="shiftella.ics"',
            // private: the URL is a secret — shared caches must not keep it.
            'Cache-Control': `private, max-age=${CACHE_SECONDS}`,
            ETag: etag,
            'X-Robots-Tag': 'noindex',
        };
        if (req.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers });
        return new Response(req.method === 'HEAD' ? null : body, { status: 200, headers });
    } catch (err) {
        console.error('calendar-feed failed', err instanceof Error ? err.message : err);
        return plain(500, 'Unexpected error.');
    }
});
