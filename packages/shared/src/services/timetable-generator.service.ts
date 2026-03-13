import { db } from '../db/client';
import type { TimetableSessionInput, ConflictRecord } from './scheduling.service';
import { SchedulingService } from './scheduling.service';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GenerationRequest {
    university_id: string;
    program_id?: string;
    term_id?: string;
    apd_plan_id?: string;
    week_start: string;  // YYYY-MM-DD (Monday)
    week_end: string;    // YYYY-MM-DD (Sunday)
    section_ids?: string[];  // generate for specific sections, or all if omitted
}

export interface GeneratedSession {
    session_date: string;
    slot_start: string;
    slot_end: string;
    section_id: string;
    section_name: string;
    subject_id: string;
    subject_code: string;
    subject_name: string;
    faculty_profile_id: string | null;
    faculty_name: string | null;
    assignment_source: 'auto-assigned' | 'unassigned';
    assignment_reason: string;
    delivery_mode: string;
    is_lab: boolean;
}

export interface GenerationResult {
    sessions: GeneratedSession[];
    unassigned: GeneratedSession[];
    conflicts: ConflictRecord[];
    warnings: string[];
    stats: {
        totalGenerated: number;
        totalAssigned: number;
        totalUnassigned: number;
        subjectSlotCounts: Record<string, { required: number; generated: number }>;
    };
}

interface SubjectSlotReq {
    subject_id: string;
    subject_code: string;
    subject_name: string;
    slots_per_week: number;
    lab_slots_per_week: number;
    priority: number;
}

interface FacultyCandidate {
    faculty_profile_id: string;
    faculty_name: string;
    priority_level: number;
    can_substitute: boolean;
    preferred_section_id: string | null;
}

interface SlotDef {
    start_time: string;
    end_time: string;
    slot_type: string;
}

// ─── Timetable Generation Engine ─────────────────────────────────────────────

export class TimetableGeneratorService {

