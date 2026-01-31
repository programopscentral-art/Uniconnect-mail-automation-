import { json, error } from '@sveltejs/kit';
import { createUniversityAsset } from '@uniconnect/shared';

export const POST = async ({ request, locals }: { request: Request, locals: any }) => {
    if (!locals.user) throw error(401);

    const formData = await request.formData();
    const university_id = formData.get('university_id') as string;
    const name = formData.get('name') as string;
    const type = (formData.get('type') || 'image') as any;
    const file = formData.get('file') as File;

    if (!file || !university_id) throw error(400, 'File and university_id are required');

    // SECURITY: Ensure user belongs to the university or is admin
    if (locals.user.role !== 'ADMIN' && locals.user.university_id !== university_id) {
        throw error(403, 'Unauthorized to upload for this university');
    }

    // MOCK: In production, upload to S3/Supabase and get real URL
    // For this context, we'll use a data URL or a placeholder with the filename
    // Actually, let's use a placeholder but include the name to make it look real
    const mockUrl = `https://via.placeholder.com/300?text=${encodeURIComponent(name)}`;

    try {
        const asset = await createUniversityAsset({
            university_id,
            name,
            url: mockUrl,
            type,
            metadata: {
                size: file.size,
                mimeType: file.type,
                lastModified: file.lastModified
            }
        });

        return json({ success: true, asset });
    } catch (e: any) {
        console.error(e);
        throw error(500, e.message || 'Failed to save asset');
    }
};
