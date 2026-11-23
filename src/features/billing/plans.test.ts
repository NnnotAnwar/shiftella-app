import { describe, expect, it } from 'vitest';
import { billedPrice, changeKind } from './plans';

describe('billedPrice', () => {
    it('Team is flat: quantity 1 whatever the team size', () => {
        expect(billedPrice('team', 'month', 14)).toEqual({ quantity: 1, unitCzk: 449, totalCzk: 449 });
        expect(billedPrice('team', 'year', 3)).toEqual({ quantity: 1, unitCzk: 4308, totalCzk: 4308 });
    });

    it('Business bills members with a minimum of 10', () => {
        expect(billedPrice('business', 'month', 3)).toEqual({ quantity: 10, unitCzk: 45, totalCzk: 450 });
        expect(billedPrice('business', 'month', 23)).toEqual({ quantity: 23, unitCzk: 45, totalCzk: 1035 });
        expect(billedPrice('business', 'year', 12)).toEqual({ quantity: 12, unitCzk: 432, totalCzk: 5184 });
    });
});

describe('changeKind (mirrors prorationForChange in the Edge Functions)', () => {
    const p = (plan: 'team' | 'business', interval: 'month' | 'year') => ({ plan, interval });

    it('a higher plan or a longer interval is an upgrade (charged now)', () => {
        expect(changeKind(p('team', 'month'), p('business', 'month'), false)).toBe('upgrade');
        expect(changeKind(p('team', 'month'), p('team', 'year'), false)).toBe('upgrade');
        expect(changeKind(p('business', 'month'), p('team', 'year'), false)).toBe('upgrade');
    });

    it('anything else is a downgrade (credited)', () => {
        expect(changeKind(p('business', 'month'), p('team', 'month'), false)).toBe('downgrade');
        expect(changeKind(p('team', 'year'), p('team', 'month'), false)).toBe('downgrade');
        expect(changeKind(p('business', 'year'), p('team', 'month'), false)).toBe('downgrade');
    });

    it('nothing is charged while trialing', () => {
        expect(changeKind(p('team', 'month'), p('business', 'year'), true)).toBe('trial');
    });
});