    /**
     * Generate a weekly timetable based on APD constraints, faculty mappings, and availability.
     */
    static async generateWeeklyTimetable(req: GenerationRequest): Promise<GenerationResult> {
        const result: GenerationResult = {
            sessions: [],
            unassigned: [],
            conflicts: [],
            warnings: [],
            stats: { totalGenerated: 0, totalAssigned: 0, totalUnassigned: 0, subjectSlotCounts: {} }
        };

        // 1. Load university slot structure
        const slots = await this.loadSlots(req.university_id);
        if (slots.length === 0) {
            result.warnings.push('No university time slots defined. Define slots first.');
            return result;
        }
        const lectureSlots = slots.filter(s => s.slot_type !== 'BREAK');

        // 2. Load working days for this week
        const workingDays = await this.getWorkingDays(req);
        if (workingDays.length === 0) {
            result.warnings.push('No working days in this week range.');
            return result;
        }

        // 3. Load sections
        const sections = await this.loadSections(req);
        if (sections.length === 0) {
            result.warnings.push('No sections found for this program/term.');
            return result;
        }

        // 4. Load subject slot requirements (from APD or subjects table)
        const subjectReqs = await this.loadSubjectRequirements(req);
        if (subjectReqs.length === 0) {
            result.warnings.push('No subject slot requirements found. Create an APD plan or add subjects with session counts.');
            return result;
        }

        // 5. Load faculty-subject mappings
        const facultyMap = await this.loadFacultyMappings(req.university_id);

        // 6. Load existing sessions for this week (to avoid conflicts)
        const existingSessions = await this.loadExistingSessions(req);

        // 7. Load faculty leave requests for this week
        const leaveMap = await this.loadFacultyLeaves(req);

        // 8. Load faculty availability patterns
        const availabilityMap = await this.loadFacultyAvailability(req.university_id);

        // 9. Load constraints (max load, etc.)
        const maxWeeklyLoad = await this.getMaxWeeklyLoad(req.university_id);

        // Track faculty load for the week
        const facultyWeeklyLoad = new Map<string, number>();
        // Pre-populate with existing sessions
        for (const es of existingSessions) {
            if (es.faculty_profile_id) {
                facultyWeeklyLoad.set(es.faculty_profile_id,
                    (facultyWeeklyLoad.get(es.faculty_profile_id) || 0) + 1);
            }
        }

        // Track occupied slots: key = `${date}_${sectionId}_${slotStart}`
        const occupiedSlots = new Set<string>();
        const facultyOccupied = new Set<string>(); // `${date}_${facultyId}_${slotStart}`
        for (const es of existingSessions) {
            occupiedSlots.add(`${es.session_date}_${es.section_id}_${es.slot_start}`);
            if (es.faculty_profile_id) {
                facultyOccupied.add(`${es.session_date}_${es.faculty_profile_id}_${es.slot_start}`);
            }
        }

        // 10. Generate sessions: for each section, distribute subjects across the week
        for (const section of sections) {
            const sectionSlotCounts: Record<string, number> = {};

            // Create a pool of (day, slot) pairs to fill
            const availableSlots: { date: string; dayOfWeek: number; slot: SlotDef }[] = [];
            for (const day of workingDays) {
                for (const slot of lectureSlots) {
                    const key = `${day.date}_${section.id}_${slot.start_time}`;
                    if (!occupiedSlots.has(key)) {
                        availableSlots.push({ date: day.date, dayOfWeek: day.dayOfWeek, slot });
                    }
                }
            }

            // Sort subjects by priority (lower = higher priority)
            const sortedReqs = [...subjectReqs].sort((a, b) => a.priority - b.priority);

            // Distribute subjects across available slots
            let slotIdx = 0;
            for (const subReq of sortedReqs) {
                const weeklyTarget = subReq.slots_per_week + subReq.lab_slots_per_week;
                sectionSlotCounts[subReq.subject_code] = 0;

                for (let assigned = 0; assigned < weeklyTarget && slotIdx < availableSlots.length; assigned++) {
                    const { date, dayOfWeek, slot } = availableSlots[slotIdx];
                    slotIdx++;

                    const isLab = assigned >= subReq.slots_per_week; // lab slots come after lecture slots

                    // Find best faculty
                    const candidates = facultyMap.get(subReq.subject_id) || [];
                    const { facultyId, facultyName, reason } = this.pickFaculty(
                        candidates, section.id, date, slot.start_time,
                        dayOfWeek, facultyOccupied, facultyWeeklyLoad,
                        maxWeeklyLoad, leaveMap, availabilityMap
                    );

                    const session: GeneratedSession = {
                        session_date: date,
                        slot_start: slot.start_time,
                        slot_end: slot.end_time,
                        section_id: section.id,
                        section_name: section.name,
                        subject_id: subReq.subject_id,
                        subject_code: subReq.subject_code,
                        subject_name: subReq.subject_name,
                        faculty_profile_id: facultyId,
                        faculty_name: facultyName,
                        assignment_source: facultyId ? 'auto-assigned' : 'unassigned',
                        assignment_reason: reason,
                        delivery_mode: 'PHYSICAL',
                        is_lab: isLab
                    };

                    if (facultyId) {
                        // Mark faculty as occupied
                        facultyOccupied.add(`${date}_${facultyId}_${slot.start_time}`);
                        facultyWeeklyLoad.set(facultyId, (facultyWeeklyLoad.get(facultyId) || 0) + 1);
                        result.stats.totalAssigned++;
                        result.sessions.push(session);
                    } else {
                        result.stats.totalUnassigned++;
                        result.unassigned.push(session);
                        result.sessions.push(session); // still include in full list
                    }

                    sectionSlotCounts[subReq.subject_code]++;
                    result.stats.totalGenerated++;
                }

                // Track subject slot stats
                if (!result.stats.subjectSlotCounts[subReq.subject_code]) {
                    result.stats.subjectSlotCounts[subReq.subject_code] = { required: 0, generated: 0 };
                }
                result.stats.subjectSlotCounts[subReq.subject_code].required += weeklyTarget * sections.length;
                result.stats.subjectSlotCounts[subReq.subject_code].generated += sectionSlotCounts[subReq.subject_code] || 0;
            }
        }

        // Check for under-allocation warnings
        for (const [code, counts] of Object.entries(result.stats.subjectSlotCounts)) {
            if (counts.generated < counts.required) {
                result.warnings.push(`${code}: generated ${counts.generated}/${counts.required} slots (under-allocated)`);
            }
        }

        return result;
    }

