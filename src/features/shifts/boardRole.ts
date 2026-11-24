import type { TranslationKey } from '@shared/i18n/translations';

type T = (key: TranslationKey) => string;

export interface BoardOrgRole {
    name: string;
    color?: string | null;
    base_role?: string | null;
    preset_key?: string | null;
}

/** Levels with a translated name (`roles.levelName.*`). */
const LEVELS = new Set(['Employee', 'Supervisor', 'Manager', 'Admin', 'Head Admin']);

/**
 * What a live-board role badge says and which palette it uses.
 *   • A custom organization role → its own name and colour.
 *   • A preset role the organization renamed → that name (level palette).
 *   • Otherwise (preset with its seeded English name, or no organization role)
 *     → the level's name in the UI language ("Zaměstnanec", not EMPLOYEE).
 * `baseRole` is the level stored on the shift at clock-in (the fallback).
 */
export function boardRole(baseRole: string, orgRole: BoardOrgRole | null | undefined, t: T): { role: string; label: string; color: string | null } {
    const level = orgRole?.base_role || baseRole;
    if (orgRole && !orgRole.preset_key) return { role: level, label: orgRole.name, color: orgRole.color ?? null };
    if (orgRole && orgRole.name !== orgRole.base_role) return { role: level, label: orgRole.name, color: null };
    return { role: level, label: LEVELS.has(level) ? t(`roles.levelName.${level}` as TranslationKey) : level, color: null };
}
