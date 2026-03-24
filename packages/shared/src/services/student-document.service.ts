import { db } from '../db/client';
import { encryptString, decryptString } from '../crypto';

export interface StudentDocument {
    id: string;
    university_id: string;
    owner_entity_type: string;
    owner_entity_id: string;
    document_type: string;
    file_url: string;
    file_name: string;
    file_status: string;
    is_encrypted: boolean;
    file_size_bytes: number;
    category: string;
    uploaded_by: string;
    uploaded_at: Date;
    metadata_json: any;
}

// Roles that can access student documents
const FULL_ACCESS_ROLES = ['ADMIN', 'PROGRAM_OPS'];
const READ_ACCESS_ROLES = ['UNIVERSITY_OPERATOR', 'COS', 'PM', 'PMA', 'CMA', 'CMA_MANAGER', 'BOA'];

export class StudentDocumentService {

    /**
     * Upload a document for a student profile.
     * Sensitive documents (Aadhaar, PAN, etc.) are encrypted at rest.
     */
    static async uploadDocument(params: {
        universityId: string;
        studentProfileId: string;
        documentType: string;
        fileName: string;
        fileContent: string; // base64
        fileSizeBytes: number;
        fileUrl: string;
        uploadedBy: string;
        ipAddress?: string;
        userAgent?: string;
    }): Promise<StudentDocument> {
        // Check if this document type is sensitive
        const typeRes = await db.query(
            'SELECT is_sensitive FROM student_document_types WHERE code = $1',
            [params.documentType]
        );
        const isSensitive = typeRes.rows[0]?.is_sensitive || false;

        // Encrypt content if sensitive
        let storedContent = params.fileContent;
        if (isSensitive && params.fileContent) {
            storedContent = encryptString(params.fileContent);
        }

        const result = await db.query(
            `INSERT INTO documents (
                university_id, owner_entity_type, owner_entity_id, document_type,
                file_url, file_name, file_status, is_encrypted, file_content,
                file_size_bytes, category, uploaded_by, uploaded_at, metadata_json
            ) VALUES ($1, 'STUDENT', $2, $3, $4, $5, 'ACTIVE', $6, $7, $8, $9, $10, NOW(), '{}'::jsonb)
            RETURNING *`,
            [
                params.universityId,
                params.studentProfileId,
                params.documentType,
                params.fileUrl,
                params.fileName,
                isSensitive,
                storedContent,
                params.fileSizeBytes,
                isSensitive ? 'SENSITIVE' : 'GENERAL',
                params.uploadedBy
            ]
        );

        // Log the upload
        await this.logAccess({
            documentId: result.rows[0].id,
            studentProfileId: params.studentProfileId,
            accessedBy: params.uploadedBy,
            accessType: 'UPLOAD',
            ipAddress: params.ipAddress,
            userAgent: params.userAgent
        });

        return result.rows[0];
    }

    /**
     * Get all documents for a student profile with access control.
     */
    static async getDocumentsForStudent(
        studentProfileId: string,
        accessorUserId: string,
        accessorRole: string,
        accessorUniversityId?: string
    ): Promise<StudentDocument[]> {
        // Verify access
        if (!this.canAccessDocuments(accessorRole)) {
            throw new Error('Insufficient permissions to view student documents');
        }

        // University scoping
        let query = `
            SELECT d.*, sdt.label as type_label, sdt.is_sensitive, sdt.is_required,
                   u.name as uploaded_by_name
            FROM documents d
            LEFT JOIN student_document_types sdt ON d.document_type = sdt.code
            LEFT JOIN users u ON d.uploaded_by = u.id
            WHERE d.owner_entity_type = 'STUDENT'
              AND d.owner_entity_id = $1
              AND d.file_status = 'ACTIVE'
            ORDER BY sdt.sort_order ASC, d.uploaded_at DESC`;

        const result = await db.query(query, [studentProfileId]);

        // Strip encrypted content from list view — only return metadata
        return result.rows.map((doc: any) => ({
            ...doc,
            file_content: undefined // Never send encrypted content in list
        }));
    }

