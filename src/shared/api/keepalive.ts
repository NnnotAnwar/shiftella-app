/**
 * --- KEEPALIVE REQUESTS ---
 * Requests sent while the page is closing are cancelled by the browser unless
 * they are `keepalive`. `withKeepalive(fn)` marks every Supabase request started
 * in the next few seconds as keepalive (the client's fetch reads the flag), so
 * work flushed on `pagehide` still reaches the server.
 */

let until = 0;

export function withKeepalive<T>(fn: () => T, ms = 3000): T {
    until = Date.now() + ms;
    return fn();
}

export const keepaliveFetch: typeof fetch = (input, init) =>
    fetch(input, Date.now() < until ? { ...init, keepalive: true } : init);
