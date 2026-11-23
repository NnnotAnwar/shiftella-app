import { useCallback, useEffect, useRef, useState } from 'react';

/** Clear a stuck spinner if the page is still here this long after the tap. */
export const REDIRECT_SAFETY_MS = 15_000;

/**
 * --- REDIRECT ACTION ---
 * In-flight state for buttons that leave the app for Stripe (Checkout,
 * Customer Portal). `run(key, getUrl)` marks `key` busy, asks for the URL and
 * navigates there.
 *
 * Coming back must never leave a spinning or disabled button: the browser's
 * Back button restores the page from the bfcache with its old React state, and
 * a tab switch or a slow redirect can leave it hanging too. So `busy` clears on
 * `pageshow` (bfcache restore included), when the tab becomes visible again, on
 * window `focus`, and after REDIRECT_SAFETY_MS at the latest. When the user
 * really left (a redirect was started, or the page came back from the bfcache),
 * `onReturn` runs once — refetch whatever Stripe may have changed.
 */
export function useRedirectAction({
    onReturn,
    onError,
    navigate = (url) => window.location.assign(url),
}: {
    onReturn?: () => void;
    onError?: (err: unknown) => void;
    /** Where the URL goes (tests swap it; jsdom can't navigate). */
    navigate?: (url: string) => void;
} = {}) {
    const [busy, setBusy] = useState<string | null>(null);
    const left = useRef(false);
    const latest = useRef({ onReturn, onError, navigate });
    useEffect(() => {
        latest.current = { onReturn, onError, navigate };
    });

    useEffect(() => {
        const back = (restored = false) => {
            setBusy(null);
            if (!left.current && !restored) return;
            left.current = false;
            latest.current.onReturn?.();
        };
        const onPageShow = (e: Event) => back((e as PageTransitionEvent).persisted === true);
        const onVisibility = () => {
            if (document.visibilityState === 'visible') back();
        };
        const onFocus = () => back();
        window.addEventListener('pageshow', onPageShow);
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('focus', onFocus);
        return () => {
            window.removeEventListener('pageshow', onPageShow);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('focus', onFocus);
        };
    }, []);

    // Safety net: nothing may spin forever.
    useEffect(() => {
        if (!busy) return;
        const id = setTimeout(() => setBusy(null), REDIRECT_SAFETY_MS);
        return () => clearTimeout(id);
    }, [busy]);

    const run = useCallback(async (key: string, getUrl: () => Promise<string>) => {
        setBusy(key);
        try {
            const url = await getUrl();
            left.current = true;
            latest.current.navigate(url);
        } catch (err) {
            setBusy(null);
            latest.current.onError?.(err);
        }
    }, []);

    return { busy, run };
}
