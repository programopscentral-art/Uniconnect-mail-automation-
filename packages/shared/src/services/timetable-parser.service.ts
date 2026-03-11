import * as XLSX from 'xlsx';

export interface ParsedSession {
    sheetName: string;
    sessionDate: string;       // YYYY-MM-DD
    sectionNumber: number;     // 1, 2, 3, ...
    slotStart: string;         // HH:MM (24h)
    slotEnd: string;           // HH:MM (24h)
    subjectCode: string;       // e.g. "MPS", "DS", "WAD"
    isLab: boolean;            // true if "(P)" present
    topics: string[];          // topic lines from cell
    facultyNames: string[];    // faculty names (last line)
    deliveryMode: string;      // PHYSICAL, ONLINE
    rawCell: string;           // original cell text
}

export interface ParsedSlot {
    name: string;
    startTime: string;  // HH:MM (24h)
    endTime: string;    // HH:MM (24h)
    slotType: string;   // LECTURE, BREAK, LAB
}

export interface TimetableParseResult {
    sheets: { name: string; dateRange: string; sessionCount: number }[];
    sessions: ParsedSession[];
    slots: ParsedSlot[];
    errors: string[];
    warnings: string[];
}

/**
 * Parse a timetable Excel file with the format:
 * - Each sheet is a week (named like "Jan 2 - 3", "Jan 5 - 10")
 * - Within each sheet: date headers (e.g. "Jan 5"), then section rows with time-slot columns
 * - Each cell: subject code + optional (P), topics, faculty name
 */
export function parseTimetableExcel(buffer: Buffer, year?: number): TimetableParseResult {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const result: TimetableParseResult = {
        sheets: [],
        sessions: [],
        slots: [],
        errors: [],
        warnings: []
    };

    const inferredYear = year || new Date().getFullYear();
    const slotSet = new Map<string, ParsedSlot>();

    for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) continue;

        // Get raw 2D array (header: 1 means array of arrays)
        const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        if (rawData.length === 0) continue;

        let sheetSessionCount = 0;
        let currentDate: string | null = null;
        let timeSlots: { start: string; end: string; colIdx: number }[] = [];
        let expectingSections = false;

        for (let rowIdx = 0; rowIdx < rawData.length; rowIdx++) {
            const row = rawData[rowIdx];
            if (!row || row.length === 0) continue;

            // Check if this row is a date header (e.g. "Jan 5", "Feb 10")
            const firstCell = String(row[0] || '').trim();
            const dateMatch = tryParseDate(firstCell, inferredYear);

            if (dateMatch) {
                currentDate = dateMatch;
                timeSlots = [];
                expectingSections = false;
                continue;
            }

            // Check if this is the time slot header row (contains "Section" or time patterns)
            if (isTimeSlotHeaderRow(row)) {
                timeSlots = parseTimeSlotRow(row);
                expectingSections = true;

                // Register slots
                for (const ts of timeSlots) {
                    const key = `${ts.start}-${ts.end}`;
                    if (!slotSet.has(key) && ts.start !== ts.end) {
                        const isBreak = isBreakSlot(row, ts.colIdx);
                        slotSet.set(key, {
                            name: `Slot ${slotSet.size + 1}`,
                            startTime: ts.start,
                            endTime: ts.end,
                            slotType: isBreak ? 'BREAK' : 'LECTURE'
                        });
                    }
                }
                continue;
            }

            // If we're expecting section rows and we have a current date
            if (expectingSections && currentDate && timeSlots.length > 0) {
                const sectionNum = parseSectionNumber(firstCell);
                if (sectionNum === null) {
                    // Empty row or non-section row — might signal end of sections
                    if (firstCell === '' && rowIdx > 0) continue;
                    // Could be next date header if not recognized
                    continue;
                }

                // Parse each time slot cell
                for (const slot of timeSlots) {
                    const cellValue = String(row[slot.colIdx] || '').trim();
                    if (!cellValue || isLunchCell(cellValue)) continue;

                    const parsed = parseCellContent(cellValue);
                    if (!parsed) continue;

                    result.sessions.push({
                        sheetName,
                        sessionDate: currentDate,
                        sectionNumber: sectionNum,
                        slotStart: slot.start,
                        slotEnd: slot.end,
                        subjectCode: parsed.subjectCode,
                        isLab: parsed.isLab,
                        topics: parsed.topics,
                        facultyNames: parsed.facultyNames,
                        deliveryMode: parsed.deliveryMode,
                        rawCell: cellValue
                    });
                    sheetSessionCount++;
                }
            }
        }

        result.sheets.push({
            name: sheetName,
            dateRange: sheetName,
            sessionCount: sheetSessionCount
        });
    }

    // Convert slot set to array
    result.slots = Array.from(slotSet.values());

    // Rename slots properly
    result.slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
    result.slots.forEach((s, i) => {
        s.name = s.slotType === 'BREAK' ? 'LUNCH' : `Period ${i + 1}`;
    });

    return result;
}

