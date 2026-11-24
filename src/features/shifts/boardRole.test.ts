import { describe, expect, it } from 'vitest';
import { cs, type TranslationKey } from '@shared/i18n/translations';
import { boardRole } from './boardRole';

const t = (key: TranslationKey) => cs[key] ?? key;
const preset = (name: string, base: string, key: string) => ({ name, color: '#22c55e', base_role: base, preset_key: key });

describe('boardRole (live-board badge)', () => {
    it('a custom organization role shows its own name and colour', () => {
        expect(boardRole('Employee', { name: 'Barista', color: '#a855f7', base_role: 'Employee', preset_key: null }, t)).toEqual({
            role: 'Employee',
            label: 'Barista',
            color: '#a855f7',
        });
    });
    it('a preset with its seeded English name shows the translated level', () => {
        expect(boardRole('Manager', preset('Manager', 'Manager', 'manager'), t)).toEqual({ role: 'Manager', label: 'Manažer', color: null });
        expect(boardRole('Employee', preset('Employee', 'Employee', 'employee'), t).label).toBe('Zaměstnanec');
    });
    it('a renamed preset keeps the organization’s name', () => {
        expect(boardRole('Employee', preset('Brigádník', 'Employee', 'employee'), t)).toEqual({ role: 'Employee', label: 'Brigádník', color: null });
    });
    it('no organization role → the level stored on the shift, translated', () => {
        expect(boardRole('Employee', null, t).label).toBe('Zaměstnanec');
        expect(boardRole('Head Admin', undefined, t).label).toBe('Hlavní admin');
        // No translation for the platform role — shown as is.
        expect(boardRole('Superadmin', null, t).label).toBe('Superadmin');
    });
    it('the palette follows the organization role’s level (the member may have been promoted)', () => {
        expect(boardRole('Employee', preset('Manager', 'Manager', 'manager'), t).role).toBe('Manager');
    });
});