    /**
     * Save generated sessions as a draft timetable version.
     */
    static async saveGeneratedDraft(
        req: GenerationRequest,
        sessions: GeneratedSession[],
        createdBy?: string
    ) {
        // Create version
        const version = await SchedulingService.createVersion({
            university_id: req.university_id,
            program_id: req.program_id,
            term_id: req.term_id,
            source_type: 'GENERATED',
            notes: `Generated for week ${req.week_start} to ${req.week_end}`
        });

        // Convert to TimetableSessionInput and bulk create
        const inputs: TimetableSessionInput[] = sessions
            .filter(s => s.subject_id && s.section_id)
            .map(s => ({
                university_id: req.university_id,
                program_id: req.program_id || '',
                term_id: req.term_id || '',
                section_id: s.section_id,
                subject_id: s.subject_id,
                faculty_profile_id: s.faculty_profile_id,
                classroom_id: null,
                session_date: s.session_date,
                slot_start: s.slot_start,
                slot_end: s.slot_end,
                delivery_mode: s.delivery_mode,
                planned_topic: undefined
            }));

        const created = await SchedulingService.bulkCreateSessions(version.id, inputs);

        // Create/update timetable week
        try {
            await db.query(`
                INSERT INTO timetable_weeks (university_id, timetable_version_id, apd_plan_id, week_start, week_end, week_number, generation_source)
                VALUES ($1, $2, $3, $4, $5, 1, 'GENERATED')
                ON CONFLICT (university_id, week_start, week_end) DO UPDATE SET
                    timetable_version_id = $2, generation_source = 'GENERATED', updated_at = NOW()
            `, [req.university_id, version.id, req.apd_plan_id || null, req.week_start, req.week_end]);
        } catch {}

        return { version, sessionsCreated: created.length };
    }

    // ─── Faculty Auto-Allocation ──────────────────────────────────────────

    private static pickFaculty(
        candidates: FacultyCandidate[],
        sectionId: string,
        date: string,
        slotStart: string,
        dayOfWeek: number,
        facultyOccupied: Set<string>,
        facultyWeeklyLoad: Map<string, number>,
        maxWeeklyLoad: number,
        leaveMap: Map<string, Set<string>>,
        availabilityMap: Map<string, { day: number; start: string; end: string; type: string }[]>
    ): { facultyId: string | null; facultyName: string | null; reason: string } {

        if (candidates.length === 0) {
            return { facultyId: null, facultyName: null, reason: 'No faculty mapped to this subject' };
        }

        // Sort: prefer primary (lower priority_level), then section-preferred, then substitutes
        const sorted = [...candidates].sort((a, b) => {
            // Prefer faculty with matching preferred_section_id
            const aPref = a.preferred_section_id === sectionId ? 0 : 1;
            const bPref = b.preferred_section_id === sectionId ? 0 : 1;
            if (aPref !== bPref) return aPref - bPref;
            // Then by priority level
            if (a.priority_level !== b.priority_level) return a.priority_level - b.priority_level;
            // Non-substitutes first
            if (a.can_substitute !== b.can_substitute) return a.can_substitute ? 1 : -1;
            return 0;
        });

        for (const candidate of sorted) {
            const fid = candidate.faculty_profile_id;

            // Check 1: Not on leave this date
            if (leaveMap.has(fid) && leaveMap.get(fid)!.has(date)) {
                continue;
            }

            // Check 2: Not already occupied in this slot
            if (facultyOccupied.has(`${date}_${fid}_${slotStart}`)) {
                continue;
            }

            // Check 3: Weekly load within limit
            const currentLoad = facultyWeeklyLoad.get(fid) || 0;
            if (currentLoad >= maxWeeklyLoad) {
                continue;
            }

            // Check 4: Availability (if defined). If no availability defined, assume available.
            const availability = availabilityMap.get(fid);
            if (availability && availability.length > 0) {
                const dayAvail = availability.filter(a => a.day === dayOfWeek);
                if (dayAvail.length > 0) {
                    const isAvailable = dayAvail.some(a =>
                        a.type === 'AVAILABLE' && slotStart >= a.start && slotStart < a.end
                    );
                    const isBusy = dayAvail.some(a =>
                        a.type === 'BUSY' && slotStart >= a.start && slotStart < a.end
                    );
                    if (isBusy || (!isAvailable && dayAvail.some(a => a.type === 'AVAILABLE'))) {
                        continue;
                    }
                }
            }

            return {
                facultyId: fid,
                facultyName: candidate.faculty_name,
                reason: candidate.can_substitute ? 'Substitute faculty assigned' : 'Primary faculty assigned'
            };
        }

        // No faculty available — return reason
        const reasons: string[] = [];
        for (const c of sorted.slice(0, 3)) {
            const fid = c.faculty_profile_id;
            if (leaveMap.has(fid) && leaveMap.get(fid)!.has(date)) reasons.push(`${c.faculty_name}: on leave`);
            else if (facultyOccupied.has(`${date}_${fid}_${slotStart}`)) reasons.push(`${c.faculty_name}: slot occupied`);
            else if ((facultyWeeklyLoad.get(fid) || 0) >= maxWeeklyLoad) reasons.push(`${c.faculty_name}: weekly load exceeded`);
            else reasons.push(`${c.faculty_name}: not available`);
        }

        return {
            facultyId: null,
            facultyName: null,
            reason: reasons.length > 0 ? reasons.join('; ') : 'No eligible faculty found'
        };
    }

