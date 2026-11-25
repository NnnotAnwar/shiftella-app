import { useMemo } from 'react';
import {
    SquaresFourIcon,
    ChartBarIcon,
    CalendarBlankIcon,
    ShieldCheckIcon,
    ClockUserIcon,
    UserCircleGearIcon,
    ClockCounterClockwiseIcon,
    ChartLineUpIcon,
    GearIcon,
    MegaphoneIcon,
    NotePencilIcon,
    CreditCardIcon,
    QuestionIcon,
    ChatCircleTextIcon,
    type Icon,
} from '@phosphor-icons/react';

import { usePermissions } from '@shared/auth/usePermissions';
import { canManageBilling, isNativeApp, useEntitlements } from '@features/billing/useBilling';
import { billingNavPill, type NavPill } from '@features/billing/navPill';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { useRequestsBadge } from '@features/requests/useRequests';
import { useUnreadAnnouncementCount } from '@features/announcements/useUnreadAnnouncementCount';
import { useNewFeedbackCount } from '@features/feedback/useFeedback';
import { isSuperAdmin } from '@shared/auth/permissions';
import type { TranslationKey } from '@shared/i18n/translations';

/**
 * --- NAVIGATION CONFIG ---
 * The single source of truth for every primary destination, shared by the
 * desktop Sidebar and the mobile BottomNav so the two can never drift. Add a
 * destination here once and it appears (gated, badged, grouped) everywhere.
 */

export type NavSection = 'work' | 'manage' | 'system';

/** Render order of the sidebar sections. */
export const NAV_SECTIONS: readonly NavSection[] = ['work', 'manage', 'system'];

/** Section header labels. */
export const SECTION_LABEL_KEYS: Record<NavSection, TranslationKey> = {
    work: 'nav.sectionWork',
    manage: 'nav.sectionManage',
    system: 'nav.sectionSystem',
};

/** Capabilities a nav item can gate on (a subset of usePermissions). */
export interface NavCaps {
    team: boolean; // the Team page (members.view)
    timesheets: boolean; // timesheets.view
    activity: boolean; // activity.view
    analytics: boolean; // analytics.view (rota + timesheets read)
    billing: boolean; // the org's Head Admin (and Superadmin)
    superadmin: boolean; // the platform Superadmin (feedback inbox)
}

/** Named live-badge sources, resolved by `useNavItems`. */
type BadgeSource = 'pendingRequests' | 'unreadAnnouncements' | 'newFeedback';

/** Named status-pill sources, resolved by `useNavItems`. */
type PillSource = 'billing';

/**
 * Who the mobile tab bar is laid out for. Staff (rank < 20) live in their own
 * schedule and hours; managers and up live in the rota, timesheets and team.
 */
export type MobileAudience = 'staff' | 'manager';

export interface NavItemDef {
    id: string;
    /** Full label (sidebar + mobile "More" sheet). */
    labelKey: TranslationKey;
    /** Compact label for the mobile tab bar; defaults to `labelKey`. */
    shortLabelKey?: TranslationKey;
    icon: Icon;
    route: string;
    section: NavSection;
    /** When omitted the item is always visible; otherwise gated on capabilities. */
    visible?: (caps: NavCaps) => boolean;
    /**
     * Slot in the mobile tab bar per audience (lower = further left); items
     * without a slot for the current audience live in the "More" sheet. The bar
     * holds at most four destinations + "More" (the 3–5 tab rule).
     */
    mobileSlot?: Partial<Record<MobileAudience, number>>;
    badge?: BadgeSource;
    /** A small status pill after the label (e.g. the subscription's state). */
    pill?: PillSource;
}

