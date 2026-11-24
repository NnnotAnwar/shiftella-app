/**
 * Subscription links for a member's calendar feed (the `calendar-feed` Edge
 * Function). Pure, so it is unit-tested.
 *   https  — what you paste into Google ("From URL") or anywhere else
 *   webcal — opens the subscribe dialog in Apple Calendar / Outlook
 *   google — Google Calendar's "add by URL" page, prefilled
 */
export interface CalendarLinks {
    https: string;
    webcal: string;
    google: string;
}

export function calendarLinks(supabaseUrl: string, token: string): CalendarLinks {
    const base = supabaseUrl.replace(/\/+$/, '');
    const https = `${base}/functions/v1/calendar-feed?token=${encodeURIComponent(token)}`;
    const webcal = https.replace(/^https?:\/\//, 'webcal://');
    return { https, webcal, google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` };
}
