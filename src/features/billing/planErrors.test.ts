import { describe, expect, it, vi } from 'vitest';
import { cs, en, type TranslationKey } from '@shared/i18n/translations';
import { billingErrorMessage, planFeatureFromError, planFeatureMessage } from './planErrors';
import { BillingError } from './billingService';

vi.mock('@shared/api/supabaseClient', () => ({ supabase: {} }));

const makeT = (dict: Record<string, string>) => (key: TranslationKey, vars: Record<string, string | number> = {}) =>
    (dict[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
const tEn = makeT(en);
const tCs = makeT(cs);

// What PostgREST hands back for a refused write (the trigger's RAISE).
const pgError = (feature: string) => ({
    code: '23514',
    message: `PLAN_FEATURE:${feature}: Your plan does not include this feature. Upgrade to use it.`,
});

describe('planFeatureFromError', () => {
    it('reads the feature from a database refusal (plain object or Error)', () => {
        expect(planFeatureFromError(pgError('templates'))).toBe('templates');
        expect(planFeatureFromError(new Error('PLAN_FEATURE:openShifts: nope'))).toBe('openShifts');
        expect(planFeatureFromError(pgError('coverage'))).toBe('coverage');
    });
    it('ignores other errors and unknown features', () => {
        expect(planFeatureFromError(new Error('TEMPLATE_LIMIT'))).toBeNull();
        expect(planFeatureFromError(pgError('teleport'))).toBeNull();
        expect(planFeatureFromError(null)).toBeNull();
        expect(planFeatureFromError(undefined)).toBeNull();
    });
});

describe('planFeatureMessage', () => {
    it('names the feature and the cheapest plan that has it', () => {
        expect(planFeatureMessage(pgError('swaps'), tEn)).toBe('Shift swaps — part of the Team plan.');
        expect(planFeatureMessage(pgError('coverage'), tCs)).toBe('Požadované obsazení — součást tarifu Business.');
        expect(planFeatureMessage(new Error('boom'), tEn)).toBeNull();
    });
});

describe('billingErrorMessage', () => {
    it('translates the billing functions’ codes', () => {
        expect(billingErrorMessage(new BillingError('x', { code: 'NO_SUBSCRIPTION' }), tCs, 'fb')).toBe(cs['billing.err.NO_SUBSCRIPTION']);
        expect(billingErrorMessage(new BillingError('x', { code: 'GRANDFATHERED' }), tEn, 'fb')).toBe(en['billing.err.GRANDFATHERED']);
        expect(billingErrorMessage(new BillingError('x', { code: 'HAS_SUBSCRIPTION' }), tCs, 'fb')).toBe(cs['billing.err.HAS_SUBSCRIPTION']);
        expect(billingErrorMessage(new BillingError('x', { code: 'GRANTED' }), tCs, 'fb')).toMatch(/^Tarif vám věnoval .+, nic neplatíte\.$/);
        expect(billingErrorMessage(new BillingError('x', { code: 'PLAN_LIMIT_MEMBERS', limit: 15 }), tCs, 'fb')).toBe(
            'Váš tarif umožňuje nejvýš 15 lidí. Pro další přejděte na vyšší tarif.',
        );
        expect(billingErrorMessage(new BillingError('x', { code: 'PLAN_LIMIT_LOCATIONS' }), tEn, 'fb')).toBe(
            'Your plan allows up to 1 active locations. Upgrade to add more.',
        );
    });
    it('"Billing is not configured" has no code — matched by its message', () => {
        expect(billingErrorMessage(new Error('Billing is not configured yet (STRIPE_SECRET_KEY is missing).'), tCs, 'fb')).toBe(
            cs['billing.err.NOT_CONFIGURED'],
        );
    });
    it('falls back to the server message, then to the fallback', () => {
        expect(billingErrorMessage(new BillingError('Only the organization owner can manage billing.'), tCs, 'fb')).toBe(
            'Only the organization owner can manage billing.',
        );
        expect(billingErrorMessage(new BillingError('x', { code: 'SOMETHING_NEW' }), tCs, 'fb')).toBe('x');
        expect(billingErrorMessage({}, tCs, 'fb')).toBe('fb');
    });
});
