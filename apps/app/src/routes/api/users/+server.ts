import { getAllUsers, createUser, getAllUniversities } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
    const userRole = locals.user?.role as any;
    if (userRole !== 'ADMIN' && userRole !== 'PROGRAM_OPS' && userRole !== 'UNIVERSITY_OPERATOR') {
        throw error(403, 'Forbidden');
    }

    const universityId = (userRole === 'ADMIN' || userRole === 'PROGRAM_OPS') ? undefined : locals.user?.university_id;
    const users = await getAllUsers(universityId || undefined);
    return json(users);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    const userRole = locals.user?.role as any;
    const isGlobalAdmin = userRole === 'ADMIN' || userRole === 'PROGRAM_OPS';
    const isUnivAdmin = userRole === 'UNIVERSITY_OPERATOR';

    if (!isGlobalAdmin && !isUnivAdmin) {
        throw error(403, 'Forbidden');
    }

    const data = await request.json();
    if (!data.email || !data.role) {
        throw error(400, 'Email and Role are required');
    }

    const targetUniversityId = isGlobalAdmin ? data.university_id : locals.user?.university_id;

    if ((data.role === 'UNIVERSITY_OPERATOR' || !isGlobalAdmin) && !targetUniversityId) {
        throw error(400, 'University is required');
    }

    try {
        const { createUser } = await import('@uniconnect/shared');
        const user = await createUser({
            email: data.email,
            name: data.name || '',
            role: data.role,
            university_id: targetUniversityId || null
        });

        // Enqueue Invitation Email
        try {
            const { Queue } = await import('bullmq');
            const IORedis = (await import('ioredis')).default;
            const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
            const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
            const systemNotificationQueue = new Queue('system-notifications', { connection });

            const loginLink = `${process.env.PUBLIC_BASE_URL || 'http://localhost:3001'}/auth/login?email=${encodeURIComponent(data.email)}`;

            await systemNotificationQueue.add('send-notification', {
                to: data.email,
                subject: `Invitation to Join UniConnect`,
                text: `Hi ${data.name || 'there'},\n\nYou have been invited to join the UniConnect platform as a ${data.role}.\n\nYou can access your account here: ${loginLink}`,
                html: `
                    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e5e7eb; background: #f9fafb; border-radius: 12px; max-width: 600px;">
                        <img src="${process.env.PUBLIC_BASE_URL}/nxtwave-logo.png" alt="NxtWave" style="height: 40px; margin-bottom: 20px;">
                        <h2 style="color: #111827; margin-top: 0;">Welcome to UniConnect</h2>
                        <p style="color: #4b5563;">You have been invited to join the platform as a <strong>${data.role}</strong>.</p>
                        <div style="margin: 30px 0;">
                            <a href="${loginLink}" style="background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Access Your Account</a>
                        </div>
                        <p style="font-size: 12px; color: #9ca3af;">If you didn't expect this invitation, you can safely ignore this email.</p>
                    </div>
                `
            });
            await connection.quit();
        } catch (queueErr) {
            console.error('Failed to enqueue invitation email:', queueErr);
        }

        return json(user);
    } catch (err: any) {
        if (err.code === '23505') {
            throw error(409, 'User with this email already exists');
        }
        throw err;
    }
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
    const userRole = locals.user?.role as any;
    if (userRole !== 'ADMIN' && userRole !== 'PROGRAM_OPS' && userRole !== 'UNIVERSITY_OPERATOR') {
        throw error(403);
    }

    const data = await request.json();
    const { id, ...updates } = data;
    if (!id) throw error(400, 'User ID required');

    // TODO: Security check to ensure Univ Admin only updates users in their university

    const { updateUser } = await import('@uniconnect/shared');
    await updateUser(id, updates);
    return json({ success: true });
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    const userRole = locals.user?.role as any;
    if (userRole !== 'ADMIN' && userRole !== 'PROGRAM_OPS' && userRole !== 'UNIVERSITY_OPERATOR') {
        throw error(403);
    }
    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'User ID required');

    const { deleteUser } = await import('@uniconnect/shared');
    await deleteUser(id);
    return json({ success: true });
};