    // ─── Data Loaders ─────────────────────────────────────────────────────

    private static async loadSlots(universityId: string): Promise<SlotDef[]> {
        const res = await db.query(
            `SELECT start_time::text, end_time::text, slot_type FROM university_slots
             WHERE university_id = $1 AND is_active = true ORDER BY start_time`,
            [universityId]
        );
        return res.rows;
    }

    private static async getWorkingDays(req: GenerationRequest): Promise<{ date: string; dayOfWeek: number }[]> {
        const days: { date: string; dayOfWeek: number }[] = [];
        const start = new Date(req.week_start);
        const end = new Date(req.week_end);

        // Load APD plan for Saturday rules and holidays
        let saturdaysOff = 'ALL';
        let holidays = new Set<string>();

        if (req.apd_plan_id) {
            try {
                const planRes = await db.query(
                    `SELECT saturdays_off, public_holidays FROM apd_university_plans WHERE id = $1`,
                    [req.apd_plan_id]
                );
                if (planRes.rows[0]) {
                    saturdaysOff = planRes.rows[0].saturdays_off || 'ALL';
                    const hols = planRes.rows[0].public_holidays || [];
                    for (const h of (Array.isArray(hols) ? hols : [])) {
                        if (h.date) holidays.add(h.date);
                    }
                }
            } catch {}
        }

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dayOfWeek = d.getDay(); // 0=Sun
            const dateStr = d.toISOString().split('T')[0];

            // Skip Sunday
            if (dayOfWeek === 0) continue;

            // Skip Saturday based on rules
            if (dayOfWeek === 6) {
                if (saturdaysOff === 'ALL') continue;
                if (saturdaysOff === 'NONE') { /* working */ }
                // ALTERNATE/CUSTOM would need more logic
                else continue;
            }

            // Skip holidays
            if (holidays.has(dateStr)) continue;

            days.push({ date: dateStr, dayOfWeek });
        }

