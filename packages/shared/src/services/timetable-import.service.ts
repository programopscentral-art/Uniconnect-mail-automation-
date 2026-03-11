import { db } from '../db/client';
import type { ParsedSession, ParsedSlot } from './timetable-parser.service';
import type { TimetableSessionInput } from './scheduling.service';

export interface MatchedEntity {
    parsed: string;          // original parsed name/code
    dbId: string | null;     // matched DB ID
    dbName: string;          // matched DB display name
    confidence: 'exact' | 'fuzzy' | 'unmatched';
}

export interface ImportMatchResult {
    subjects: MatchedEntity[];
    faculty: MatchedEntity[];
    sections: MatchedEntity[];
    matchedSessions: MatchedSessionRow[];
    unmatchedSubjects: string[];
    unmatchedFaculty: string[];
    unmatchedSections: number[];
    warnings: string[];
    totalParsed: number;
    totalMatchable: number;
}

export interface MatchedSessionRow {
    sessionDate: string;
    sectionNumber: number;
    sectionId: string | null;
    slotStart: string;
    slotEnd: string;
    subjectCode: string;
    subjectId: string | null;
    isLab: boolean;
    topics: string[];
    facultyNames: string[];
    facultyProfileId: string | null;
    deliveryMode: string;
    rawCell: string;
}

/**
 * Match parsed sessions against DB records for a given university.
 */
