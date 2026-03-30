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
    // Match by email first, then by name (transcript participants often have no email)
    function findParticipant(inv: any) {
        // 1. Exact email match
        if (inv.email) {
            const byEmail = participants.find(p => p.email?.toLowerCase() === inv.email.toLowerCase());
            if (byEmail) return byEmail;
        }
        // 2. Match participant name against invitee name
        if (inv.name) {
            const invName = inv.name.toLowerCase().trim();
            const byName = participants.find(p => p.name.toLowerCase().trim() === invName);
            if (byName) return byName;
        }
        // 3. Match participant name against email prefix (e.g. "john.doe" from "john.doe@company.com")
        if (inv.email) {
            const emailPrefix = inv.email.split('@')[0].toLowerCase().replace(/[._-]/g, ' ');
            const byPrefix = participants.find(p => {
                const pName = p.name.toLowerCase().replace(/[._-]/g, ' ');
                // Check if name contains email prefix or vice versa
                return pName.includes(emailPrefix) || emailPrefix.includes(pName) ||
                    // Also check first+last name match (e.g. "John Doe" matches "john.doe")
                    emailPrefix.split(' ').every((part: string) => pName.includes(part));
            });
            if (byPrefix) return byPrefix;
        }
        // 4. Partial name match — invitee display name contains participant name or vice versa
        if (inv.name) {
            const invName = inv.name.toLowerCase().trim();
            const byPartial = participants.find(p => {
                const pName = p.name.toLowerCase().trim();
                return (pName.length > 2 && invName.includes(pName)) ||
                       (invName.length > 2 && pName.includes(invName));
            });
            if (byPartial) return byPartial;
        }
        return null;
    }

    const matchedParticipantIds = new Set<string>();
    const attendance = invitees.map(inv => {
        const participant = findParticipant(inv);
        if (participant) matchedParticipantIds.add(participant.id);
        return {
            ...inv,
            attended: !!participant,
            participant
        };
    });

    // Uninvited participants: those not matched to any invitee
    const uninvitedParticipants = participants.filter(p => !matchedParticipantIds.has(p.id));

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
