import { supabase } from '@shared/api/supabaseClient';
import { z } from 'zod';
import { docMime, fileExt, type DocType } from './documentTypes';

/**
 * --- DOCUMENTS SERVICE ---
 * A member's documents: the row in `member_documents` + the file in the private
 * `member-documents` bucket at <org>/<member>/<document id>.<ext>. RLS and the
 * Storage policies decide who may read / add / delete (see migration
 * 20261125160000); downloads use short-lived signed URLs.
 */

export const DOCUMENTS_BUCKET = 'member-documents';

export const MemberDocumentSchema = z.object({
    id: z.string(),
    organization_id: z.string(),
    user_id: z.string(),
    doc_type: z.string(),
    name: z.string(),
    file_path: z.string(),
    mime_type: z.string().nullable().optional(),
    size_bytes: z.number().nullable().optional(),
    valid_until: z.string().nullable().optional(),
    uploaded_by: z.string().nullable().optional(),
    created_at: z.string(),
});
export type MemberDocument = z.infer<typeof MemberDocumentSchema>;

export interface UploadInput {
    userId: string;
    organizationId: string;
    file: File;
    docType: DocType;
    name: string;
    validUntil: string | null;
}

export const documentsService = {
    async list(userId: string): Promise<MemberDocument[]> {
        const { data, error } = await supabase
            .from('member_documents')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return z.array(MemberDocumentSchema).parse(data ?? []);
    },

    /** File first, then the row; a failed row takes the file back. */
    async upload(input: UploadInput): Promise<MemberDocument> {
        const id = crypto.randomUUID();
        const ext = fileExt(input.file.name) || 'bin';
        const path = `${input.organizationId}/${input.userId}/${id}.${ext}`;
        const contentType = docMime(input.file);
        const up = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, input.file, { contentType, upsert: false });
        if (up.error) throw up.error;
        const { data, error } = await supabase
            .from('member_documents')
            .insert({
                id,
                user_id: input.userId,
                organization_id: input.organizationId,
                doc_type: input.docType,
                name: input.name.trim() || input.file.name,
                file_path: path,
                mime_type: contentType || null,
                size_bytes: input.file.size,
                valid_until: input.validUntil,
            })
            .select('*')
            .single();
        if (error) {
            await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
            throw error;
        }
        return MemberDocumentSchema.parse(data);
    },

    /** The file, then the row (the file's delete rule needs the folder, not the row). */
    async remove(doc: Pick<MemberDocument, 'id' | 'file_path'>): Promise<void> {
        const rm = await supabase.storage.from(DOCUMENTS_BUCKET).remove([doc.file_path]);
        if (rm.error) throw rm.error;
        const { error } = await supabase.from('member_documents').delete().eq('id', doc.id);
        if (error) throw error;
    },

    /** A one-minute link to the file. */
    async signedUrl(path: string, download?: string): Promise<string> {
        const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, 60, download ? { download } : undefined);
        if (error || !data) throw error ?? new Error('No URL');
        return data.signedUrl;
    },
};
