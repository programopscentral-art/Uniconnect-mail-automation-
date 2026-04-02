import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addSOPDocument, getSOPDocuments, deleteSOPDocument, addEventChecklistItemsBulk, addEventMessagesBulk, deleteEventChecklistItemsByEvent, deleteEventMessagesByEvent } from '@uniconnect/shared';
import mammoth from 'mammoth';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

type ChecklistItem = { title: string; section: string; owner: string };
type ParsedMessage = { title: string; content: string; section: string; channel: string; scheduled_time: string };

// ═══════════════════════════════════════════════════════════════════════════════
// API Handlers
// ═══════════════════════════════════════════════════════════════════════════════

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const docs = await getSOPDocuments(params.id);
    return json(docs);
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);

    let contentText = '';
    let contentHtml = '';
    let checklistItems: ChecklistItem[] = [];
    let filename = 'document.txt';

    const contentType = request.headers.get('content-type') || '';
    let mode: 'view' | 'generate' = 'generate';

    if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const modeField = formData.get('mode') as string | null;
        if (modeField === 'view') mode = 'view';

        if (!file) throw error(400, 'No file uploaded');
        filename = file.name;
        const lowerName = filename.toLowerCase();

        try {
            if (lowerName.endsWith('.docx')) {
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                const [htmlResult, textResult] = await Promise.all([
                    mammoth.convertToHtml({ buffer }),
                    mammoth.extractRawText({ buffer })
                ]);

                contentText = textResult.value;
                contentHtml = htmlResult.value;

                console.log(`[SOP] Mammoth HTML: ${contentHtml.length} chars, text: ${contentText.length} chars`);
                debugDocStructure(contentHtml);

                if (mode === 'generate') {
                    checklistItems = parseHTMLTables(contentHtml);
                    console.log(`[SOP] HTML parser: ${checklistItems.length} checklist items`);

                    if (checklistItems.length < 3) {
                        checklistItems = parseRawTextToChecklist(contentText);
                        console.log(`[SOP] Text fallback: ${checklistItems.length} checklist items`);
                    }
                }

            } else if (lowerName.endsWith('.pdf')) {
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const pdfParse = (await import('pdf-parse')).default;
                const pdfData = await pdfParse(buffer);
                contentText = pdfData.text;
                if (mode === 'generate') {
                    checklistItems = parseRawTextToChecklist(contentText);
                }

            } else if (lowerName.endsWith('.doc')) {
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const rawText = buffer.toString('utf8');
                const cleanedParts: string[] = [];
                for (const line of rawText.split(/[\r\n]+/)) {
                    const readable = line.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, ' ').replace(/\s{3,}/g, ' ').trim();
                    if (readable.length > 5 && /[a-zA-Z]{2,}/.test(readable)) {
                        cleanedParts.push(readable);
                    }
                }
                contentText = cleanedParts.join('\n');
                if (mode === 'generate') {
                    checklistItems = parseRawTextToChecklist(contentText);
                }

            } else {
                contentText = await file.text();
                if (mode === 'generate') {
                    checklistItems = parseRawTextToChecklist(contentText);
                }
            }
        } catch (e: any) {
            console.error('[SOP] File parse error:', e.message);
            throw error(400, `Could not parse "${filename}": ${e.message}. Try a .txt file or paste content in description.`);
        }
    } else if (contentType.includes('application/json')) {
        const body = await request.json();
        contentText = body.content || body.text || '';
        filename = body.filename || 'document.txt';
        if (body.mode === 'view') mode = 'view';
        if (mode === 'generate') {
            checklistItems = parseRawTextToChecklist(contentText);
        }
    } else {
        throw error(400, 'Invalid request format');
    }

    contentText = contentText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

    if (!contentText || contentText.length < 5) {
        throw error(400, 'Document appears empty. Try a .txt file or paste content in description.');
    }

    // Save the document
    const doc = await addSOPDocument(params.id, filename, contentText, locals.user.id, contentHtml || undefined);

    // Clear existing items before re-generating
    if (mode === 'generate') {
        await deleteEventChecklistItemsByEvent(params.id);
        await deleteEventMessagesByEvent(params.id);
        console.log(`[SOP] Cleared existing checklist & messages for event ${params.id}`);
    }

    // Insert checklist items
    let generatedItems: any[] = [];
    if (checklistItems.length > 0) {
        generatedItems = await addEventChecklistItemsBulk(params.id, checklistItems);
    }

    // Extract and insert messages
    let generatedMessages: any[] = [];
    const messages = contentHtml
        ? parseMessagesFromHTML(contentHtml)
        : parseMessagesFromText(contentText);
    if (messages.length > 0) {
        generatedMessages = await addEventMessagesBulk(params.id, messages);
    }

    // Log section distribution
    const sectionCounts: Record<string, number> = {};
    for (const item of checklistItems) {
        const s = item.section || '(no section)';
        sectionCounts[s] = (sectionCounts[s] || 0) + 1;
    }
    const msgSectionCounts: Record<string, number> = {};
    for (const msg of messages) {
        const s = msg.section || '(no section)';
        msgSectionCounts[s] = (msgSectionCounts[s] || 0) + 1;
    }
    console.log(`[SOP] Checklist sections:`, JSON.stringify(sectionCounts));
    console.log(`[SOP] Message sections:`, JSON.stringify(msgSectionCounts));
    console.log(`[SOP] Result: ${generatedItems.length} checklist, ${generatedMessages.length} messages`);

    // Auto-create tasks from checklist items if event has assignees
    let autoTasks: any[] = [];
    if (generatedItems.length > 0) {
        try {
            const { getScheduleEventById, createTasksFromEventChecklist } = await import('@uniconnect/shared');
            const event = await getScheduleEventById(params.id);
            const assigneeIds = (event?.assignees || []).map((a: any) => a.id).filter(Boolean);
            if (assigneeIds.length > 0) {
                autoTasks = await createTasksFromEventChecklist(params.id, assigneeIds, locals.user.id);
                console.log(`[SOP] Auto-created ${autoTasks.length} tasks for ${assigneeIds.length} assignees`);
            }
        } catch (e) {
            console.warn('[SOP] Auto-task creation failed (non-fatal):', e);
        }
    }

    return json({
        document: doc,
        mode,
        checklist: { generated: generatedItems.length, items: generatedItems, sections: sectionCounts },
        messages: { generated: generatedMessages.length, items: generatedMessages, sections: msgSectionCounts },
        tasks: { generated: autoTasks.length, items: autoTasks }
    });
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);
    const docId = url.searchParams.get('docId');
    if (!docId) throw error(400, 'Document ID required');
    await deleteSOPDocument(docId);
    return json({ success: true });
};


