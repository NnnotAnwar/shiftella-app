import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { REDIRECT_SAFETY_MS, useRedirectAction } from './useRedirectAction';

/** A pageshow event; `persisted` = restored from the back/forward cache. */
const pageshow = (persisted: boolean) => Object.assign(new Event('pageshow'), { persisted });

function setup() {
    const navigate = vi.fn();
    const onReturn = vi.fn();
    const onError = vi.fn();
    const hook = renderHook(() => useRedirectAction({ navigate, onReturn, onError }));
    return { ...hook, navigate, onReturn, onError };
}

describe('useRedirectAction', () => {
    afterEach(() => {
        vi.useRealTimers();
        Reflect.deleteProperty(document, 'visibilityState');
    });

    it('marks the tapped key busy and navigates to the URL', async () => {
        const { result, navigate } = setup();
        await act(() => result.current.run('team', async () => 'https://checkout.stripe.com/x'));
        expect(result.current.busy).toBe('team');
        expect(navigate).toHaveBeenCalledWith('https://checkout.stripe.com/x');
    });

    it('Back button (bfcache pageshow): idle again and refetches', async () => {
        const { result, onReturn } = setup();
        await act(() => result.current.run('team', async () => 'https://checkout.stripe.com/x'));
        act(() => void window.dispatchEvent(pageshow(true)));
        expect(result.current.busy).toBeNull();
        expect(onReturn).toHaveBeenCalledTimes(1);
    });

    it('a bfcache restore refetches even with nothing in flight', () => {
        const { onReturn } = setup();
        act(() => void window.dispatchEvent(pageshow(true)));
        expect(onReturn).toHaveBeenCalledTimes(1);
    });

    it('tab visible again / window focus: idle again; refetch once, only after leaving', async () => {
        const { result, onReturn } = setup();
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });

        act(() => void document.dispatchEvent(new Event('visibilitychange')));
        expect(onReturn).not.toHaveBeenCalled();

        await act(() => result.current.run('portal', async () => 'https://billing.stripe.com/p'));
        act(() => void document.dispatchEvent(new Event('visibilitychange')));
        expect(result.current.busy).toBeNull();
        expect(onReturn).toHaveBeenCalledTimes(1);

        await act(() => result.current.run('portal', async () => 'https://billing.stripe.com/p'));
        act(() => void window.dispatchEvent(new Event('focus')));
        expect(result.current.busy).toBeNull();
        expect(onReturn).toHaveBeenCalledTimes(2);
    });

    it('a hidden tab does not clear the spinner', async () => {
        const { result } = setup();
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        await act(() => result.current.run('team', async () => 'https://checkout.stripe.com/x'));
        act(() => void document.dispatchEvent(new Event('visibilitychange')));
        expect(result.current.busy).toBe('team');
    });

    it('safety net: clears after 15 s if the page never left', async () => {
        vi.useFakeTimers();
        const { result } = setup();
        await act(() => result.current.run('team', async () => 'https://checkout.stripe.com/x'));
        act(() => vi.advanceTimersByTime(REDIRECT_SAFETY_MS - 1));
        expect(result.current.busy).toBe('team');
        act(() => vi.advanceTimersByTime(1));
        expect(result.current.busy).toBeNull();
    });

    it('a failed URL request clears busy and reports the error', async () => {
        const { result, navigate, onError } = setup();
        const err = new Error('nope');
        await act(() => result.current.run('team', async () => Promise.reject(err)));
        expect(result.current.busy).toBeNull();
        expect(navigate).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(err);
    });
});
