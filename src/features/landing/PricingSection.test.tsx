import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { translations, type Language, type TranslationKey } from '@shared/i18n/translations';
import { usePreferences } from '@shared/preferences/PreferencesContext';
import { BUSINESS_MIN_SEATS, LIMITS, PRICES, TRIAL_DAYS, billedPrice, yearlySavingPct } from '@features/billing/plans';
import { PricingSection } from './PricingSection';

vi.mock('@shared/preferences/PreferencesContext', () => ({ usePreferences: vi.fn() }));
const beta = vi.hoisted(() => ({ on: false }));
vi.mock('@features/billing/useBilling', () => ({ useFreeBeta: () => ({ freeBeta: beta.on, isLoading: false }) }));

function setLanguage(language: Language) {
    vi.mocked(usePreferences).mockReturnValue({
        language,
        t: (key: TranslationKey) => translations[language][key] ?? translations.en[key],
    } as never);
}

/** Collapse the non-breaking / narrow spaces Intl puts in "4 308". */
const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s/g, ' ');

function renderPricing() {
    return render(
        <MemoryRouter>
            <PricingSection />
        </MemoryRouter>,
    );
}

beforeEach(() => {
    setLanguage('cs');
    beta.on = false;
});

describe('Landing pricing (from billing/plans.ts)', () => {
    it('shows the monthly prices and limits of every plan', () => {
        renderPricing();
        const free = screen.getByTestId('plan-free');
        const team = screen.getByTestId('plan-team');
        const business = screen.getByTestId('plan-business');

        expect(text(free)).toContain(`Až ${LIMITS.free.members} lidí · ${LIMITS.free.locations} pobočka`);
        expect(text(team)).toContain(`${PRICES.team.month.czk}Kč/ měsíc`);
        expect(text(team)).toContain(`Až ${LIMITS.team.members} lidí · ${LIMITS.team.locations} pobočky`);
        expect(text(business)).toContain(`${PRICES.business.month.czk}Kč/ osoba / měsíc`);
        expect(text(business)).toContain(`od ${BUSINESS_MIN_SEATS} osob`);
    });

    it('switches to yearly prices with the saving badge and the yearly total', async () => {
        renderPricing();
        const yearly = screen.getByRole('button', { name: new RegExp(`Ročně.*${yearlySavingPct('team')}`) });
        await userEvent.click(yearly);
        expect(yearly).toHaveAttribute('aria-pressed', 'true');

        const team = text(screen.getByTestId('plan-team'));
        expect(team).toContain(`${PRICES.team.year.czk}Kč`);
        expect(team).toContain(`Účtováno ročně: ${billedPrice('team', 'year', 1).unitCzk.toLocaleString('cs-CZ').replace(/\s/g, ' ')} Kč`);
        const business = text(screen.getByTestId('plan-business'));
        expect(business).toContain(`${PRICES.business.year.czk}Kč`);
        expect(business).toContain(`${billedPrice('business', 'year', 1).unitCzk} Kč za osobu`);
    });

    it('lists the features each plan adds, the trial length and the VAT note', () => {
        renderPricing();
        const team = screen.getByTestId('plan-team');
        expect(within(team).getByText(translations.cs['billing.feature.timesheets'])).toBeInTheDocument();
        expect(within(team).getByText(translations.cs['billing.feature.swaps'])).toBeInTheDocument();
        const business = screen.getByTestId('plan-business');
        expect(within(business).getByText(translations.cs['billing.feature.activityLog'])).toBeInTheDocument();
        expect(within(business).queryByText(translations.cs['billing.feature.swaps'])).not.toBeInTheDocument();
        expect(screen.getAllByText(`${TRIAL_DAYS} dní zdarma, bez karty`)).toHaveLength(2);
        expect(screen.getByText('Ceny jsou konečné, DPH se nepřipočítává.')).toBeInTheDocument();
        for (const link of screen.getAllByRole('link')) expect(link).toHaveAttribute('href', '/signup');
    });

    it('renders in English too', () => {
        setLanguage('en');
        renderPricing();
        expect(text(screen.getByTestId('plan-team'))).toContain(`${PRICES.team.month.czk}CZK/ month`);
        expect(text(screen.getByTestId('plan-free'))).toContain(`Up to ${LIMITS.free.members} people · 1 location`);
        expect(screen.getByText('Prices are final, no VAT is added.')).toBeInTheDocument();
    });

    it('free beta: a banner says everything is free, and no plan offers a trial', () => {
        beta.on = true;
        renderPricing();
        expect(screen.getByRole('note')).toHaveTextContent('Během bety je všechno zdarma');
        const team = text(screen.getByTestId('plan-team'));
        expect(team).toContain('Začít zdarma');
        expect(team).toContain('Zdarma během bety, bez karty');
        expect(team).not.toContain('Vyzkoušet zdarma');
    });

    it('no banner outside the beta', () => {
        renderPricing();
        expect(screen.queryByRole('note')).toBeNull();
    });
});