export async function matchParsedSessions(
    universityId: string,
    sessions: ParsedSession[],
    manualMappings?: {
        subjectMap?: Record<string, string>;   // parsed code -> subject id
        facultyMap?: Record<string, string>;   // parsed name -> faculty_profile id
        sectionMap?: Record<number, string>;   // section number -> section id
    }
): Promise<ImportMatchResult> {
    // 1. Load all subjects for this university
    const subjectsRes = await db.query(
        `SELECT s.id, s.code, s.name FROM subjects s WHERE s.university_id = $1`,
        [universityId]
    );
    const dbSubjects = subjectsRes.rows as { id: string; code: string; name: string }[];

    // 2. Load all faculty with user names
    const facultyRes = await db.query(
        `SELECT fp.id, fp.employee_code, u.name, u.email
         FROM faculty_profiles fp
         JOIN users u ON u.id = fp.user_id
         WHERE fp.university_id = $1`,
        [universityId]
    );
    const dbFaculty = facultyRes.rows as { id: string; employee_code: string; name: string; email: string }[];

    // 3. Load sections
    const sectionsRes = await db.query(
        `SELECT s.id, s.name, s.batch_code, t.name as term_name
         FROM sections s
         LEFT JOIN terms t ON s.term_id = t.id
         WHERE s.university_id = $1
         ORDER BY s.name`,
        [universityId]
    );
    const dbSections = sectionsRes.rows as { id: string; name: string; batch_code: string; term_name: string }[];

    // Build subject lookup (code -> id)
    const subjectLookup = new Map<string, string>();
    for (const s of dbSubjects) {
        if (s.code) subjectLookup.set(s.code.toUpperCase().trim(), s.id);
        // Also map by name for fuzzy matching
        if (s.name) subjectLookup.set(s.name.toUpperCase().trim(), s.id);
    }

    // Build faculty lookup (name -> id) - multiple strategies
    const facultyLookup = new Map<string, string>();
    for (const f of dbFaculty) {
        const fullName = f.name?.toLowerCase().trim();
        if (fullName) {
            facultyLookup.set(fullName, f.id);
            // Also index by first name
            const firstName = fullName.split(' ')[0];
            if (firstName && !facultyLookup.has(firstName)) {
                facultyLookup.set(firstName, f.id);
            }
            // Also index by last name
            const parts = fullName.split(' ');
            if (parts.length > 1) {
                const lastName = parts[parts.length - 1];
                if (!facultyLookup.has(lastName)) {
                    facultyLookup.set(lastName, f.id);
                }
            }
        }
        if (f.employee_code) {
            facultyLookup.set(f.employee_code.toLowerCase().trim(), f.id);
        }
    }

    // Section number -> section ID mapping
    const sectionNumberMap = new Map<number, string>();
    // If manual mappings provided, use those
    if (manualMappings?.sectionMap) {
        for (const [num, id] of Object.entries(manualMappings.sectionMap)) {
            sectionNumberMap.set(Number(num), id);
        }
    } else {
        // Auto-map: section number N -> batch_code S0N / S{N} pattern
        for (const s of dbSections) {
            const code = (s.batch_code || '').toUpperCase().trim();
            // Match patterns like "S01", "S02", "S1", "S2", etc.
            const match = code.match(/^S0?(\d+)$/);
            if (match) {
                sectionNumberMap.set(parseInt(match[1]), s.id);
            }
        }
        // Fallback: if no batch_code matches, try by name containing the number
        if (sectionNumberMap.size === 0) {
            for (const s of dbSections) {
                const nameMatch = s.name.match(/(\d+)/);
                if (nameMatch) {
                    const num = parseInt(nameMatch[1]);
                    if (!sectionNumberMap.has(num)) {
                        sectionNumberMap.set(num, s.id);
                    }
                }
            }
        }
    }

    // Apply manual subject/faculty overrides
    if (manualMappings?.subjectMap) {
        for (const [code, id] of Object.entries(manualMappings.subjectMap)) {
            subjectLookup.set(code.toUpperCase().trim(), id);
        }
    }
    if (manualMappings?.facultyMap) {
        for (const [name, id] of Object.entries(manualMappings.facultyMap)) {
            facultyLookup.set(name.toLowerCase().trim(), id);
        }
    }

    // Track unique entities and their match status
    const subjectMatches = new Map<string, MatchedEntity>();
    const facultyMatches = new Map<string, MatchedEntity>();
    const sectionMatches = new Map<number, MatchedEntity>();
    const matchedSessions: MatchedSessionRow[] = [];
    const warnings: string[] = [];

    for (const s of sessions) {
        // Match subject
        const subjKey = s.subjectCode.toUpperCase().trim();
        if (!subjectMatches.has(subjKey)) {
            const matchedId = subjectLookup.get(subjKey) || null;
            const matchedSubj = matchedId ? dbSubjects.find(ds => ds.id === matchedId) : null;
            subjectMatches.set(subjKey, {
                parsed: s.subjectCode,
                dbId: matchedId,
                dbName: matchedSubj ? `${matchedSubj.code} - ${matchedSubj.name}` : '',
                confidence: matchedId ? 'exact' : 'unmatched'
            });
        }

        // Match faculty (use first faculty name for primary)
        let primaryFacultyId: string | null = null;
        for (const fname of s.facultyNames) {
            const fkey = fname.toLowerCase().trim();
            if (!facultyMatches.has(fkey)) {
                const matchedId = facultyLookup.get(fkey) || fuzzyMatchFaculty(fkey, dbFaculty);
                const matchedFac = matchedId ? dbFaculty.find(df => df.id === matchedId) : null;
                facultyMatches.set(fkey, {
                    parsed: fname,
                    dbId: matchedId,
                    dbName: matchedFac?.name || '',
                    confidence: matchedId
                        ? (facultyLookup.has(fkey) ? 'exact' : 'fuzzy')
                        : 'unmatched'
                });
            }
            if (!primaryFacultyId) {
                primaryFacultyId = facultyMatches.get(fkey)?.dbId || null;
            }
        }

        // Match section
        if (!sectionMatches.has(s.sectionNumber)) {
            const matchedId = sectionNumberMap.get(s.sectionNumber) || null;
            const matchedSec = matchedId ? dbSections.find(ds => ds.id === matchedId) : null;
            sectionMatches.set(s.sectionNumber, {
                parsed: `Section ${s.sectionNumber}`,
                dbId: matchedId,
                dbName: matchedSec?.name || '',
                confidence: matchedId ? 'exact' : 'unmatched'
            });
        }

        matchedSessions.push({
            sessionDate: s.sessionDate,
            sectionNumber: s.sectionNumber,
            sectionId: sectionMatches.get(s.sectionNumber)?.dbId || null,
            slotStart: s.slotStart,
            slotEnd: s.slotEnd,
            subjectCode: s.subjectCode,
            subjectId: subjectMatches.get(subjKey)?.dbId || null,
            isLab: s.isLab,
            topics: s.topics,
            facultyNames: s.facultyNames,
            facultyProfileId: primaryFacultyId,
            deliveryMode: s.deliveryMode,
            rawCell: s.rawCell
        });
    }

    const unmatchedSubjects = Array.from(subjectMatches.values())
        .filter(m => m.confidence === 'unmatched')
        .map(m => m.parsed);
    const unmatchedFaculty = Array.from(facultyMatches.values())
        .filter(m => m.confidence === 'unmatched')
        .map(m => m.parsed);
    const unmatchedSections = Array.from(sectionMatches.entries())
        .filter(([_, m]) => m.confidence === 'unmatched')
        .map(([num]) => num);

    if (unmatchedSubjects.length > 0) {
        warnings.push(`${unmatchedSubjects.length} subject code(s) could not be matched: ${unmatchedSubjects.join(', ')}`);
    }
    if (unmatchedFaculty.length > 0) {
        warnings.push(`${unmatchedFaculty.length} faculty name(s) could not be matched: ${unmatchedFaculty.join(', ')}`);
    }
    if (unmatchedSections.length > 0) {
        warnings.push(`${unmatchedSections.length} section number(s) could not be matched: ${unmatchedSections.join(', ')}`);
    }

    return {
        subjects: Array.from(subjectMatches.values()),
        faculty: Array.from(facultyMatches.values()),
        sections: Array.from(sectionMatches.values()),
        matchedSessions,
        unmatchedSubjects,
        unmatchedFaculty,
        unmatchedSections,
        warnings,
        totalParsed: sessions.length,
        totalMatchable: matchedSessions.filter(ms => ms.subjectId && ms.sectionId).length
    };
}