        return days;
    }

    private static async loadSections(req: GenerationRequest): Promise<{ id: string; name: string; batch_code: string }[]> {
        let query = `SELECT id, name, batch_code FROM sections WHERE university_id = $1 AND status = 'ACTIVE'`;
        const params: any[] = [req.university_id];

        if (req.term_id) {
            query += ` AND term_id = $2`;
            params.push(req.term_id);
        }
        if (req.section_ids && req.section_ids.length > 0) {
            query += ` AND id = ANY($${params.length + 1})`;
            params.push(req.section_ids);
        }
        query += ` ORDER BY batch_code, name`;

        const res = await db.query(query, params);
        return res.rows;
    }

    private static async loadSubjectRequirements(req: GenerationRequest): Promise<SubjectSlotReq[]> {
        // Prefer APD subject requirements if apd_plan_id is provided
        if (req.apd_plan_id) {
            const res = await db.query(
                `SELECT sr.subject_id, sr.subject_code, sr.subject_name,
                        sr.slots_per_week, sr.lab_slots_per_week, sr.priority
                 FROM apd_subject_slot_requirements sr
                 WHERE sr.apd_plan_id = $1 AND sr.subject_id IS NOT NULL
                 ORDER BY sr.priority, sr.subject_code`,
                [req.apd_plan_id]
            );
            if (res.rows.length > 0) return res.rows;
        }

        // Fallback: derive from subjects table (estimate slots_per_week from total_sessions_required)
        let query = `SELECT s.id as subject_id, s.code as subject_code, s.name as subject_name,
                            COALESCE(CEIL(s.total_sessions_required::float / 16), 3) as slots_per_week,
                            0 as lab_slots_per_week, 1 as priority
                     FROM subjects s
                     WHERE s.university_id = $1 AND s.is_active = true`;
        const params: any[] = [req.university_id];
        if (req.term_id) {
            query += ` AND s.term_id = $2`;
            params.push(req.term_id);
        }
        query += ` ORDER BY s.code`;

        const res = await db.query(query, params);
        return res.rows.map(r => ({
            ...r,
            slots_per_week: parseInt(r.slots_per_week) || 3,
            lab_slots_per_week: parseInt(r.lab_slots_per_week) || 0
        }));
    }

    private static async loadFacultyMappings(universityId: string): Promise<Map<string, FacultyCandidate[]>> {
        const res = await db.query(
            `SELECT fsm.subject_id, fsm.faculty_profile_id, fsm.priority_level,
                    fsm.can_substitute, fsm.preferred_section_id,
                    COALESCE(u.name, fp.employee_code) as faculty_name
             FROM faculty_subject_mappings fsm
             JOIN faculty_profiles fp ON fsm.faculty_profile_id = fp.id
             LEFT JOIN users u ON fp.user_id = u.id
             WHERE fp.university_id = $1 AND fp.employment_status = 'ACTIVE'
             ORDER BY fsm.priority_level`,
            [universityId]
        );

        const map = new Map<string, FacultyCandidate[]>();
        for (const row of res.rows) {
            if (!map.has(row.subject_id)) map.set(row.subject_id, []);
            map.get(row.subject_id)!.push({
                faculty_profile_id: row.faculty_profile_id,
                faculty_name: row.faculty_name,
                priority_level: row.priority_level || 1,
                can_substitute: row.can_substitute || false,
                preferred_section_id: row.preferred_section_id
            });
        }
        return map;
    }

    private static async loadExistingSessions(req: GenerationRequest): Promise<any[]> {
        const res = await db.query(
            `SELECT section_id, faculty_profile_id, session_date::text, slot_start::text, slot_end::text
             FROM timetable_sessions
             WHERE university_id = $1 AND session_date >= $2 AND session_date <= $3
               AND session_status NOT IN ('CANCELLED')`,
            [req.university_id, req.week_start, req.week_end]
        );
        return res.rows;
    }

    private static async loadFacultyLeaves(req: GenerationRequest): Promise<Map<string, Set<string>>> {
        const res = await db.query(
            `SELECT flr.faculty_profile_id, flr.leave_date::text, flr.leave_end_date::text
             FROM faculty_leave_requests flr
             JOIN faculty_profiles fp ON flr.faculty_profile_id = fp.id
             WHERE fp.university_id = $1 AND flr.approval_status = 'APPROVED'
               AND flr.leave_date <= $3
               AND COALESCE(flr.leave_end_date, flr.leave_date) >= $2`,
            [req.university_id, req.week_start, req.week_end]
        );

        const map = new Map<string, Set<string>>();
        for (const row of res.rows) {
            if (!map.has(row.faculty_profile_id)) map.set(row.faculty_profile_id, new Set());
            const set = map.get(row.faculty_profile_id)!;

            // Expand date range
            const start = new Date(row.leave_date);
            const end = new Date(row.leave_end_date || row.leave_date);
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                set.add(d.toISOString().split('T')[0]);
            }
        }
        return map;
    }

    private static async loadFacultyAvailability(universityId: string) {
        const res = await db.query(
            `SELECT fa.faculty_profile_id, fa.day_of_week as day,
                    fa.slot_start::text as start, fa.slot_end::text as end,
                    fa.availability_type as type
             FROM faculty_availability fa
             JOIN faculty_profiles fp ON fa.faculty_profile_id = fp.id
             WHERE fp.university_id = $1`,
            [universityId]
        );

        const map = new Map<string, { day: number; start: string; end: string; type: string }[]>();
        for (const row of res.rows) {
            if (!map.has(row.faculty_profile_id)) map.set(row.faculty_profile_id, []);
            map.get(row.faculty_profile_id)!.push({
                day: row.day,
                start: row.start,
                end: row.end,
                type: row.type
            });
        }
        return map;
    }

    private static async getMaxWeeklyLoad(universityId: string): Promise<number> {
        try {
            const res = await db.query(
                `SELECT constraint_value FROM scheduling_constraints
                 WHERE university_id = $1 AND constraint_type = 'MAX_FACULTY_LOAD' AND is_active = true
                 LIMIT 1`,
                [universityId]
            );
            if (res.rows[0]) {
                const val = res.rows[0].constraint_value;
                return val?.max_weekly_slots || val?.value || 25;
            }
        } catch {}
        return 25; // default max 25 slots per week
    }
}
