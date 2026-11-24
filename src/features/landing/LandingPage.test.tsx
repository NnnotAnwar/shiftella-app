import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { translations, type Language, type TranslationKey } from '@shared/i18n/translations';
import { usePreferences } from '@shared/preferences/PreferencesContext';
import { LANDING } from './landingContent';
import { LandingPage } from './LandingPage';

vi.mock('@shared/preferences/PreferencesContext', () => ({ usePreferences: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }));
// The toggles need the theme provider; they're covered with the auth pages.
vi.mock('@features/auth/AuthShell', () => ({ LanguageToggle: () => null, ThemeToggle: () => null }));

function setLanguage(language: Language) {
    vi.mocked(usePreferences).mockReturnValue({
        language,
        t: (key: TranslationKey) => translations[language][key] ?? translations.en[key],
    } as never);
}

function renderLanding() {
    return render(
        <MemoryRouter initialEntries={['/']}>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<div>LOGIN</div>} />
            </Routes>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    document.head.innerHTML = '<meta name="description" content="static">';
    document.title = 'static';
});

describe('LandingPage', () => {
    it('renders the hero with the sign-up and sign-in CTAs, and sets the Czech title + description', () => {
        setLanguage('cs');
        renderLanding();
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(LANDING.cs.hero.title);
        expect(screen.getAllByRole('link', { name: /Vyzkoušet 30 dní zdarma/ })[0]).toHaveAttribute('href', '/signup');
        expect(screen.getAllByRole('link', { name: 'Přihlásit se' })[0]).toHaveAttribute('href', '/login');
        expect(document.title).toBe(LANDING.cs.meta.title);
        expect(document.querySelector('meta[name="description"]')).toHaveAttribute('content', LANDING.cs.meta.description);
    });

    it('uses the English title and restores the previous one on unmount', () => {
        setLanguage('en');
        const { unmount } = renderLanding();
        expect(document.title).toBe(LANDING.en.meta.title);
        unmount();
        expect(document.title).toBe('static');
    });

    it('never renders in the native apps', () => {
        vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
        setLanguage('cs');
        renderLanding();
        expect(screen.getByText('LOGIN')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    });
});