/**
 * Fuzzy match a faculty name against the DB.
 * Tries partial matching and substring matching.
 */
function fuzzyMatchFaculty(name: string, dbFaculty: { id: string; name: string; employee_code: string }[]): string | null {
    const lower = name.toLowerCase().trim();
    if (!lower) return null;

    // Try partial first-name match
    for (const f of dbFaculty) {
        const fullName = f.name?.toLowerCase() || '';
        const firstName = fullName.split(' ')[0];
        const lastName = fullName.split(' ').pop() || '';

        // Exact first name
        if (firstName === lower) return f.id;
        // Exact last name
        if (lastName === lower) return f.id;
        // Name contains the search term
        if (fullName.includes(lower)) return f.id;
        // Search term contains the full name
        if (lower.includes(firstName) && firstName.length >= 3) return f.id;
    }

    return null;
}

/**
 * Convert matched sessions to TimetableSessionInput format for bulk creation.
 */
export function toSessionInputs(
    universityId: string,
    programId: string,
    termId: string,
    matchedSessions: MatchedSessionRow[]
): TimetableSessionInput[] {
    return matchedSessions
        .filter(ms => ms.subjectId && ms.sectionId) // Only sessions with matched subject & section
        .map(ms => ({
            university_id: universityId,
            program_id: programId,
            term_id: termId,
            section_id: ms.sectionId!,
            subject_id: ms.subjectId!,
            faculty_profile_id: ms.facultyProfileId,
            classroom_id: null,
            session_date: ms.sessionDate,
            slot_start: ms.slotStart,
            slot_end: ms.slotEnd,
            delivery_mode: ms.deliveryMode,
            planned_topic: ms.topics.join(' | ') || undefined
        }));
}