export const NAV_ITEMS: readonly NavItemDef[] = [
    { id: 'dashboard', labelKey: 'nav.dashboard', shortLabelKey: 'nav.home', icon: SquaresFourIcon, route: '/', section: 'work', mobileSlot: { staff: 1, manager: 1 } },
    { id: 'schedule', labelKey: 'nav.schedule', icon: CalendarBlankIcon, route: '/schedule', section: 'work', mobileSlot: { staff: 2, manager: 2 } },
    { id: 'overview', labelKey: 'nav.myHours', icon: ChartBarIcon, route: '/overview', section: 'work', mobileSlot: { staff: 3 } },
    { id: 'announcements', labelKey: 'nav.announcements', icon: MegaphoneIcon, route: '/announcements', section: 'work', mobileSlot: { staff: 4 }, badge: 'unreadAnnouncements' },
    { id: 'requests', labelKey: 'nav.requests', icon: UserCircleGearIcon, route: '/requests', section: 'work', badge: 'pendingRequests' },
    { id: 'timesheets', labelKey: 'nav.timesheets', icon: ClockUserIcon, route: '/timesheets', section: 'manage', visible: (c) => c.timesheets, mobileSlot: { manager: 3 } },
    { id: 'notes', labelKey: 'nav.shiftNotes', icon: NotePencilIcon, route: '/notes', section: 'manage', visible: (c) => c.timesheets },
    { id: 'admin', labelKey: 'nav.team', icon: ShieldCheckIcon, route: '/admin', section: 'manage', visible: (c) => c.team, mobileSlot: { manager: 4 } },
    { id: 'analytics', labelKey: 'nav.analytics', icon: ChartLineUpIcon, route: '/analytics', section: 'manage', visible: (c) => c.analytics },
    { id: 'activity', labelKey: 'nav.activity', icon: ClockCounterClockwiseIcon, route: '/activity', section: 'manage', visible: (c) => c.activity },
    // First in System, with a status pill, so the owner never has to hunt for it.
    { id: 'billing', labelKey: 'nav.billing', icon: CreditCardIcon, route: '/billing', section: 'system', visible: (c) => c.billing, pill: 'billing' },
    { id: 'settings', labelKey: 'nav.settings', icon: GearIcon, route: '/settings', section: 'system' },
    // Platform owner only: what users sent from "Send feedback".
    { id: 'feedback', labelKey: 'nav.feedback', icon: ChatCircleTextIcon, route: '/feedback', section: 'system', visible: (c) => c.superadmin, badge: 'newFeedback' },
    // Help centre — last in System; on phones it lives in the "More" sheet.
    { id: 'help', labelKey: 'nav.help', icon: QuestionIcon, route: '/help', section: 'system' },
];

/** A nav item resolved for the current user: visible, translated and badged. */
export interface ResolvedNavItem {
    id: string;
    label: string;
    shortLabel: string;
    icon: Icon;
    route: string;
    section: NavSection;
    /** Tab-bar slot for the current user's audience, or null = "More" sheet. */
    mobileSlot: number | null;
    badgeCount: number;
    /** Status pill (text + tone), or null. */
    pill: NavPill | null;
}

/**
 * Resolve `NAV_ITEMS` for the current user — filtered by capability, translated,
 * and with live badge counts folded in. Consumed by Sidebar and BottomNav.
 */
export function useNavItems(): ResolvedNavItem[] {
    const { can, user } = usePermissions();
    const billing = canManageBilling(user);
    const team = can('members.view');
    const timesheets = can('timesheets.view');
    const activity = can('activity.view');
    const analytics = can('analytics.view');
    const observer = can('team.view');
    // Deciders: requests waiting for them; everyone else: unseen decisions on their own.
    const pendingRequests = useRequestsBadge();
    const unreadAnnouncements = useUnreadAnnouncementCount();
    const newFeedback = useNewFeedbackCount();
    const superadmin = !!user && isSuperAdmin(user);
    const ent = useEntitlements();
    const t = useTranslation();

    return useMemo(() => {
        const caps: NavCaps = { team, timesheets, activity, analytics, billing, superadmin };
        const audience: MobileAudience = observer ? 'manager' : 'staff';
        const badges: Record<BadgeSource, number> = { pendingRequests, unreadAnnouncements, newFeedback };
        const pills: Record<PillSource, NavPill | null> = { billing: billing ? billingNavPill(ent, { t, native: isNativeApp() }) : null };
        return NAV_ITEMS.filter((i) => !i.visible || i.visible(caps)).map((i) => ({
            id: i.id,
            label: t(i.labelKey),
            shortLabel: t(i.shortLabelKey ?? i.labelKey),
            icon: i.icon,
            route: i.route,
            section: i.section,
            mobileSlot: i.mobileSlot?.[audience] ?? null,
            badgeCount: i.badge ? badges[i.badge] : 0,
            pill: i.pill ? pills[i.pill] : null,
        }));
    }, [team, timesheets, activity, analytics, billing, superadmin, observer, pendingRequests, unreadAnnouncements, newFeedback, ent, t]);
}
