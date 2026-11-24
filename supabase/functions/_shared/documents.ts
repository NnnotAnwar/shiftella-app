// =============================================================================
// SHARED: a member's files in the private `member-documents` bucket (GDPR)
// -----------------------------------------------------------------------------
// member_documents rows cascade with the profile, but Storage can't be emptied
// from SQL — whoever deletes a person removes their files here. Collect the
// paths BEFORE deleting the user (the rows are gone afterwards), remove them
// AFTER the delete succeeded.
// =============================================================================

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const DOCUMENTS_BUCKET = 'member-documents';

/** Every stored file of a member: the table's paths + anything left in their folder. */
export async function memberDocumentPaths(admin: SupabaseClient, userId: string, orgId: string | null): Promise<string[]> {
    const paths = new Set<string>();
    const { data: rows } = await admin.from('member_documents').select('file_path').eq('user_id', userId);
    for (const r of (rows ?? []) as { file_path: string }[]) if (r.file_path) paths.add(r.file_path);
    if (orgId) {
        // Uploads whose row never got written (a failed save) live there too.
        const folder = `${orgId}/${userId}`;
        const { data: files } = await admin.storage.from(DOCUMENTS_BUCKET).list(folder, { limit: 1000 });
        for (const f of (files ?? []) as { name: string }[]) if (f.name) paths.add(`${folder}/${f.name}`);
    }
    return [...paths];
}

/** Remove files (best effort, in chunks). Returns how many were asked to go. */
export async function removeDocumentFiles(admin: SupabaseClient, paths: string[]): Promise<number> {
    for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100);
        const { error } = await admin.storage.from(DOCUMENTS_BUCKET).remove(chunk);
        if (error) console.error('[documents] remove failed', error.message);
    }
    return paths.length;
}
