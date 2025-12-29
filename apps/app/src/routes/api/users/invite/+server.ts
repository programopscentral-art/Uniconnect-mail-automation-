import { json, error } from '@sveltejs/kit';
import { createInvitation, getUserByEmail } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { addNotificationJob } from '$lib/server/queue';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    // Permission check: Only admins or university operators can invite
    const userRole = locals.user.role as string;
    const isGlobalAdmin = userRole === 'ADMIN' || userRole === 'PROGRAM_OPS';
    const isUnivAdmin = userRole === 'UNIVERSITY_OPERATOR';

    if (!isGlobalAdmin && !isUnivAdmin) {
        throw error(403, 'Permission denied');
    }

    const { email, role, university_id } = await request.json();

    if (!email || !role) {
        throw error(400, 'Email and role are required');
    }

    // Check if user already exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
        throw error(400, 'User already exists with this email');
    }

    // Role-based university restriction
    const targetUnivId = isGlobalAdmin ? university_id : locals.user.university_id;

    try {
        const invite = await createInvitation({
            email,
            role,
            university_id: targetUnivId,
            invited_by: locals.user.id
        });

        // Send Email
        const baseUrl = env.PUBLIC_BASE_URL || 'http://localhost:3001';
        const inviteUrl = `${baseUrl}/accept-invite?token=${invite.token}`;

        await addNotificationJob({
            to: email,
            subject: 'Invitation to join UniConnect',
            text: `Hi,\n\nYou have been invited to join UniConnect as a ${role}.\n\nPlease click the link below to accept the invitation and set up your account:\n\n${inviteUrl}\n\nThis link will expire in 7 days.`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; rounded-lg;">
                    <h2 style="color: #2563eb;">Welcome to UniConnect</h2>
                    <p>You have been invited to join the platform as a <strong>${role}</strong>.</p>
                    <div style="margin: 30px 0;">
                        <a href="${inviteUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept Invitation</a>
                    </div>
                    <p style="color: #6b7280; font-size: 14px;">This link will expire in 7 days. If you did not expect this invitation, you can safely ignore this email.</p>
                </div>
            `
        });

        return json({ success: true, invite });
    } catch (err: any) {
        console.error('Invite error:', err);
        throw error(500, 'Failed to send invitation');
    }
};
