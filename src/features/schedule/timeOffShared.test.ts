import { describe, expect, it } from 'vitest';
import { translations } from '@shared/i18n/translations';
import { DEFAULT_ENABLED_KINDS, KIND_KEYS, LEAVE_KINDS, fmtLeaveHours, leaveErr } from './timeOffShared';

const t = (k: string) => k;

describe('absence types', () => {
    it('every kind has a name and a grid letter in both languages', () => {
        for (const k of LEAVE_KINDS) {
            for (const lang of ['cs', 'en'] as const) {
                const dict = translations[lang] as Record<string, string>;
                expect(dict[KIND_KEYS[k]], `${lang} ${k}`).toBeTruthy();
                expect(dict[`timeoff.short_${k}`], `${lang} short ${k}`).toBeTruthy();
            }
        }
    });

    it('the default set is a subset of all kinds and includes náhradní volno', () => {
        expect(DEFAULT_ENABLED_KINDS.every((k) => LEAVE_KINDS.includes(k))).toBe(true);
        expect(DEFAULT_ENABLED_KINDS).toContain('comp_time');
        expect(translations.cs['timeoff.comp_time']).toBe('Náhradní volno');
    });

    it('formats hours with at most one decimal', () => {
        expect(fmtLeaveHours(8)).toBe('8 h');
        expect(fmtLeaveHours(7.5)).toBe('7.5 h');
        expect(fmtLeaveHours(-6)).toBe('-6 h');
        expect(fmtLeaveHours(null)).toBe('0 h');
    });

    it('maps the database errors to sentences', () => {
        expect(leaveErr(new Error('TIMEOFF_OVERLAP'), t)).toBe('timeoff.overlap');
        expect(leaveErr(new Error('TIMEOFF_KIND_DISABLED'), t)).toBe('timeoff.kindDisabled');
        expect(leaveErr(new Error('new row … TIMEOFF_HOURS'), t)).toBe('timeoff.badHours');
        expect(leaveErr(new Error(''), t)).toBe('common.actionFailed');
    });
});
