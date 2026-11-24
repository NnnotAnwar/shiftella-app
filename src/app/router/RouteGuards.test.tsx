import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute, PublicRoute } from './RouteGuards';
import { useAuthContext } from '@features/auth/AuthContext';
import { Capacitor } from '@capacitor/core';
import { guestHome } from './guestHome';

vi.mock('@features/auth/AuthContext', () => ({ useAuthContext: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }));
const mockAuth = vi.mocked(useAuthContext);
const mockNative = vi.mocked(Capacitor.isNativePlatform);

type AuthState = { user: unknown; isAuthChecking: boolean };
function setAuth(state: AuthState) {
    mockAuth.mockReturnValue({ ...state, isLoading: false, logout: vi.fn(), refreshUser: vi.fn() } as never);
}

function renderProtected() {
    return render(
        <MemoryRouter initialEntries={['/private']}>
            <Routes>
                <Route element={<ProtectedRoute />}>
                    <Route path="/private" element={<div>PRIVATE</div>} />
                </Route>
                <Route path="/login" element={<div>LOGIN</div>} />
            </Routes>
        </MemoryRouter>,
    );
}

function renderPublic() {
    return render(
        <MemoryRouter initialEntries={['/login']}>
            <Routes>
                <Route element={<PublicRoute />}>
                    <Route path="/login" element={<div>LOGIN</div>} />
                </Route>
                <Route path="/" element={<div>HOME</div>} />
            </Routes>
        </MemoryRouter>,
    );
}

/** The real "/" setup from App.tsx: the app shell behind ProtectedRoute, with the landing for guests. */
function renderRoot(path = '/') {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route element={<ProtectedRoute landing={<div>LANDING</div>} />}>
                    <Route path="/" element={<div>APP</div>}>
                        <Route path="overview" element={<div>OVERVIEW</div>} />
                    </Route>
                </Route>
                <Route path="/login" element={<div>LOGIN</div>} />
            </Routes>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    mockAuth.mockReset();
    mockNative.mockReturnValue(false);
});

describe('guestHome', () => {
    it('is the landing page on the web and the sign-in screen in the native apps', () => {
        expect(guestHome(false)).toBe('landing');
        expect(guestHome(true)).toBe('login');
    });
});

describe('"/" route decision', () => {
    it('shows the landing page to a signed-out web visitor', () => {
        setAuth({ user: null, isAuthChecking: false });
        renderRoot();
        expect(screen.getByText('LANDING')).toBeInTheDocument();
        expect(screen.queryByText('APP')).not.toBeInTheDocument();
    });

    it('shows the app to a signed-in user, never the landing', () => {
        setAuth({ user: { id: 'u1' }, isAuthChecking: false });
        renderRoot();
        expect(screen.getByText('APP')).toBeInTheDocument();
        expect(screen.queryByText('LANDING')).not.toBeInTheDocument();
    });

    it('sends a signed-out visitor in the native app to /login (no landing, no prices)', () => {
        mockNative.mockReturnValue(true);
        setAuth({ user: null, isAuthChecking: false });
        renderRoot();
        expect(screen.getByText('LOGIN')).toBeInTheDocument();
        expect(screen.queryByText('LANDING')).not.toBeInTheDocument();
    });

    it('still sends a signed-out visitor on an app page to /login', () => {
        setAuth({ user: null, isAuthChecking: false });
        renderRoot('/overview');
        expect(screen.getByText('LOGIN')).toBeInTheDocument();
        expect(screen.queryByText('LANDING')).not.toBeInTheDocument();
    });

    it('shows neither while the session is still being checked', () => {
        setAuth({ user: null, isAuthChecking: true });
        renderRoot();
        expect(screen.queryByText('LANDING')).not.toBeInTheDocument();
        expect(screen.queryByText('APP')).not.toBeInTheDocument();
    });
});

describe('ProtectedRoute', () => {
    it('renders the page when authenticated', () => {
        setAuth({ user: { id: 'u1' }, isAuthChecking: false });
        renderProtected();
        expect(screen.getByText('PRIVATE')).toBeInTheDocument();
    });

    it('redirects to /login when not authenticated', () => {
        setAuth({ user: null, isAuthChecking: false });
        renderProtected();
        expect(screen.getByText('LOGIN')).toBeInTheDocument();
        expect(screen.queryByText('PRIVATE')).not.toBeInTheDocument();
    });

    it('shows neither while the session is still being checked', () => {
        setAuth({ user: null, isAuthChecking: true });
        renderProtected();
        expect(screen.queryByText('PRIVATE')).not.toBeInTheDocument();
        expect(screen.queryByText('LOGIN')).not.toBeInTheDocument();
    });
});

describe('PublicRoute', () => {
    it('shows the login page when logged out', () => {
        setAuth({ user: null, isAuthChecking: false });
        renderPublic();
        expect(screen.getByText('LOGIN')).toBeInTheDocument();
    });

    it('redirects to home when already authenticated', () => {
        setAuth({ user: { id: 'u1' }, isAuthChecking: false });
        renderPublic();
        expect(screen.getByText('HOME')).toBeInTheDocument();
        expect(screen.queryByText('LOGIN')).not.toBeInTheDocument();
    });
});