// ═══════════════════════════════════════════════════════════════════════════════
// DEBUG: Dump document structure
// ═══════════════════════════════════════════════════════════════════════════════

function debugDocStructure(html: string) {
    const headings = [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
    console.log(`[DOC_STRUCTURE] ${headings.length} headings:`);
    for (const h of headings) {
        console.log(`  H${h[1]}: "${stripHTML(h[2])}"`);
    }

    const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
    console.log(`[DOC_STRUCTURE] ${tables.length} tables:`);
    for (let t = 0; t < tables.length; t++) {
        const rows = extractTableRows(tables[t]);
        if (rows.length > 0) {
            const headerCells = rows[0].map(c => c.substring(0, 40));
            const nearestH = findNearestTextBefore(html, tables[t]);
            console.log(`  Table ${t + 1} (${rows.length} rows) under "${nearestH}": [${headerCells.join(' | ')}]`);
        }
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// CORE ARCHITECTURE: Tab-First Document Parser
//
// Google Docs with tabs export via mammoth as a flat HTML stream where tabs
// appear as headings (<h1>-<h6>) or bold paragraphs (<p><strong>...</strong></p>).
// Tables follow their respective tab headings.
//
// Strategy:
// 1. Extract ALL tables from HTML with their byte positions
// 2. Extract ALL headings/bold paragraphs with their byte positions
// 3. For each table, find the nearest preceding text block as its section name
// 4. Classify each table independently as task or message by its column headers
// 5. Parse task tables → checklist items; message tables → messages
// 6. No cross-tab contamination: each table's section is determined by proximity
// ═══════════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function stripHTML(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function stripHTMLPreserveFormat(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
        .replace(/<\/div>\s*<div[^>]*>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function extractTableRows(tableHtml: string): string[][] {
    const rows: string[][] = [];
    const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    for (const row of rowMatches) {
        const cells: string[] = [];
        const cellMatches = row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
        for (const cell of cellMatches) {
            cells.push(stripHTML(cell).trim());
        }
        if (cells.length > 0) rows.push(cells);
    }
    return rows;
}

function extractTableRowsRaw(tableHtml: string): string[][] {
    const rows: string[][] = [];
    const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    for (const row of rowMatches) {
        const cells: string[] = [];
        const cellMatches = row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
        for (const cell of cellMatches) {
            cells.push(stripHTMLPreserveFormat(cell).trim());
        }
        if (cells.length > 0) rows.push(cells);
    }
    return rows;
}

/** Known pure header words that should never be treated as task titles */
const PURE_HEADER_WORDS = new Set([
    'task', 'task category', 'description', 'phase', 'focus', 'sr no', 's no',
    'sl no', 'serial', 'status', 'priority', 'assignee', 'deadline', 'date',
    'time', 'remarks', 'comments', 'notes', '#', 'objective', 'sub-tasks',
    'sub-tasks (micro level)', 'owner', 'timeline'
]);


// ═══════════════════════════════════════════════════════════════════════════════
// TEXT BLOCK EXTRACTION — Find all headings & section markers with positions
// ═══════════════════════════════════════════════════════════════════════════════

interface TextBlock {
    text: string;
    position: number;
    type: 'heading' | 'bold' | 'paragraph';
}

/**
 * Extract all potential section markers (headings, bold paragraphs, short paragraphs)
 * from HTML, ordered by position. These are candidates for tab/section names.
 */
function extractTextBlocks(html: string): TextBlock[] {
    const blocks: TextBlock[] = [];

    // Headings: <h1> through <h6>
    for (const match of html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)) {
        const text = stripHTML(match[1]).trim();
        if (text.length >= 3 && text.length < 150) {
            blocks.push({ text, position: match.index!, type: 'heading' });
        }
    }

    // Bold paragraphs: <p><strong>...</strong></p> — mammoth's common rendering for tab titles
    for (const match of html.matchAll(/<p[^>]*>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>/gi)) {
        const text = stripHTML(match[1]).trim();
        if (text.length >= 3 && text.length < 150) {
            // Don't duplicate if an identical heading already exists at a nearby position
            const isDuplicate = blocks.some(b => b.text === text && Math.abs(b.position - match.index!) < 200);
            if (!isDuplicate) {
                blocks.push({ text, position: match.index!, type: 'bold' });
            }
        }
    }

    blocks.sort((a, b) => a.position - b.position);
    return blocks;
}

/**
 * Find the nearest text block that appears before a given position in the HTML.
 * Returns the cleaned section name, or '' if nothing suitable is found.
 */
function findNearestSectionBefore(blocks: TextBlock[], position: number): string {
    let nearest = '';
    for (const block of blocks) {
        if (block.position >= position) break;
        nearest = block.text;
    }
    return nearest.replace(/^\d+\.\s*/, '').replace(/\s*\(.*?\)\s*$/, '').trim();
}

/** Simpler version for debug logging — searches raw HTML */
function findNearestTextBefore(html: string, tableHtml: string): string {
    const pos = html.indexOf(tableHtml);
    if (pos < 0) return '(unknown)';

    // Look backwards for the nearest heading or bold paragraph
    const before = html.substring(0, pos);
    const headings = [...before.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
    const bolds = [...before.matchAll(/<p[^>]*>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>/gi)];

    let best = '';
    let bestPos = -1;

    for (const h of headings) {
        if ((h.index || 0) > bestPos) {
            bestPos = h.index || 0;
            best = stripHTML(h[1]);
        }
    }
    for (const b of bolds) {
        if ((b.index || 0) > bestPos) {
            bestPos = b.index || 0;
            best = stripHTML(b[1]);
        }
    }

    return best || '(none)';
}


// ═══════════════════════════════════════════════════════════════════════════════
// TABLE TYPE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

const MESSAGE_SECTION_PATTERN = /\bmessage|communication|day\s*\d+\s*message|over.?night\s*message/i;

function isMessageSection(text: string): boolean {
    return MESSAGE_SECTION_PATTERN.test(text);
}

const CHANNEL_NAMES = new Set([
    'whatsapp', 'email', 'sms', 'social media', 'social',
    'app notification', 'wa group', 'wa', 'instagram', 'linkedin'
]);

/**
 * Classify a table as 'task', 'message', or 'unknown' based on column headers
 * and optionally first-row content. Uses a scoring system to handle ambiguous tables.
 */
function detectTableType(header: string[], dataRows?: string[][]): 'task' | 'message' | 'unknown' {
    const hasChannel = header.some(c => /channel|platform|medium/i.test(c));
    const hasMessageContent = header.some(c => /^message|message\s*content|content|body|text|template|draft/i.test(c));
    const hasAudience = header.some(c => /audience|target|recipient/i.test(c));
    const hasTypeHeading = header.some(c => /type\s*\/?\s*heading|type\/heading/i.test(c));
    const hasTask = header.some(c => /^task$|task\s*name|task\s*category/i.test(c));
    const hasObjective = header.some(c => /objective/i.test(c));
    const hasSubTasks = header.some(c => /sub.?task/i.test(c));
    const hasOwner = header.some(c => /^owner$/i.test(c));
    const hasTimeline = header.some(c => /^timeline$/i.test(c));

    const msgScore = (hasChannel ? 3 : 0) + (hasMessageContent ? 2 : 0) + (hasAudience ? 2 : 0) + (hasTypeHeading ? 1 : 0);
    const taskScore = (hasTask ? 2 : 0) + (hasObjective ? 2 : 0) + (hasSubTasks ? 3 : 0) + (hasOwner ? 1 : 0) + (hasTimeline ? 1 : 0);

    if (msgScore >= 4) return 'message';
    if (taskScore >= 3) return 'task';
    if (msgScore > taskScore && msgScore >= 2) return 'message';
    if (taskScore > msgScore) return 'task';

    // Content-based fallback: check if first column contains channel names
    if (dataRows && dataRows.length > 0) {
        let channelCount = 0;
        const checkRows = dataRows.slice(0, Math.min(5, dataRows.length));
        for (const row of checkRows) {
            const firstVal = (row[0] || '').toLowerCase().trim();
            if (CHANNEL_NAMES.has(firstVal) || firstVal.startsWith('whatsapp') || firstVal.startsWith('email') || firstVal.startsWith('sms')) {
                channelCount++;
            }
        }
        if (channelCount >= 2) return 'message';
    }

    return 'unknown';
}

function detectChannel(text: string): string {
    const t = text.toLowerCase();
    if (t.includes('whatsapp') || t.includes('wa ')) return 'WhatsApp';
    if (t.includes('email') || t.includes('mail')) return 'Email';
    if (t.includes('sms')) return 'SMS';
    if (t.includes('app') && t.includes('notification')) return 'App Notification';
    if (t.includes('social') || t.includes('instagram') || t.includes('linkedin')) return 'Social Media';
    return '';
}


// ═══════════════════════════════════════════════════════════════════════════════
// HTML TABLE PARSER (Tab-First Architecture)
//
// 1. Extract all text blocks (headings, bold) with positions
// 2. Extract all <table> elements with positions
// 3. For each table: find nearest preceding text block → that's its section
// 4. Classify table → task or message
// 5. Parse accordingly, never bleed across sections
// ═══════════════════════════════════════════════════════════════════════════════

interface LocatedTable {
    html: string;
    position: number;
    rows: string[][];
    rawRows: string[][];
    header: string[];
    type: 'task' | 'message' | 'unknown';
    section: string;
}

function locateTablesInHTML(html: string): LocatedTable[] {
    const textBlocks = extractTextBlocks(html);
    const tables: LocatedTable[] = [];

    // Find all tables with their positions
    for (const match of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
        const tableHtml = match[0];
        const position = match.index!;
        const rows = extractTableRows(tableHtml);
        const rawRows = extractTableRowsRaw(tableHtml);

        if (rows.length < 2) continue; // Need at least header + 1 data row

        const header = rows[0].map(h => h.toLowerCase().trim());
        const dataRows = rows.slice(1);
        const type = detectTableType(header, dataRows);

        // Find this table's section from the nearest preceding text block
        let section = findNearestSectionBefore(textBlocks, position);

        // If the nearest text block is a message section name but the table is a task table,
        // or vice versa, use the section name as-is (the table type takes precedence for classification)
        // However, if section looks like a message section and table is detected as 'unknown',
        // classify it as a message table
        if (type === 'unknown' && isMessageSection(section)) {
            tables.push({ html: tableHtml, position, rows, rawRows, header, type: 'message', section });
        } else {
            tables.push({ html: tableHtml, position, rows, rawRows, header, type, section });
        }
    }

    return tables;
}

function parseHTMLTables(html: string): ChecklistItem[] {
    const located = locateTablesInHTML(html);
    const items: ChecklistItem[] = [];

    for (const table of located) {
        // Only parse task and unknown tables as checklist items
        // Message tables are handled by parseMessagesFromHTML
        if (table.type === 'message') {
            console.log(`[SOP] Skipping message table in "${table.section}" (${table.header.join(', ')})`);
            continue;
        }

        const tableItems = parseTaskTable(table.rows, table.section);
        if (tableItems.length > 0) {
            console.log(`[SOP] Task table in "${table.section}": ${tableItems.length} items`);
            items.push(...tableItems);
        }
    }

    return items;
}


// ═══════════════════════════════════════════════════════════════════════════════
// TASK TABLE PARSER — Extract checklist items from a task-type table
// ═══════════════════════════════════════════════════════════════════════════════

function parseTaskTable(rows: string[][], section: string): ChecklistItem[] {
    const items: ChecklistItem[] = [];
    const header = rows[0].map(h => h.toLowerCase().trim());

    // Identify columns by header text
    let taskCol = -1, descCol = -1, subTasksCol = -1, ownerCol = -1, catCol = -1;
    for (let c = 0; c < header.length; c++) {
        const h = header[c];
        if (taskCol === -1 && (/^task$/i.test(h) || /task\s*name/i.test(h))) taskCol = c;
        else if (descCol === -1 && /objective|description|detail|explanation/i.test(h)) descCol = c;
        else if (subTasksCol === -1 && /sub.?task/i.test(h)) subTasksCol = c;
        else if (ownerCol === -1 && /^owner$|responsible|assigned\s*to/i.test(h)) ownerCol = c;
        else if (catCol === -1 && /category|type|phase|group/i.test(h)) catCol = c;
    }

    // Fallback column detection
    if (taskCol === -1) {
        if (header.length >= 3) {
            catCol = catCol === -1 ? 0 : catCol;
            taskCol = 1;
            descCol = descCol === -1 ? 2 : descCol;
        } else if (header.length === 2) {
            taskCol = 0; descCol = 1;
        } else {
            taskCol = 0;
        }
    }

    let lastCategory = '';
    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (row.length <= taskCol) continue;

        const taskName = row[taskCol]?.trim() || '';
        if (!taskName || taskName.length < 2) continue;
        if (PURE_HEADER_WORDS.has(taskName.toLowerCase())) continue;

        const desc = descCol >= 0 && row.length > descCol ? row[descCol]?.trim() || '' : '';
        const subTasks = subTasksCol >= 0 && row.length > subTasksCol ? row[subTasksCol]?.trim() || '' : '';
        const owner = ownerCol >= 0 && row.length > ownerCol ? row[ownerCol]?.trim() || '' : '';
        const category = catCol >= 0 && row.length > catCol ? row[catCol]?.trim() || '' : '';

        if (category && category.length > 1) lastCategory = category;
        const sectionLabel = section || lastCategory;

        let title = taskName;
        if (desc && desc.length > 2) title += ` — ${desc}`;
        if (subTasks && subTasks.length > 2 && subTasks !== desc) title += ` [${subTasks}]`;

        if (title.length > 3) {
            items.push({ title: title.trim(), section: sectionLabel, owner });
        }
    }

    return items;
}


// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE PARSER (Tab-First Architecture)
//
// Uses the same located-table approach: each table gets its section from the
// nearest preceding text block. Message tables are identified by column headers,
// not by being "inside" a message heading section.
// ═══════════════════════════════════════════════════════════════════════════════

function parseMessagesFromHTML(html: string): ParsedMessage[] {
    const located = locateTablesInHTML(html);
    const messages: ParsedMessage[] = [];

    // Parse message tables
    for (const table of located) {
        if (table.type !== 'message') continue;

        const sectionName = table.section || 'Messages';
        const tableMessages = parseMessageTable(table.rows, table.rawRows, sectionName);
        console.log(`[SOP] Message table in "${sectionName}": ${tableMessages.length} messages (${table.header.join(', ')})`);
        messages.push(...tableMessages);
    }

    // If no message tables found via headers, check for standalone message content
    // in paragraphs under message-section headings
    if (messages.length === 0) {
        let currentMessageSection = '';

        // Split HTML to find paragraphs in message sections
        const parts = html.split(/(<table[\s\S]*?<\/table>|<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<p[^>]*>\s*<strong>[\s\S]*?<\/strong>\s*<\/p>|<p[^>]*>[\s\S]*?<\/p>)/gi);

        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;

            // Track headings
            const headingMatch = trimmed.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
            if (headingMatch) {
                const text = stripHTML(headingMatch[1]).trim();
                if (isMessageSection(text)) {
                    currentMessageSection = text.replace(/^\d+\.\s*/, '').replace(/\s*\(.*?\)\s*$/, '').trim();
                } else if (text.length > 2) {
                    currentMessageSection = '';
                }
                continue;
            }

            // Track bold paragraphs
            const boldMatch = trimmed.match(/<p[^>]*>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>/i);
            if (boldMatch && !/<table/i.test(trimmed)) {
                const text = stripHTML(boldMatch[1]).trim();
                if (isMessageSection(text)) {
                    currentMessageSection = text.replace(/^\d+\.\s*/, '').replace(/\s*\(.*?\)\s*$/, '').trim();
                } else if (text.length > 2) {
                    currentMessageSection = '';
                }
                continue;
            }

            // Paragraph content in message sections
            if (currentMessageSection) {
                const pMatch = trimmed.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
                if (pMatch && !/<table/i.test(trimmed)) {
                    const text = stripHTMLPreserveFormat(pMatch[1]).trim();
                    if (text.length > 10) {
                        messages.push({
                            title: currentMessageSection,
                            content: text,
                            section: currentMessageSection,
                            channel: detectChannel(currentMessageSection),
                            scheduled_time: ''
                        });
                    }
                }
            }
        }
    }

    // Deduplicate
    const seen = new Set<string>();
    const unique: ParsedMessage[] = [];
    for (const msg of messages) {
        const key = `${msg.title}||${msg.content.slice(0, 100)}`;
        if (!seen.has(key)) { seen.add(key); unique.push(msg); }
    }

    console.log(`[SOP] Total unique messages: ${unique.length}`);
    return unique.slice(0, 100);
}


// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE TABLE PARSER — Extract messages from a message-type table
// ═══════════════════════════════════════════════════════════════════════════════

function parseMessageTable(rows: string[][], rawRows: string[][], sectionHeading: string): ParsedMessage[] {
    const messages: ParsedMessage[] = [];
    const header = rows[0].map(h => h.toLowerCase().trim());

    // Identify columns
    let typeCol = -1, contentCol = -1, timeCol = -1, channelCol = -1, audienceCol = -1;
    for (let c = 0; c < header.length; c++) {
        const h = header[c];
        if (timeCol === -1 && /^time$|time.*send|^scheduled|^when|timing|send.*time/i.test(h)) timeCol = c;
        else if (channelCol === -1 && /channel|platform|medium/i.test(h)) channelCol = c;
        else if (audienceCol === -1 && /audience|target|recipient|to\b|sent?\s*to/i.test(h)) audienceCol = c;
        else if (typeCol === -1 && /type|heading|category|subject/i.test(h) && !/content|body|text|draft/i.test(h)) typeCol = c;
        else if (contentCol === -1 && /message|content|body|text|template|draft/i.test(h)) contentCol = c;
    }

    // Reclassify: if typeCol actually contains channel names (WhatsApp, Email...), treat as channelCol
    if (typeCol >= 0 && channelCol === -1 && rows.length > 1) {
        let channelCount = 0;
        for (let r = 1; r < Math.min(4, rows.length); r++) {
            const val = (rows[r][typeCol] || '').toLowerCase().trim();
            if (CHANNEL_NAMES.has(val) || val.startsWith('whatsapp') || val.startsWith('email') || val.startsWith('sms')) {
                channelCount++;
            }
        }
        if (channelCount >= 2) {
            channelCol = typeCol;
            typeCol = -1;
            console.log(`[SOP] Reclassified type→channel column ${channelCol} (contains channel names)`);
        }
    }

    // Auto-detect content column: pick the widest column not already assigned
    if (contentCol === -1 && rows.length > 1) {
        const dataRow = rows[1];
        let maxLen = 0, maxIdx = -1;
        for (let c = 0; c < dataRow.length; c++) {
            if (c === typeCol || c === timeCol || c === channelCol || c === audienceCol) continue;
            if (dataRow[c].length > maxLen) { maxLen = dataRow[c].length; maxIdx = c; }
        }
        if (maxLen > 30 && maxIdx >= 0) contentCol = maxIdx;
    }

    console.log(`[SOP] Message columns: type=${typeCol} channel=${channelCol} audience=${audienceCol} time=${timeCol} content=${contentCol}`);

    if (contentCol < 0) {
        // Last resort: try heuristic detection for tables with message-like content
        return parseMessageTableHeuristic(rows, rawRows, sectionHeading);
    }

    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const raw = rawRows[r];

        const typeValue = typeCol >= 0 && row.length > typeCol ? row[typeCol]?.trim() || '' : '';
        const audience = audienceCol >= 0 && row.length > audienceCol ? row[audienceCol]?.trim() || '' : '';
        const content = raw && raw.length > contentCol ? raw[contentCol]?.trim() || '' : '';
        const time = timeCol >= 0 && row.length > timeCol ? row[timeCol]?.trim() || '' : '';
        const channelValue = channelCol >= 0 && row.length > channelCol ? row[channelCol]?.trim() || '' : '';

        // Skip empty/malformed rows
        if (!content || content.length < 5) continue;

        let channel = channelValue || detectChannel(typeValue + ' ' + sectionHeading);

        // Build title: prefer type, then audience, then channel+time
        let title = typeValue;
        if (!title && audience) title = audience;
        if (!title && channel && time) title = `${channel} — ${time}`;
        if (!title && channel) title = channel;
        if (!title) title = sectionHeading || 'Message';

        const timeMatch = (time || title).match(/(\d{1,2}[:.]\d{2}\s*(?:AM|PM)?)/i);
        messages.push({
            title, content,
            section: sectionHeading,
            channel,
            scheduled_time: timeMatch?.[1] || time || ''
        });
    }

    return messages;
}

/** Heuristic fallback for tables where no content column was identified by headers */
function parseMessageTableHeuristic(rows: string[][], rawRows: string[][], sectionHeading: string): ParsedMessage[] {
    const messages: ParsedMessage[] = [];
    const MSG_PATTERN = /\b(hi |hello |dear |greetings|thank you|regards|sincerely|kindly|welcome|invitation|congratulations)\b/i;

    for (let r = 1; r < rows.length; r++) {
        const raw = rawRows[r];
        const row = rows[r];
        if (!raw || raw.length === 0) continue;

        // Find the longest cell — likely the message content
        let longestIdx = 0, longestLen = 0;
        for (let c = 0; c < raw.length; c++) {
            if (raw[c].length > longestLen) { longestLen = raw[c].length; longestIdx = c; }
        }

        if (longestLen > 50 && MSG_PATTERN.test(raw[longestIdx])) {
            let title = '';
            for (let c = 0; c < row.length; c++) {
                if (c !== longestIdx && row[c].length > 1 && row[c].length < 100) {
                    title = row[c]; break;
                }
            }
            title = title || sectionHeading || `Row ${r}`;
            messages.push({
                title, content: raw[longestIdx],
                section: sectionHeading,
                channel: detectChannel(title),
                scheduled_time: ''
            });
        }
    }

    return messages;
}


// ═══════════════════════════════════════════════════════════════════════════════
// RAW TEXT PARSERS — fallback when HTML tables aren't available
// ═══════════════════════════════════════════════════════════════════════════════

function isSectionHeading(text: string): boolean {
    const cleaned = text.replace(/^\d+\.\s*/, '').trim();
    if (cleaned.length < 3 || cleaned.length > 120) return false;
    if (PURE_HEADER_WORDS.has(cleaned.toLowerCase())) return false;
    return /task|event|message|phase|day|night|submission|checklist|pre[- ]|post[- ]|during|communication/i.test(cleaned)
        || /^[A-Z][A-Z\s\-_]+$/.test(cleaned);
}

function isTableHeaderWord(line: string): boolean {
    const l = line.toLowerCase().trim();
    return PURE_HEADER_WORDS.has(l) || /^task\s+category$/i.test(l);
}

function parseRawTextToChecklist(text: string): ChecklistItem[] {
    if (!text || text.trim().length < 5) return [];

    const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
    const items: ChecklistItem[] = [];
    let currentSection = '';
    let inMessageSection = false;
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (isTableHeaderWord(line)) { i++; continue; }

        if (isSectionHeading(line)) {
            const sectionName = line.replace(/^\d+\.\s*/, '').replace(/\s*\(.*?\)\s*$/, '').trim();
            if (isMessageSection(line)) {
                inMessageSection = true;
            } else {
                inMessageSection = false;
                currentSection = sectionName;
            }
            i++; continue;
        }

        if (line.length < 60 && isMessageSection(line)) {
            inMessageSection = true;
            i++; continue;
        }

        if (inMessageSection) { i++; continue; }
        if (line.length < 4) { i++; continue; }
        if (/^(task\s+category|simple\s+operations|phase\s+focus)$/i.test(line)) { i++; continue; }

        // Skip message-like content
        const ll = line.toLowerCase();
        if (/^whatsapp\b/i.test(line) || /^email\b/i.test(line) || /^sms\b/i.test(line)
            || /^social\b/i.test(line) || (ll.includes('whatsapp') && /\d{1,2}[:.]\d{2}\s*(am|pm)/i.test(ll))) {
            i++; continue;
        }

        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
        const nextIsHeader = nextLine ? isTableHeaderWord(nextLine) : true;
        const nextIsSection = nextLine ? isSectionHeading(nextLine) : true;

        // Merge short line with following longer line (task name + description pattern)
        if (line.length < 80 && nextLine && !nextIsHeader && !nextIsSection
            && nextLine.length > line.length && nextLine.length > 15
            && !isTableHeaderWord(line)) {
            items.push({ title: `${line} — ${nextLine}`, section: currentSection, owner: '' });
            i += 2;
            continue;
        }

        if (line.length >= 5 && !isTableHeaderWord(line)) {
            items.push({ title: line, section: currentSection, owner: '' });
        }
        i++;
    }

    return items.slice(0, 200);
}

