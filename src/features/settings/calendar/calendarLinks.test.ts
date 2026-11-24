import { describe, expect, it } from 'vitest';
import { calendarLinks } from './calendarLinks';

describe('calendarLinks', () => {
    const token = 'a'.repeat(64);

    it('builds the https, webcal and Google links', () => {
        const l = calendarLinks('https://abc.supabase.co/', token);
        expect(l.https).toBe(`https://abc.supabase.co/functions/v1/calendar-feed?token=${token}`);
        expect(l.webcal).toBe(`webcal://abc.supabase.co/functions/v1/calendar-feed?token=${token}`);
        expect(l.google).toBe(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(l.webcal)}`);
    });

    it('works for a self-hosted http URL', () => {
        expect(calendarLinks('http://localhost:54321', token).webcal).toMatch(/^webcal:\/\/localhost:54321\/functions\/v1\/calendar-feed\?token=/);
    });
});
