// Deno tests for employee-document reminders (send-push / Telegram copy) and
// the GDPR file cleanup.
//   cp -R supabase/functions /tmp/fn && cd /tmp/fn && deno test _shared/documents_test.ts
import { deepStrictEqual, strictEqual } from 'node:assert';
import { docDate, documentExpiringCopy, messagesFromWebhook, render } from './notify.ts';
import { memberDocumentPaths, removeDocumentFiles } from './documents.ts';

Deno.test('docDate: Czech and English day formats', () => {
    strictEqual(docDate('2027-02-03', 'cs'), '3. 2. 2027');
    strictEqual(docDate('2027-02-03', 'en'), '3 Feb 2027');
    strictEqual(docDate('garbage', 'en'), 'garbage');
});

Deno.test('document_expiring: 30 / 7 / 0 / expired, Czech plurals, own vs. a member', () => {
    const own = (days: number, lang: 'cs' | 'en') => documentExpiringCopy({ type: 'health_card', date: '2027-02-03', days }, lang);
    deepStrictEqual(own(30, 'cs'), { title: 'Dokument brzy vyprší', body: 'Zdravotní průkaz: platí do 3. 2. 2027 (zbývá 30 dní).' });
    deepStrictEqual(own(7, 'en'), { title: 'Document expiring soon', body: 'Health certificate: valid until 3 Feb 2027 (7 days left).' });
    strictEqual(own(3, 'cs').body, 'Zdravotní průkaz: platí do 3. 2. 2027 (zbývají 3 dny).');
    strictEqual(own(1, 'cs').body, 'Zdravotní průkaz: platí do 3. 2. 2027 (zbývá 1 den).');
    deepStrictEqual(own(0, 'cs'), { title: 'Dokument dnes vyprší', body: 'Zdravotní průkaz: platí jen do dnes (3. 2. 2027).' });
    deepStrictEqual(own(-2, 'en'), { title: 'Document expired', body: 'Health certificate: expired on 3 Feb 2027.' });

    const member = documentExpiringCopy({ who: 'Jana Nováková', type: 'safety_training', date: '2027-02-03', days: 7 }, 'cs');
    strictEqual(member.body, 'Jana Nováková — Školení BOZP: platí do 3. 2. 2027 (zbývá 7 dní).');
    // "Other" reads by its own name.
    strictEqual(documentExpiringCopy({ type: 'other', name: 'Řidičák', date: '2027-02-03', days: 0 }, 'cs').body, 'Řidičák: platí jen do dnes (3. 2. 2027).');
});

Deno.test('document_expiring webhook rows: the member and their admin', async () => {
    const details = { doc_type: 'food_card', subject_name: 'PP', valid_until: '2027-02-03', days_left: 7, target_name: 'Jana' };
    const self = await messagesFromWebhook({} as never, 'shift_audit_log', {
        action: 'document_expiring', target_user_id: 'm1', subject_id: 'm1', details,
    });
    deepStrictEqual(self.map((m) => [m.userId, m.route, m.category, m.vars?.who]), [['m1', '/profile', 'account', '']]);
    strictEqual(render(self[0], 'cs').body, 'Potravinářský průkaz: platí do 3. 2. 2027 (zbývá 7 dní).');

    const boss = await messagesFromWebhook({} as never, 'shift_audit_log', {
        action: 'document_expiring', target_user_id: 'a1', subject_id: 'm1', details,
    });
    deepStrictEqual(boss.map((m) => [m.userId, m.route, m.vars?.who]), [['a1', '/profile/m1', 'Jana']]);
    strictEqual(render(boss[0], 'en').body, 'Jana — Food handler card: valid until 3 Feb 2027 (7 days left).');
});

/** A tiny stand-in for the service-role client. */
function fakeAdmin(rows: { file_path: string }[], files: string[]) {
    const removed: string[][] = [];
    const listed: string[] = [];
    const client = {
        from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: rows, error: null }) }) }),
        storage: {
            from: () => ({
                list: (folder: string) => {
                    listed.push(folder);
                    return Promise.resolve({ data: files.map((name) => ({ name })), error: null });
                },
                remove: (paths: string[]) => {
                    removed.push(paths);
                    return Promise.resolve({ data: [], error: null });
                },
            }),
        },
    };
    return { client: client as never, removed, listed };
}

Deno.test('GDPR: every file of the member — rows + strays in their folder — is removed', async () => {
    const { client, removed, listed } = fakeAdmin([{ file_path: 'o1/u1/a.pdf' }], ['a.pdf', 'stray.png']);
    const paths = await memberDocumentPaths(client, 'u1', 'o1');
    deepStrictEqual(listed, ['o1/u1']);
    deepStrictEqual(paths.sort(), ['o1/u1/a.pdf', 'o1/u1/stray.png']);
    strictEqual(await removeDocumentFiles(client, paths), 2);
    deepStrictEqual(removed.flat().sort(), ['o1/u1/a.pdf', 'o1/u1/stray.png']);
});

Deno.test('GDPR: nothing stored → nothing removed', async () => {
    const { client, removed } = fakeAdmin([], []);
    const paths = await memberDocumentPaths(client, 'u1', null);
    deepStrictEqual(paths, []);
    await removeDocumentFiles(client, paths);
    deepStrictEqual(removed, []);
});
