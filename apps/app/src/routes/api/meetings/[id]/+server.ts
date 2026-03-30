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

    // Build attendance: cross-reference invitees with participants
    const participantEmails = new Set(participants.map(p => p.email?.toLowerCase()).filter(Boolean));
    const inviteeEmails = new Set(invitees.map(i => i.email.toLowerCase()));

    const attendance = invitees.map(inv => ({
        ...inv,
        attended: participantEmails.has(inv.email.toLowerCase()),
        participant: participants.find(p => p.email?.toLowerCase() === inv.email.toLowerCase()) || null
    }));

    // Uninvited participants: people who joined but weren't on the invite list
    const uninvitedParticipants = participants.filter(p =>
        !p.email || !inviteeEmails.has(p.email.toLowerCase())
    );

    const attendedCount = attendance.filter(a => a.attended).length + uninvitedParticipants.length;
    const totalParticipants = attendedCount;

    return json({
        meeting,
        invitees,
        participants,
        attendance,
        uninvitedParticipants,
        summary: {
            invited: invitees.length,
            attended: attendance.filter(a => a.attended).length,
            total_joined: totalParticipants,
            absent: attendance.filter(a => !a.attended && !a.is_organizer).length,
            accepted_but_absent: attendance.filter(a => !a.attended && a.response_status === 'accepted').length,
            uninvited_joined: uninvitedParticipants.length,
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