function parseMessagesFromText(text: string): ParsedMessage[] {
    if (!text || text.trim().length < 10) return [];

    const messages: ParsedMessage[] = [];
    const lines = text.split(/\n/).map(l => l.trim());
    let inMessageSection = false;
    let sectionHeading = '';
    let currentSubHeading = '';
    let currentContent: string[] = [];

    function flushMessage() {
        if (currentContent.length > 0) {
            const title = currentSubHeading || sectionHeading || 'Message';
            const timeMatch = title.match(/(\d{1,2}[:.]\d{2}\s*(?:AM|PM)?)/i);
            messages.push({
                title, content: currentContent.join('\n'),
                section: sectionHeading,
                channel: detectChannel(sectionHeading + ' ' + title),
                scheduled_time: timeMatch?.[1] || ''
            });
            currentContent = [];
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (isSectionHeading(line) || (line.length < 60 && isMessageSection(line))) {
            if (isMessageSection(line)) {
                inMessageSection = true;
                flushMessage();
                sectionHeading = line.replace(/^\d+\.\s*/, '').trim();
                currentSubHeading = '';
            } else {
                if (inMessageSection) flushMessage();
                inMessageSection = false;
            }
            continue;
        }

        if (!inMessageSection) continue;
        if (isTableHeaderWord(line)) continue;

        if (line.length > 5) {
            const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
            if (line.length < 50 && nextLine.length > line.length * 1.5 && nextLine.length > 20) {
                flushMessage();
                currentSubHeading = line;
            } else {
                currentContent.push(line);
            }
        }
    }

    flushMessage();
    return messages.slice(0, 100);
}
