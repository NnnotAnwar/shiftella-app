// tools/native-version.mjs: the native build number derived from package.json.
import { describe, expect, it } from 'vitest';
import { applyVersion, buildNumber } from './native-version.mjs';

describe('buildNumber()', () => {
    it('major * 1_000_000 + minor * 1_000 + patch', () => {
        expect(buildNumber('1.14.10')).toBe(1014010);
        expect(buildNumber('0.0.1')).toBe(1);
        expect(buildNumber('2.0.0')).toBe(2000000);
        expect(buildNumber('1.999.999')).toBe(1999999);
    });

    it('grows with every release', () => {
        const order = ['1.9.9', '1.14.9', '1.14.10', '1.15.0', '2.0.0'];
        const builds = order.map(buildNumber);
        expect([...builds].sort((a, b) => a - b)).toEqual(builds);
        expect(new Set(builds).size).toBe(builds.length);
    });

    it('rejects anything but plain semver', () => {
        for (const bad of ['1.14', '1.14.10-beta.1', '1.14.10+42', 'v1.14.10', '01.2.3', '', undefined]) {
            expect(() => buildNumber(bad)).toThrow(/plain semver/);
        }
    });

    it('rejects minor/patch ≥ 1000 (would collide)', () => {
        expect(() => buildNumber('1.1000.0')).toThrow(/below 1000/);
        expect(() => buildNumber('1.0.1000')).toThrow(/below 1000/);
    });
});

describe('applyVersion()', () => {
    const pbx = [
        '\t\t\tbuildSettings = {',
        '\t\t\t\tCODE_SIGN_STYLE = Automatic;',
        '\t\t\t\tCURRENT_PROJECT_VERSION = 1;',
        '\t\t\t\tMARKETING_VERSION = 1.0;',
        '\t\t\t};',
        '\t\t\tbuildSettings = {',
        '\t\t\t\tCURRENT_PROJECT_VERSION = 1;',
        '\t\t\t\tMARKETING_VERSION = 1.0;',
        '\t\t\t};',
        '',
    ].join('\n');

    it('rewrites only the version lines, in every config', () => {
        const out = applyVersion(pbx, '1.14.10');
        expect(out).toBe(
            pbx
                .replaceAll('CURRENT_PROJECT_VERSION = 1;', 'CURRENT_PROJECT_VERSION = 1014010;')
                .replaceAll('MARKETING_VERSION = 1.0;', 'MARKETING_VERSION = 1.14.10;'),
        );
    });

    it('is idempotent', () => {
        const once = applyVersion(pbx, '1.14.10');
        expect(applyVersion(once, '1.14.10')).toBe(once);
    });
});