    /**
     * Download/view a specific document with decryption and audit logging.
     */
    static async getDocumentFile(
        documentId: string,
        accessorUserId: string,
        accessorRole: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<{ content: string; fileName: string; isEncrypted: boolean }> {
        if (!this.canAccessDocuments(accessorRole)) {
            throw new Error('Insufficient permissions to access this document');
        }

        const result = await db.query(
            `SELECT d.*, sp.university_id as student_university_id
             FROM documents d
             LEFT JOIN student_profiles sp ON d.owner_entity_id = sp.id::text
             WHERE d.id = $1 AND d.file_status = 'ACTIVE'`,
            [documentId]
        );

        if (!result.rows[0]) throw new Error('Document not found');
        const doc = result.rows[0];

        // Log access
        await this.logAccess({
            documentId,
            studentProfileId: doc.owner_entity_id,
            accessedBy: accessorUserId,
            accessType: 'DOWNLOAD',
            ipAddress,
            userAgent
        });

        // Decrypt if needed
        let content = doc.file_content;
        if (doc.is_encrypted && content) {
            try {
                content = decryptString(content);
            } catch (e) {
                throw new Error('Failed to decrypt document — encryption key mismatch');
            }
        }

        return {
            content,
            fileName: doc.file_name,
            isEncrypted: doc.is_encrypted
        };
    }

    /**
     * Soft-delete a document.
     */
    static async deleteDocument(
        documentId: string,
        actorId: string,
        actorRole: string,
        ipAddress?: string,
        userAgent?: string
    ) {
        if (!FULL_ACCESS_ROLES.includes(actorRole)) {
            throw new Error('Only admins can delete student documents');
        }

        await db.query(
            `UPDATE documents SET file_status = 'DELETED', metadata_json = metadata_json || jsonb_build_object('deleted_by', $2, 'deleted_at', NOW()::text)
             WHERE id = $1`,
            [documentId, actorId]
        );

        await this.logAccess({
            documentId,
            accessedBy: actorId,
            accessType: 'DELETE',
            ipAddress,
            userAgent
        });
    }

    /**
     * Get document submission status for a list of students (for bulk tracking).
     */
    static async getDocumentCompletionStatus(universityId: string, studentProfileIds?: string[]) {
        let query = `
            SELECT
                sp.id as student_profile_id,
                sp.enrollment_number,
                COALESCE(u.name, 'Unknown') as student_name,
                COUNT(d.id) as uploaded_count,
                (SELECT COUNT(*) FROM student_document_types WHERE is_required = true) as required_count,
                COUNT(d.id) FILTER (WHERE sdt.is_required = true) as required_uploaded,
                COALESCE(
                    json_agg(DISTINCT d.document_type) FILTER (WHERE d.id IS NOT NULL),
                    '[]'::json
                ) as uploaded_types
            FROM student_profiles sp
            LEFT JOIN users u ON sp.user_id = u.id
            LEFT JOIN documents d ON d.owner_entity_type = 'STUDENT'
                AND d.owner_entity_id = sp.id::text
                AND d.file_status = 'ACTIVE'
            LEFT JOIN student_document_types sdt ON d.document_type = sdt.code
            WHERE sp.university_id = $1 AND sp.is_active = true`;

        const params: any[] = [universityId];
        if (studentProfileIds?.length) {
            query += ` AND sp.id = ANY($2)`;
            params.push(studentProfileIds);
        }

        query += ` GROUP BY sp.id, sp.enrollment_number, u.name ORDER BY sp.enrollment_number`;

        const result = await db.query(query, params);
        return result.rows;
    }

    /**
     * Get all available document types.
     */
    static async getDocumentTypes() {
        const result = await db.query(
            'SELECT * FROM student_document_types ORDER BY sort_order ASC'
        );
        return result.rows;
    }

    /**
     * Get access audit trail for a document.
     */
    static async getAccessLog(documentId: string) {
        const result = await db.query(
            `SELECT dal.*, u.name as accessor_name, u.email as accessor_email
             FROM document_access_logs dal
             JOIN users u ON dal.accessed_by = u.id
             WHERE dal.document_id = $1
             ORDER BY dal.created_at DESC
             LIMIT 100`,
            [documentId]
        );
        return result.rows;
    }

    // ─── Private helpers ───

    private static canAccessDocuments(role: string): boolean {
        return FULL_ACCESS_ROLES.includes(role) || READ_ACCESS_ROLES.includes(role);
    }

    private static async logAccess(params: {
        documentId: string;
        studentProfileId?: string;
        accessedBy: string;
        accessType: string;
        ipAddress?: string;
        userAgent?: string;
    }) {
        await db.query(
            `INSERT INTO document_access_logs (document_id, student_profile_id, accessed_by, access_type, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [params.documentId, params.studentProfileId || null, params.accessedBy, params.accessType, params.ipAddress || null, params.userAgent || null]
        );
    }
}
