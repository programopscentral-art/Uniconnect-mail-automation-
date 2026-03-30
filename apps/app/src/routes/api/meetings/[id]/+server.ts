import { getMeetingById, getMeetingInvitees, getMeetingParticipants, deleteMeeting } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

// GET: Full meeting detail with invitees and participants
export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    const meeting = await getMeetingById(params.id);
    if (!meeting) throw error(404, 'Meeting not found');

    const [invitees, participants] = await Promise.all([
        getMeetingInvitees(params.id),
        getMeetingParticipants(params.id)
    ]);

    // Calculate attendance: who was invited but didn't join
    const participantEmails = new Set(participants.map(p => p.email?.toLowerCase()).filter(Boolean));
    const attendance = invitees.map(inv => ({
        ...inv,
        attended: participantEmails.has(inv.email.toLowerCase()),
        participant: participants.find(p => p.email?.toLowerCase() === inv.email.toLowerCase()) || null
    }));

    return json({
        meeting,
        invitees,
        participants,
        attendance,
        summary: {
            invited: invitees.length,
            attended: attendance.filter(a => a.attended).length,
            absent: attendance.filter(a => !a.attended && !a.is_organizer).length,
            accepted_but_absent: attendance.filter(a => !a.attended && a.response_status === 'accepted').length,
            attendance_rate: invitees.length > 0
                ? Math.round((attendance.filter(a => a.attended).length / invitees.length) * 100)
                : 0
        }
    });
};

// DELETE: Remove a meeting
export const DELETE: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    if (locals.user.role !== 'ADMIN' && locals.user.role !== 'PROGRAM_OPS') {
        throw error(403, 'Insufficient permissions');
    }

    await deleteMeeting(params.id);
    return json({ success: true });
};
