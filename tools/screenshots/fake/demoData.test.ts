import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDemoData } from './demoData';

/**
 * The public demo (shiftella.app/demo/) builds this dataset on the visitor's real
 * clock, so it must build on any day at any hour — a month's last days once left
 * a swap without a shift and blanked the whole demo.
 */
describe('buildDemoData on the real clock', () => {
    afterEach(() => vi.useRealTimers());

    it('builds for every day of a year, just after midnight and late at night', { timeout: 30_000 }, () => {
        vi.useFakeTimers();
        const start = new Date(2026, 0, 1);
        for (let day = 0; day < 366; day++) {
            for (const hour of [0, 23]) {
                const now = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day, hour, 30);
                vi.setSystemTime(now);
                const db = buildDemoData();
                const shiftIds = new Set(db.scheduled_shifts.map((s) => s.id));
                for (const sw of db.shift_swaps) expect(shiftIds.has(sw.shift_id), `${now.toISOString()} swap ${sw.id}`).toBe(true);
                // There is always something coming up to look at.
                expect(db.scheduled_shifts.some((s) => Date.parse(s.starts_at as string) > now.getTime() + 7 * 86400000), now.toISOString()).toBe(true);
            }
        }
    });
});