/**
 * Try to parse a date string like "Jan 5", "Feb 10", "January 5" with the given year.
 */
function tryParseDate(text: string, year: number): string | null {
    if (!text) return null;
    const cleaned = text.trim().replace(/[,]/g, '');

    // Pattern: "Jan 5", "January 5", "Feb 10", "Mar 15"
    const monthDayPattern = /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})$/i;
    const match = cleaned.match(monthDayPattern);
    if (!match) return null;

    const monthStr = match[1];
    const day = parseInt(match[2]);

    const monthMap: Record<string, number> = {
        jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
        apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
        aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
        nov: 10, november: 10, dec: 11, december: 11
    };

    const month = monthMap[monthStr.toLowerCase()];
    if (month === undefined || day < 1 || day > 31) return null;

    const d = new Date(year, month, day);
    return d.toISOString().split('T')[0];
}

/**
 * Check if a row is a time slot header (contains "Section" and time patterns).
 */
function isTimeSlotHeaderRow(row: any[]): boolean {
    const firstCell = String(row[0] || '').trim().toLowerCase();
    if (firstCell.includes('section')) return true;

    // Check if multiple cells contain time patterns
    let timeCount = 0;
    for (let i = 1; i < Math.min(row.length, 12); i++) {
        const cell = String(row[i] || '').trim();
        if (looksLikeTimeSlot(cell)) timeCount++;
    }
    return timeCount >= 3;
}

function looksLikeTimeSlot(text: string): boolean {
    // Match patterns like "9:30:10:20", "9:30-10:20", "10:20 11:10", "12:50- 1:30"
    return /\d{1,2}[:.]\d{2}/.test(text);
}

/**
 * Parse time slot headers from the row.
 */
function parseTimeSlotRow(row: any[]): { start: string; end: string; colIdx: number }[] {
    const slots: { start: string; end: string; colIdx: number }[] = [];

    for (let i = 1; i < row.length; i++) {
        const cell = String(row[i] || '').trim();
        if (!cell) continue;

        const times = extractTimeRange(cell);
        if (times) {
            slots.push({ start: times.start, end: times.end, colIdx: i });
        }
    }

    return slots;
}

/**
 * Extract start and end times from various formats:
 * "9:30:10:20", "9:30-10:20", "10:20 11:10", "12:50- 1:30", "9:30:10:20"
 */
function extractTimeRange(text: string): { start: string; end: string } | null {
    // Normalize the text
    let normalized = text.replace(/\s+/g, ' ').trim();

    // Pattern 1: "H:MM:H:MM" or "HH:MM:HH:MM" (colon separated)
    const colonPattern = /(\d{1,2}):(\d{2})[:\s]+(\d{1,2}):(\d{2})/;
    const match1 = normalized.match(colonPattern);
    if (match1) {
        return {
            start: formatTime24(parseInt(match1[1]), parseInt(match1[2])),
            end: formatTime24(parseInt(match1[3]), parseInt(match1[4]))
        };
    }

    // Pattern 2: "H:MM - H:MM" or "H:MM- H:MM"
    const dashPattern = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/;
    const match2 = normalized.match(dashPattern);
    if (match2) {
        return {
            start: formatTime24(parseInt(match2[1]), parseInt(match2[2])),
            end: formatTime24(parseInt(match2[3]), parseInt(match2[4]))
        };
    }

    return null;
}

