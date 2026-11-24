import { describe, expect, it } from 'vitest';
import { cs, en, type TranslationKey } from '@shared/i18n/translations';
import { inviteErrorMessage } from './inviteErrors';

const makeT = (dict: Record<string, string>) => (key: TranslationKey, vars: Record<string, string | number> = {}) =>
    (dict[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
const tEn = makeT(en);
const tCs = makeT(cs);

// What adminService.toFunctionError builds from the function's `{ error, code, limit }`.
const fnError = (message: string, code?: string, limit?: number) => Object.assign(new Error(message), { code, limit });

describe('inviteErrorMessage', () => {
    it('translates invite-employee codes', () => {
        expect(inviteErrorMessage(fnError('You cannot invite someone at or above your own role level.', 'ROLE_TOO_HIGH'), tCs, 'fb')).toBe(
            'Můžete zvát jen lidi s nižší rolí, než máte vy.',
        );
        expect(inviteErrorMessage(fnError('Unknown role.', 'UNKNOWN_ROLE'), tEn, 'fb')).toBe(en['admin.inviteErr.UNKNOWN_ROLE']);
        expect(inviteErrorMessage(fnError('x', 'NOT_ALLOWED'), tCs, 'fb')).toBe(cs['admin.inviteErr.NOT_ALLOWED']);
    });
    it('puts the plan limit into the sentence', () => {
        expect(inviteErrorMessage(fnError('x', 'PLAN_LIMIT_MEMBERS', 15), tCs, 'fb')).toBe(
            'Váš tarif umožňuje nejvýš 15 lidí. Další pozvete po přechodu na vyšší tarif v sekci Předplatné.',
        );
        expect(inviteErrorMessage(fnError('x', 'PLAN_LIMIT_MEMBERS'), tEn, 'fb')).toContain('up to 5 people');
    });
    it('maps Supabase Auth codes passed through by the function', () => {
        expect(inviteErrorMessage(fnError('A user with this email address has already been registered', 'email_exists'), tCs, 'fb')).toBe(
            'Tento e-mail už má účet.',
        );
        expect(inviteErrorMessage(fnError('x', 'over_email_send_rate_limit'), tEn, 'fb')).toBe(en['admin.inviteErr.RATE_LIMIT']);
    });
    it('falls back to the server message, then to the fallback', () => {
        expect(inviteErrorMessage(fnError('Invalid or expired session.'), tCs, 'fb')).toBe('Invalid or expired session.');
        expect(inviteErrorMessage(fnError('Something new', 'SOMETHING_NEW'), tCs, 'fb')).toBe('Something new');
        expect(inviteErrorMessage(null, tCs, 'fb')).toBe('fb');
    });
});
