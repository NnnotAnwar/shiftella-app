import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { translate, type Language, type TranslationKey } from '@shared/i18n/translations';
import type { User } from '@shared/types';

const state = { user: null as User | null, language: 'en' as Language };
vi.mock('@features/auth/AuthContext', () => ({ useAuthContext: () => ({ user: state.user }) }));
vi.mock('@shared/preferences/PreferencesContext', () => {
    const t = (k: TranslationKey, vars?: Record<string, string | number>) => {
        let s = translate(state.language, k);
        for (const [n, v] of Object.entries(vars ?? {})) s = s.replaceAll(`{${n}}`, String(v));
        return s;
    };
    return { useTranslation: () => t, usePreferences: () => ({ t, language: state.language }) };
});

import { HelpPage } from './HelpPage';
import { HelpLink } from './HelpLink';

const base = { id: 'u', username: 'u', first_name: 'U', last_name: null, email: 'u@x.io', organization_id: 'org' };
const employee: User = { ...base, role: { name: 'Employee', is_admin: false, rank: 0 } };
const owner: User = { ...base, role: { name: 'Head Admin', is_admin: true, rank: 40 } };

function Where() {
    const l = useLocation();
    return <span data-testid="where">{l.pathname + l.search}</span>;
}

function renderAt(path = '/help', ui = <HelpPage />) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="*" element={<>{ui}<Where /></>} />
            </Routes>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    state.user = employee;
    state.language = 'en';
    Element.prototype.scrollIntoView = vi.fn();
});

describe('HelpPage', () => {
    it('lists the topics with the employee’s own articles first and managers’ ones flagged', () => {
        renderAt();
        expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeInTheDocument();
        const rota = screen.getByRole('heading', { name: 'Rota' }).closest('section')!;
        const rows = within(rota).getAllByRole('button');
        expect(rows[0]).toHaveTextContent('See and confirm your shifts');
        expect(rows.at(-1)).toHaveTextContent('For managers');
        expect(screen.getAllByText('For managers').length).toBeGreaterThan(0);
    });

    it('shows no "For managers" flags to the owner', () => {
        state.user = owner;
        renderAt();
        expect(screen.queryByText('For managers')).not.toBeInTheDocument();
    });

    it('opens an article with real UI labels and keeps it in the URL', () => {
        renderAt();
        fireEvent.click(screen.getByRole('button', { name: /Shift templates and copying a month/ }));
        expect(screen.getByTestId('where')).toHaveTextContent('/help?a=rota-templates');
        expect(screen.getByText('Copy last month')).toBeInTheDocument();
        // A manager article: no "Go to" link for an employee.
        expect(screen.queryByRole('link', { name: /Go to/ })).not.toBeInTheDocument();
    });

    it('opens the article from a deep link', () => {
        renderAt('/help?a=request-time-off');
        expect(screen.getByRole('button', { name: /Request time off/, expanded: true })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Go to Requests/ })).toHaveAttribute('href', '/requests');
    });

    it('searches without diacritics in Czech', () => {
        state.language = 'cs';
        renderAt();
        fireEvent.change(screen.getByPlaceholderText('Hledat v nápovědě…'), { target: { value: 'nahradni volno' } });
        const list = screen.getAllByRole('listitem');
        expect(list[0]).toHaveTextContent('Zůstatky dovolené a náhradní volno');
        fireEvent.change(screen.getByPlaceholderText('Hledat v nápovědě…'), { target: { value: 'xyzzy' } });
        expect(screen.getByText(/Na „xyzzy“ nic nesedí/)).toBeInTheDocument();
    });

    it('offers the support email', () => {
        renderAt();
        expect(screen.getByRole('link', { name: 'Email support' }).getAttribute('href')).toMatch(/^mailto:support@shiftella\.app\?/);
    });
});

describe('HelpLink', () => {
    it('opens the article in a dialog only when tapped', async () => {
        renderAt('/schedule', <HelpLink article="rota-publish" />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Help' }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('Publish the rota')).toBeInTheDocument();
        expect(within(dialog).getByRole('link', { name: 'All help articles' })).toHaveAttribute('href', '/help?a=rota-publish');
    });
});