/**
 * Convert hours/minutes to 24h format (handle AM/PM inference).
 * Assume: hours < 8 are PM (add 12), hours >= 8 are AM as-is.
 */
function formatTime24(h: number, m: number): string {
    // For university timetables: 1-7 are PM hours (13-19), 8-12 are morning
    if (h >= 1 && h <= 7) h += 12;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Check if a column is the LUNCH/break slot.
 */
function isBreakSlot(row: any[], colIdx: number): boolean {
    // Check if the header cell itself says "LUNCH" or similar
    const cell = String(row[colIdx] || '').trim().toUpperCase();
    return cell.includes('LUNCH') || cell.includes('BREAK');
}

function isLunchCell(text: string): boolean {
    const upper = text.toUpperCase().replace(/\s+/g, '');
    return upper.includes('LUNCH') || upper === 'L\nU\nN\nC\nH' || upper === 'LUNCH';
}

function parseSectionNumber(text: string): number | null {
    const cleaned = String(text).trim();
    const num = parseInt(cleaned);
    if (!isNaN(num) && num >= 1 && num <= 50) return num;
    return null;
}

interface CellParsed {
    subjectCode: string;
    isLab: boolean;
    topics: string[];
    facultyNames: string[];
    deliveryMode: string;
}

/**
 * Parse a timetable cell that looks like:
 * ```
 * MPS (P)
 *
 * Time_and_Work_Daily_Practice (25 Mins)
 * Pipes_and_Cisterns_Daily_Practice (25 Mins)
 *
 * siddu
 * ```
 */
function parseCellContent(text: string): CellParsed | null {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return null;

    // First line: subject code + optional (P)
    const firstLine = lines[0];
    const isLab = /\(P\)/i.test(firstLine);
    let subjectCode = firstLine.replace(/\s*\(P\)\s*/gi, '').trim();

    // Clean up subject code — remove trailing whitespace and normalize
    subjectCode = subjectCode.replace(/\s+/g, ' ').trim();

    if (!subjectCode) return null;

    // Last line: faculty name(s)
    // Could be: "siddu", "Online", "Rachana, Bershina", "Online "
    const lastLine = lines[lines.length - 1];
    let facultyNames: string[] = [];
    let deliveryMode = 'PHYSICAL';

    // Check if last line is faculty or topic
    if (lines.length > 1) {
        const lastLineLower = lastLine.toLowerCase().trim();

        // Detect "Online" as delivery mode
        if (lastLineLower === 'online' || lastLineLower === 'online\'') {
            deliveryMode = 'ONLINE';
            facultyNames = [];
        } else {
            // Split by comma for multiple faculty
            facultyNames = lastLine.split(',').map(n => n.trim()).filter(n => n.length > 0);

            // Check if any of the names is "Online"
            const onlineIdx = facultyNames.findIndex(n => n.toLowerCase().trim() === 'online');
            if (onlineIdx !== -1) {
                deliveryMode = 'ONLINE';
                facultyNames.splice(onlineIdx, 1);
            }
        }
    }

    // Middle lines: topics
    const topicStartIdx = 1;
    const topicEndIdx = lines.length > 1 ? lines.length - 1 : 1;
    const topics: string[] = [];

    for (let i = topicStartIdx; i < topicEndIdx; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        // Clean up topic: replace double underscores with spaces, remove duration annotations
        let topic = line
            .replace(/__/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        topics.push(topic);
    }

    return {
        subjectCode,
        isLab,
        topics,
        facultyNames,
        deliveryMode
    };
}
