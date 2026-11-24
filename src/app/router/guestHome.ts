import { Capacitor } from '@capacitor/core';

/**
 * Where a signed-out visitor at "/" lands. On the web that's the public landing
 * page (shiftella.app sells the product); the native Android/iOS apps keep
 * going straight to sign-in — no marketing there, and the App Store rules
 * forbid showing prices in the app.
 */
export type GuestHome = 'landing' | 'login';

export function guestHome(isNative: boolean = Capacitor.isNativePlatform()): GuestHome {
    return isNative ? 'login' : 'landing';
}
