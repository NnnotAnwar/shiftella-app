// The alert state machine of tools/uptime/uptime.mjs: alert only on a change.
import { describe, expect, it } from 'vitest';
import { decide, formatAlert, formatDuration } from './uptime.mjs';

const T0 = 1_700_000_000_000;

describe('uptime decide()', () => {
    it('first run: up is quiet, down alerts', () => {
        expect(decide(null, [], T0)).toEqual({ state: { status: 'up', since: T0 }, alert: null });
        expect(decide(null, ['site: HTTP 502'], T0).alert).toEqual({ kind: 'down', failures: ['site: HTTP 502'] });
    });

    it('no change → no alert, and the original "since" is kept', () => {
        const prev = { status: 'down', since: T0 };
        expect(decide(prev, ['x'], T0 + 600_000)).toEqual({ state: prev, alert: null });
        const up = { status: 'up', since: T0 };
        expect(decide(up, [], T0 + 600_000)).toEqual({ state: up, alert: null });
    });

    it('up → down alerts with the failures', () => {
        const r = decide({ status: 'up', since: T0 }, ['supabase auth: HTTP 503'], T0 + 1000);
        expect(r.state).toEqual({ status: 'down', since: T0 + 1000 });
        expect(r.alert).toEqual({ kind: 'down', failures: ['supabase auth: HTTP 503'] });
    });

    it('down → up alerts with how long it was down', () => {
        const r = decide({ status: 'down', since: T0 }, [], T0 + 17 * 60_000);
        expect(r.state.status).toBe('up');
        expect(r.alert).toEqual({ kind: 'up', downFor: 17 * 60_000 });
        expect(formatAlert(r.alert)).toContain('17 min');
    });
});

describe('uptime messages', () => {
    it('formats durations', () => {
        expect(formatDuration(10_000)).toBe('1 min');
        expect(formatDuration(95 * 60_000)).toBe('1 h 35 min');
    });

    it('lists at most 8 failures and the run link', () => {
        const text = formatAlert({ kind: 'down', failures: Array.from({ length: 12 }, (_, i) => `f${i}`) }, 'https://github.com/x/y/actions/runs/1');
        expect(text.match(/^• /gm)).toHaveLength(8);
        expect(text).toContain('actions/runs/1');
    });
});
