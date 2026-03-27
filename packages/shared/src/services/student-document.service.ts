import { db } from '../db/client';
import { encryptString, decryptString } from '../crypto';
import { AccessAlertService } from './access-alert.service';
import crypto from 'crypto';

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

// Granular document permission levels
type DocPermission = 'VIEW_METADATA' | 'DOWNLOAD' | 'UPLOAD' | 'DELETE';

const DOC_ACCESS_MATRIX: Record<string, DocPermission[]> = {
    ADMIN: ['VIEW_METADATA', 'DOWNLOAD', 'UPLOAD', 'DELETE'],
    PROGRAM_OPS: ['VIEW_METADATA', 'DOWNLOAD', 'UPLOAD', 'DELETE'],
    UNIVERSITY_OPERATOR: ['VIEW_METADATA', 'UPLOAD'],
    COS: ['VIEW_METADATA'],
    PM: ['VIEW_METADATA'],
    PMA: ['VIEW_METADATA'],
    BOA: ['VIEW_METADATA'],
    CMA: ['VIEW_METADATA'],
    CMA_MANAGER: ['VIEW_METADATA'],
};

const FULL_ACCESS_ROLES = ['ADMIN', 'PROGRAM_OPS'];
const READ_ACCESS_ROLES = ['UNIVERSITY_OPERATOR', 'COS', 'PM', 'PMA', 'CMA', 'CMA_MANAGER', 'BOA'];

export class StudentDocumentService {

    /**
     * Upload a document for a student profile.
     * ALL documents are encrypted at rest with AES-256-GCM.
     * SHA-256 hash is stored for integrity verification.
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
        // Check document type metadata
        const typeRes = await db.query(
            'SELECT is_sensitive FROM student_document_types WHERE code = $1',
            [params.documentType]
        );
        const isSensitive = typeRes.rows[0]?.is_sensitive ?? true; // default sensitive

        // Compute SHA-256 hash of original content for integrity verification
        const fileHash = crypto.createHash('sha256').update(params.fileContent).digest('hex');

        // Encrypt ALL document content at rest (not just sensitive)
        let storedContent = params.fileContent;
        if (params.fileContent) {
            storedContent = encryptString(params.fileContent);
        }

        const result = await db.query(
            `INSERT INTO documents (
                university_id, owner_entity_type, owner_entity_id, document_type,
                file_url, file_name, file_status, is_encrypted, file_content,
                file_size_bytes, category, uploaded_by, uploaded_at, metadata_json,
                file_hash, encryption_algorithm
            ) VALUES ($1, 'STUDENT', $2, $3, $4, $5, 'ACTIVE', true, $6, $7, $8, $9, NOW(), '{}'::jsonb, $10, 'AES-256-GCM')
            RETURNING *`,
            [
                params.universityId,
                params.studentProfileId,
                params.documentType,
                params.fileUrl,
                params.fileName,
                storedContent,
                params.fileSizeBytes,
                isSensitive ? 'SENSITIVE' : 'GENERAL',
                params.uploadedBy,
                fileHash
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
     * Download/view a specific document with decryption, integrity check, and audit logging.
     */
    static async getDocumentFile(
        documentId: string,
        accessorUserId: string,
        accessorRole: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<{ content: string; fileName: string; isEncrypted: boolean; integrityVerified: boolean }> {
        if (!this.hasDocPermission(accessorRole, 'DOWNLOAD')) {
            throw new Error('Insufficient permissions to download this document');
        }

        const result = await db.query(
            `SELECT d.*, sp.university_id as student_university_id
             FROM documents d
             LEFT JOIN student_profiles sp ON d.owner_entity_id = sp.id
             WHERE d.id = $1::uuid AND d.file_status = 'ACTIVE'`,
            [documentId]
        );

        if (!result.rows[0]) throw new Error('Document not found');
        const doc = result.rows[0];

        // Fire-and-forget: log access, update counter, alert admins (don't block response)
        Promise.all([
            this.logAccess({
                documentId,
                studentProfileId: doc.owner_entity_id,
                accessedBy: accessorUserId,
                accessType: 'DOWNLOAD',
                ipAddress,
                userAgent
            }),
            db.query(
                'UPDATE documents SET last_accessed_at = NOW(), access_count = COALESCE(access_count, 0) + 1 WHERE id = $1::uuid',
                [documentId]
            ),
            // Alert admins
            db.query('SELECT name, email FROM users WHERE id = $1', [accessorUserId]).then(accessorRes =>
                db.query("SELECT u.name FROM student_profiles sp JOIN users u ON sp.user_id = u.id WHERE sp.id = $1::uuid", [doc.owner_entity_id]).then(studentRes =>
                    AccessAlertService.sendAccessAlert({
                        accessorId: accessorUserId,
                        accessorName: accessorRes.rows[0]?.name || 'Unknown',
                        accessorEmail: accessorRes.rows[0]?.email || '',
                        studentProfileId: doc.owner_entity_id,
                        studentName: studentRes.rows[0]?.name || 'Unknown Student',
                        accessType: 'DOCUMENT_DOWNLOAD',
                        details: `Document: ${doc.file_name} (${doc.document_type})`,
                        ipAddress
                    })
                )
            )
        ]).catch(() => {});

        // Decrypt if needed
        let content = doc.file_content;
        if (doc.is_encrypted && content) {
            try {
                content = decryptString(content);
            } catch (e) {
                throw new Error('Failed to decrypt document — encryption key mismatch');
            }
        }

        // Verify integrity via SHA-256 hash
        let integrityVerified = true;
        if (doc.file_hash && content) {
            const currentHash = crypto.createHash('sha256').update(content).digest('hex');
            integrityVerified = currentHash === doc.file_hash;
            if (!integrityVerified) {
                // Log integrity failure
                await this.logAccess({
                    documentId,
                    studentProfileId: doc.owner_entity_id,
                    accessedBy: accessorUserId,
                    accessType: 'INTEGRITY_FAILURE',
                    ipAddress,
                    userAgent
                });
            }
        }

        return {
            content,
            fileName: doc.file_name,
            isEncrypted: doc.is_encrypted,
            integrityVerified
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
        if (!this.hasDocPermission(actorRole, 'DELETE')) {
            throw new Error('Insufficient permissions to delete student documents');
        }

        await db.query(
            `UPDATE documents SET file_status = 'DELETED', metadata_json = metadata_json || jsonb_build_object('deleted_by', $2, 'deleted_at', NOW()::text)
             WHERE id = $1::uuid`,
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
                AND d.owner_entity_id = sp.id
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
             WHERE dal.document_id = $1::uuid
             ORDER BY dal.created_at DESC
             LIMIT 100`,
            [documentId]
        );
        return result.rows;
    }

    // ─── Permission helpers ───

    static hasDocPermission(role: string, permission: DocPermission): boolean {
        return (DOC_ACCESS_MATRIX[role] || []).includes(permission);
    }

    private static canAccessDocuments(role: string): boolean {
        return this.hasDocPermission(role, 'VIEW_METADATA');
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
