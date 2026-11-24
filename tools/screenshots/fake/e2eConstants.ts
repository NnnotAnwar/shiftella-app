/**
 * Shared by the fake Supabase client (browser) and the Playwright tests (Node):
 * the localStorage keys of the E2E mode and the demo password.
 */
/** Who is signed in: a demo profile id, or 'none'. Its presence turns E2E mode on. */
export const E2E_AUTH_KEY = 'demo-auth';
/** The dataset, kept per tab so reloads see earlier writes. */
export const E2E_DB_KEY = 'demo-db';
/** Invites sent in this browser: token → invitee. */
export const E2E_INVITES_KEY = 'demo-invites';
/** The password of every demo account in E2E mode (invented, local only). */
export const E2E_PASSWORD = 'demo-heslo-2026';
/** The demo organization owner ("Petra Nováková", Head Admin). */
export const E2E_OWNER = { id: '00000000-0000-4000-8001-000000000001', email: 'petra.novakova@umostu.example', username: 'petra.novakova' };
