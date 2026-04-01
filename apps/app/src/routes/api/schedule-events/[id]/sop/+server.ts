import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addSOPDocument, getSOPDocuments, deleteSOPDocument, addEventChecklistItemsBulk, addEventMessagesBulk, deleteEventChecklistItemsByEvent, deleteEventMessagesByEvent } from '@uniconnect/shared';
import mammoth from 'mammoth';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);
    const docs = await getSOPDocuments(params.id);
    return json(docs);
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);

    let contentText = '';
    let contentHtml = '';
    let checklistItems: { title: string; section: string; owner: string }[] = [];
    let filename = 'document.txt';

    const contentType = request.headers.get('content-type') || '';

    // mode: 'view' = just save document for viewing, 'generate' = save + generate checklist
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

                // Always get both HTML and raw text — HTML preserves formatting for viewing
                const [htmlResult, textResult] = await Promise.all([
                    mammoth.convertToHtml({ buffer }),
                    mammoth.extractRawText({ buffer })
                ]);

                contentText = textResult.value;
                contentHtml = htmlResult.value;

                console.log(`[SOP_UPLOAD] Mammoth HTML length: ${contentHtml.length}, text length: ${contentText.length}`);

                // Debug: dump document structure
                debugDocStructure(contentHtml);

                if (mode === 'generate') {
                    // Try HTML table parsing first
                    checklistItems = parseHTMLTables(contentHtml);
                    console.log(`[SOP_UPLOAD] HTML table parsing found ${checklistItems.length} items`);

                    // If HTML tables didn't yield enough, parse from raw text
                    if (checklistItems.length < 3) {
                        checklistItems = parseRawTextToChecklist(contentText);
                        console.log(`[SOP_UPLOAD] Raw text parsing found ${checklistItems.length} items`);
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
            console.error('[SOP_UPLOAD] File parse error:', e.message);
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

    // Save the document (with HTML if available)
    const doc = await addSOPDocument(params.id, filename, contentText, locals.user.id, contentHtml || undefined);

    // Clear existing checklist items and messages before re-generating
    if (mode === 'generate') {
        await deleteEventChecklistItemsByEvent(params.id);
        await deleteEventMessagesByEvent(params.id);
        console.log(`[SOP_UPLOAD] Cleared existing checklist items and messages for event ${params.id}`);
    }

    // Insert checklist items
    let generatedItems: any[] = [];
    if (checklistItems.length > 0) {
        generatedItems = await addEventChecklistItemsBulk(params.id, checklistItems);
    }

    // Extract and insert messages from the document
    let generatedMessages: any[] = [];
    const messages = contentHtml
        ? parseMessagesFromHTML(contentHtml)
        : parseMessagesFromText(contentText);
    if (messages.length > 0) {
        generatedMessages = await addEventMessagesBulk(params.id, messages);
    }
    console.log(`[SOP_UPLOAD] Messages extracted: ${generatedMessages.length}`);

    // Log section distribution
    const sectionCounts: Record<string, number> = {};
    for (const item of checklistItems) {
        const s = item.section || '(no section)';
        sectionCounts[s] = (sectionCounts[s] || 0) + 1;
    }
    console.log(`[SOP_UPLOAD] Checklist sections:`, JSON.stringify(sectionCounts));

    const msgSectionCounts: Record<string, number> = {};
    for (const msg of messages) {
        const s = msg.section || '(no section)';
        msgSectionCounts[s] = (msgSectionCounts[s] || 0) + 1;
    }
    console.log(`[SOP_UPLOAD] Message sections:`, JSON.stringify(msgSectionCounts));
    console.log(`[SOP_UPLOAD] Message channels:`, messages.map(m => m.channel || '?').join(', '));

    console.log(`[SOP_UPLOAD] Mode: ${mode}, File: ${filename}, ${contentText.length} chars, ${generatedItems.length} checklist items, ${generatedMessages.length} messages`);

    // Auto-create tasks from checklist items if event has assignees
    let autoTasks: any[] = [];
    if (generatedItems.length > 0) {
        try {
            const { getScheduleEventById, createTasksFromEventChecklist } = await import('@uniconnect/shared');
            const event = await getScheduleEventById(params.id);
            const assigneeIds = (event?.assignees || []).map((a: any) => a.id).filter(Boolean);
            if (assigneeIds.length > 0) {
                autoTasks = await createTasksFromEventChecklist(params.id, assigneeIds, locals.user.id);
                console.log(`[SOP_UPLOAD] Auto-created ${autoTasks.length} tasks for ${assigneeIds.length} assignees`);
            }
        } catch (e) {
            console.warn('[SOP_UPLOAD] Auto-task creation failed (non-fatal):', e);
        }
    }

    return json({
        document: doc,
        mode,
        checklist: {
            generated: generatedItems.length,
            items: generatedItems,
            sections: sectionCounts
        },
        messages: {
            generated: generatedMessages.length,
            items: generatedMessages,
            sections: msgSectionCounts
        },
        tasks: {
            generated: autoTasks.length,
            items: autoTasks
        }
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
// DEBUG: Dump document structure to understand mammoth output
// ═══════════════════════════════════════════════════════════════════════════════

function debugDocStructure(html: string) {
    // Extract all headings with their levels
    const headings = [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
    console.log(`[DOC_STRUCTURE] Found ${headings.length} headings:`);
    for (const h of headings) {
        const level = h[1];
        const text = h[2].replace(/<[^>]+>/g, '').trim();
        console.log(`  H${level}: "${text}"`);
    }

    // Extract all tables with their headers and first row
    const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
    console.log(`[DOC_STRUCTURE] Found ${tables.length} tables:`);
    for (let t = 0; t < tables.length; t++) {
        const rows = tables[t].match(/<tr[\s\S]*?<\/tr>/gi) || [];
        if (rows.length > 0) {
            const headerCells = (rows[0].match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [])
                .map(c => c.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
            const firstDataCells = rows.length > 1
                ? (rows[1].match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [])
                    .map(c => c.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().substring(0, 50))
                : [];
            // Find nearest heading before this table
            let nearestH = '(none)';
            const tablePos = html.indexOf(tables[t]);
            for (const h of headings) {
                if ((h.index || 0) < tablePos) nearestH = `H${h[1]}: ${h[2].replace(/<[^>]+>/g, '').trim()}`;
            }
            console.log(`  Table ${t + 1} (${rows.length} rows) under ${nearestH}:`);
            console.log(`    Headers: [${headerCells.join(' | ')}]`);
            console.log(`    Row 1:   [${firstDataCells.join(' | ')}]`);
        }
    }

    // Also show <p> and <strong> near tables to catch non-heading section markers
    const strongMatches = [...html.matchAll(/<(?:p|strong)[^>]*>([\s\S]*?)<\/(?:p|strong)>/gi)];
    const sectionLikeP = strongMatches
        .map(m => m[1].replace(/<[^>]+>/g, '').trim())
        .filter(t => t.length > 3 && t.length < 80 && /task|message|event|day|night|phase|checklist/i.test(t));
    if (sectionLikeP.length > 0) {
        console.log(`[DOC_STRUCTURE] Section-like <p>/<strong> elements:`);
        for (const p of sectionLikeP.slice(0, 20)) console.log(`  "${p}"`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const PURE_HEADER_WORDS = new Set([
    'task', 'task category', 'description', 'phase', 'focus', 'sr no', 's no',
    'sl no', 'serial', 'status', 'priority', 'assignee', 'deadline', 'date',
    'time', 'remarks', 'comments', 'notes', '#', 'objective', 'sub-tasks',
    'sub-tasks (micro level)', 'owner', 'timeline'
]);

/** Detect if text refers to a message section */
function isMessageSection(text: string): boolean {
    return MESSAGE_SECTION_PATTERN.test(text);
}

const MESSAGE_SECTION_PATTERN = /\bmessage|communication|day\s*\d+\s*message|over.?night\s*message/i;

/** Check if text looks like a meaningful section heading (not a table cell or noise) */
function isSectionHeading(text: string): boolean {
    const cleaned = text.replace(/^\d+\.\s*/, '').trim();
    if (cleaned.length < 3 || cleaned.length > 120) return false;
    // Must look like a section name, not a data value
    if (PURE_HEADER_WORDS.has(cleaned.toLowerCase())) return false;
    // Common section patterns: contains keywords like task, event, message, phase, day, etc.
    return /task|event|message|phase|day|night|submission|checklist|pre[- ]|post[- ]|during|communication/i.test(cleaned)
        || /^[A-Z][A-Z\s\-_]+$/.test(cleaned); // ALL CAPS headings
}

/** Detect table type by column headers AND first-row content: 'task' | 'message' | 'unknown' */
function detectTableType(header: string[], dataRows?: string[][]): 'task' | 'message' | 'unknown' {
    const hasChannel = header.some(c => /channel|platform|medium/i.test(c));
    const hasMessageContent = header.some(c => /^message|message\s*content|content|body|text|template|draft/i.test(c));
    const hasAudience = header.some(c => /audience|target|recipient/i.test(c));
    const hasTask = header.some(c => /^task$|task\s*name|task\s*category/i.test(c));
    const hasObjective = header.some(c => /objective/i.test(c));
    const hasSubTasks = header.some(c => /sub.?task/i.test(c));
    const hasOwner = header.some(c => /^owner$/i.test(c));
    const hasTimeline = header.some(c => /^timeline$/i.test(c));
    // Also check header for "type / heading" pattern common in message tables
    const hasTypeHeading = header.some(c => /type\s*\/?\s*heading|type\/heading/i.test(c));

    const messageScore = (hasChannel ? 3 : 0) + (hasMessageContent ? 2 : 0) + (hasAudience ? 2 : 0) + (hasTypeHeading ? 1 : 0);
    const taskScore = (hasTask ? 2 : 0) + (hasObjective ? 2 : 0) + (hasSubTasks ? 3 : 0) + (hasOwner ? 1 : 0) + (hasTimeline ? 1 : 0);

    if (messageScore >= 4) return 'message';
    if (taskScore >= 3) return 'task';
    if (messageScore > taskScore && messageScore >= 2) return 'message';
    if (taskScore > messageScore) return 'task';

    // Content-based fallback: check if first column of data rows contains channel names
    if (dataRows && dataRows.length > 0) {
        const CHANNEL_NAMES = ['whatsapp', 'email', 'sms', 'social media', 'social', 'app notification', 'wa group'];
        let channelCount = 0;
        const checkRows = dataRows.slice(0, Math.min(5, dataRows.length));
        for (const row of checkRows) {
            const firstVal = (row[0] || '').toLowerCase().trim();
            if (CHANNEL_NAMES.some(cn => firstVal === cn || firstVal.startsWith(cn))) channelCount++;
        }
        if (channelCount >= 2) {
            console.log(`[SOP_PARSER] Content-based detection: found ${channelCount} channel names in first column → message table`);
            return 'message';
        }
    }

    return 'unknown';
}

/** Extract rows from an HTML table as plain text cells */
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

/** Extract rows from an HTML table preserving formatting (for message content) */
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

function isTableHeaderWord(line: string): boolean {
    const l = line.toLowerCase().trim();
    return PURE_HEADER_WORDS.has(l) || /^task\s+category$/i.test(l);
}


// ═══════════════════════════════════════════════════════════════════════════════
// RAW TEXT PARSER — fallback for when HTML tables aren't available
// ═══════════════════════════════════════════════════════════════════════════════

function parseRawTextToChecklist(text: string): { title: string; section: string; owner: string }[] {
    if (!text || text.trim().length < 5) return [];

    const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
    const items: { title: string; section: string; owner: string }[] = [];
    let currentTabSection = '';
    let inMessageSection = false;
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (isTableHeaderWord(line)) { i++; continue; }

        // Check for section headings
        if (isSectionHeading(line)) {
            const sectionName = line.replace(/^\d+\.\s*/, '').replace(/\s*\(.*?\)\s*$/, '').trim();
            if (isMessageSection(line)) {
                inMessageSection = true;
            } else {
                inMessageSection = false;
                currentTabSection = sectionName;
            }
            i++; continue;
        }

        // Non-section headings that are message sections
        if (line.length < 60 && isMessageSection(line)) {
            inMessageSection = true;
            i++; continue;
        }

        if (inMessageSection) { i++; continue; }
        if (line.length < 4) { i++; continue; }
        if (/^(task\s+category|simple\s+operations|phase\s+focus)$/i.test(line)) { i++; continue; }

        // Skip message-like content lines
        const ll = line.toLowerCase();
        if (/^whatsapp\b/i.test(line) || /^email\b/i.test(line) || /^sms\b/i.test(line)
            || /^social\b/i.test(line) || (ll.includes('whatsapp') && /\d{1,2}[:.]\d{2}\s*(am|pm)/i.test(ll))) {
            i++; continue;
        }

        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
        const nextIsHeader = nextLine ? isTableHeaderWord(nextLine) : true;
        const nextIsTab = nextLine ? isSectionHeading(nextLine) : true;

        if (line.length < 80 && nextLine && !nextIsHeader && !nextIsTab
            && nextLine.length > line.length && nextLine.length > 15
            && !isTableHeaderWord(line)) {
            items.push({ title: `${line} — ${nextLine}`, section: currentTabSection, owner: '' });
            i += 2;
            continue;
        }

        if (line.length >= 5 && !isTableHeaderWord(line)) {
            items.push({ title: line, section: currentTabSection, owner: '' });
        }
        i++;
    }

    return items.slice(0, 200);
}


// ═══════════════════════════════════════════════════════════════════════════════
// HTML TABLE PARSER — uses column headers to detect task vs message tables
// Only extracts TASK tables as checklist items. Message tables are skipped.
// ═══════════════════════════════════════════════════════════════════════════════

function parseHTMLTables(html: string): { title: string; section: string; owner: string }[] {
    const items: { title: string; section: string; owner: string }[] = [];
    let currentSection = '';

    // Split HTML into headings, bold paragraphs, and tables
    // Also capture <p> containing <strong> as potential section markers
    const parts = html.split(/(<table[\s\S]*?<\/table>|<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<p[^>]*>\s*<strong>[\s\S]*?<\/strong>\s*<\/p>)/gi);

    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        // Track headings (any level)
        const headingMatch = trimmed.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
        if (headingMatch) {
            const text = stripHTML(headingMatch[1]).trim();
            if (text.length > 2 && text.length < 120) {
                if (isMessageSection(text)) {
                    currentSection = '__messages__';
                } else if (isSectionHeading(text)) {
                    currentSection = text.replace(/^\d+\.\s*/, '').replace(/\s*\(.*?\)\s*$/, '').trim();
                    console.log(`[SOP_PARSER] Section from heading: "${currentSection}"`);
                }
            }
            continue;
        }

        // Track bold paragraphs as section markers (mammoth often renders Google Doc tab names as <p><strong>)
        const boldPMatch = trimmed.match(/<p[^>]*>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>/i);
        if (boldPMatch && !/<table/i.test(trimmed)) {
            const text = stripHTML(boldPMatch[1]).trim();
            if (text.length > 2 && text.length < 120) {
                if (isMessageSection(text)) {
                    currentSection = '__messages__';
                    console.log(`[SOP_PARSER] Message section from bold: "${text}"`);
                } else if (isSectionHeading(text)) {
                    currentSection = text.replace(/^\d+\.\s*/, '').replace(/\s*\(.*?\)\s*$/, '').trim();
                    console.log(`[SOP_PARSER] Section from bold: "${currentSection}"`);
                }
            }
            continue;
        }

        // Skip tables in message sections
        if (currentSection === '__messages__') continue;

        if (/<table/i.test(trimmed)) {
            const rows = extractTableRows(trimmed);
            if (rows.length < 2) continue;

            const header = rows[0].map(h => h.toLowerCase().trim());
            const dataRows = rows.slice(1);
            const tableType = detectTableType(header, dataRows);

            // Skip message tables — the message parser handles them
            if (tableType === 'message') {
                console.log(`[SOP_PARSER] Skipping message table in section "${currentSection}" (headers: ${header.join(', ')})`);
                continue;
            }

            // Parse as task/checklist table
            const tableItems = parseTaskTable(rows, currentSection);
            items.push(...tableItems);
        }
    }

    return items;
}

/** Parse a task table into checklist items with section and owner */
function parseTaskTable(rows: string[][], section: string): { title: string; section: string; owner: string }[] {
    const items: { title: string; section: string; owner: string }[] = [];
    const header = rows[0].map(h => h.toLowerCase().trim());

    let taskCol = -1, descCol = -1, subTasksCol = -1, ownerCol = -1, catCol = -1;
    for (let c = 0; c < header.length; c++) {
        const h = header[c];
        if (taskCol === -1 && (/^task$/i.test(h) || /task\s*name/i.test(h))) taskCol = c;
        else if (descCol === -1 && /objective|description|detail|explanation/i.test(h)) descCol = c;
        else if (subTasksCol === -1 && /sub.?task/i.test(h)) subTasksCol = c;
        else if (ownerCol === -1 && /^owner$|responsible|assigned\s*to/i.test(h)) ownerCol = c;
        else if (catCol === -1 && /category|type|phase|group/i.test(h)) catCol = c;
    }

    // Fallback column detection if no explicit task column
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

// Preserves newlines, spacing, emojis — used for message content
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


// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE PARSER — detects message tables by column headers (not just headings)
// This ensures message tables are found even under non-message headings.
// ═══════════════════════════════════════════════════════════════════════════════

type ParsedMessage = { title: string; content: string; section: string; channel: string; scheduled_time: string };

function detectChannel(text: string): string {
    const t = text.toLowerCase();
    if (t.includes('whatsapp') || t.includes('wa ')) return 'WhatsApp';
    if (t.includes('email') || t.includes('mail')) return 'Email';
    if (t.includes('sms')) return 'SMS';
    if (t.includes('app') && t.includes('notification')) return 'App Notification';
    if (t.includes('social') || t.includes('instagram') || t.includes('linkedin')) return 'Social Media';
    return '';
}

function parseMessagesFromHTML(html: string): ParsedMessage[] {
    const messages: ParsedMessage[] = [];
    let currentSection = '';

    // Split on headings, bold paragraphs, tables, and regular paragraphs
    const parts = html.split(/(<table[\s\S]*?<\/table>|<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<p[^>]*>\s*<strong>[\s\S]*?<\/strong>\s*<\/p>|<p[^>]*>[\s\S]*?<\/p>)/gi);

    let inMessageSection = false;
    let currentSubHeading = '';

    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        // Headings
        const headingMatch = trimmed.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
        if (headingMatch) {
            const text = stripHTML(headingMatch[1]).trim();
            if (isMessageSection(text)) {
                currentSection = text.replace(/^\d+\.\s*/, '').replace(/\s*\(.*?\)\s*$/, '').trim();
                inMessageSection = true;
                currentSubHeading = '';
                console.log(`[SOP_MSG_PARSER] Entered message section (heading): "${currentSection}"`);
            } else if (isSectionHeading(text)) {
                currentSection = text.replace(/^\d+\.\s*/, '').replace(/\s*\(.*?\)\s*$/, '').trim();
                inMessageSection = false;
                currentSubHeading = '';
            } else if (inMessageSection && text.length > 2) {
                currentSubHeading = text;
            }
            continue;
        }

        // Bold paragraphs as section markers
        const boldPMatch = trimmed.match(/<p[^>]*>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>/i);
        if (boldPMatch && !/<table/i.test(trimmed)) {
            const text = stripHTML(boldPMatch[1]).trim();
            if (text.length > 2 && text.length < 120) {
                if (isMessageSection(text)) {
                    currentSection = text.replace(/^\d+\.\s*/, '').replace(/\s*\(.*?\)\s*$/, '').trim();
                    inMessageSection = true;
                    currentSubHeading = '';
                    console.log(`[SOP_MSG_PARSER] Entered message section (bold): "${currentSection}"`);
                } else if (isSectionHeading(text)) {
                    currentSection = text.replace(/^\d+\.\s*/, '').replace(/\s*\(.*?\)\s*$/, '').trim();
                    inMessageSection = false;
                    currentSubHeading = '';
                }
            }
            continue;
        }

        // Paragraph content inside message sections
        if (inMessageSection) {
            const pMatch = trimmed.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
            if (pMatch) {
                const text = stripHTMLPreserveFormat(pMatch[1]).trim();
                if (text.length > 10) {
                    const title = currentSubHeading || currentSection || 'Message';
                    const timeMatch = title.match(/(\d{1,2}[:.]\d{2}\s*(?:AM|PM)?)/i);
                    messages.push({
                        title, content: text,
                        section: currentSection,
                        channel: detectChannel(currentSection + ' ' + title),
                        scheduled_time: timeMatch?.[1] || ''
                    });
                }
                continue;
            }
        }

        // For tables: detect type by column headers regardless of section context
        if (/<table/i.test(trimmed)) {
            const rows = extractTableRows(trimmed);
            const rawRows = extractTableRowsRaw(trimmed);
            if (rows.length < 2) continue;

            const header = rows[0].map(h => h.toLowerCase().trim());
            const dataRows = rows.slice(1);
            const tableType = detectTableType(header, dataRows);

            if (tableType === 'message' || (inMessageSection && tableType !== 'task')) {
                const sectionForMessages = currentSection || 'Messages';
                const tableMessages = parseMessageTableFromRows(rows, rawRows, sectionForMessages);
                console.log(`[SOP_PARSER] Found message table in "${currentSection}" → ${tableMessages.length} messages (headers: ${header.join(', ')})`);
                messages.push(...tableMessages);
            }
        }
    }

    // Fallback: scan ALL tables for message-type tables (if nothing found via heading context)
    if (messages.length === 0) {
        console.log(`[SOP_PARSER] No messages found via headings, scanning all tables by column headers...`);
        const allTables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
        const headings = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)];

        for (const table of allTables) {
            const rows = extractTableRows(table);
            const rawRows = extractTableRowsRaw(table);
            if (rows.length < 2) continue;

            const header = rows[0].map(h => h.toLowerCase().trim());
            const dataRows = rows.slice(1);
            if (detectTableType(header, dataRows) === 'message') {
                // Find nearest heading for section name
                let nearestHeading = 'Messages';
                const tablePos = html.indexOf(table);
                for (const h of headings) {
                    if ((h.index || 0) < tablePos) nearestHeading = stripHTML(h[1]).trim();
                }
                const tableMessages = parseMessageTableFromRows(rows, rawRows, nearestHeading);
                messages.push(...tableMessages);
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

    console.log(`[SOP_PARSER] Total unique messages: ${unique.length}`);
    return unique.slice(0, 100);
}

/** Parse a message table from pre-extracted rows */
function parseMessageTableFromRows(rows: string[][], rawRows: string[][], sectionHeading: string): ParsedMessage[] {
    const messages: ParsedMessage[] = [];
    const header = rows[0].map(h => h.toLowerCase().trim());

    let typeCol = -1, contentCol = -1, timeCol = -1, channelCol = -1, audienceCol = -1;
    for (let c = 0; c < header.length; c++) {
        const h = header[c];
        if (timeCol === -1 && /^time$|time.*send|^scheduled|^when|timing|send.*time/i.test(h)) timeCol = c;
        else if (channelCol === -1 && /channel|platform|medium/i.test(h)) channelCol = c;
        else if (audienceCol === -1 && /audience|target|recipient|to\b|sent?\s*to/i.test(h)) audienceCol = c;
        else if (typeCol === -1 && /type|heading|category|subject/i.test(h) && !/content|body|text|draft/i.test(h)) typeCol = c;
        else if (contentCol === -1 && /message|content|body|text|template|draft/i.test(h)) contentCol = c;
    }

    // Check if typeCol actually contains channel names (WhatsApp, Email, etc.)
    // If so, treat it as the channel column instead
    const CHANNEL_NAMES_SET = new Set(['whatsapp', 'email', 'sms', 'social media', 'social', 'app notification', 'wa group', 'wa']);
    if (typeCol >= 0 && channelCol === -1 && rows.length > 1) {
        let isChannel = 0;
        for (let r = 1; r < Math.min(4, rows.length); r++) {
            const val = (rows[r][typeCol] || '').toLowerCase().trim();
            if (CHANNEL_NAMES_SET.has(val) || val.startsWith('whatsapp') || val.startsWith('email') || val.startsWith('sms')) isChannel++;
        }
        if (isChannel >= 2) {
            channelCol = typeCol;
            typeCol = -1;
            console.log(`[SOP_PARSER] Reclassified type column ${channelCol} as channel (contains channel names)`);
        }
    }

    // Auto-detect content column as widest if not found by header
    if (contentCol === -1 && rows.length > 1) {
        const dataRow = rows[1];
        let maxLen = 0, maxIdx = -1;
        for (let c = 0; c < dataRow.length; c++) {
            if (c === typeCol || c === timeCol || c === channelCol || c === audienceCol) continue;
            if (dataRow[c].length > maxLen) { maxLen = dataRow[c].length; maxIdx = c; }
        }
        if (maxLen > 30 && maxIdx >= 0) contentCol = maxIdx;
    }

    console.log(`[SOP_PARSER] Message table columns: type=${typeCol}, channel=${channelCol}, audience=${audienceCol}, time=${timeCol}, content=${contentCol} (headers: ${header.join(' | ')})`);

    if (contentCol < 0) return messages;

    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const raw = rawRows[r];

        const typeValue = typeCol >= 0 && row.length > typeCol ? row[typeCol]?.trim() || '' : '';
        const audience = audienceCol >= 0 && row.length > audienceCol ? row[audienceCol]?.trim() || '' : '';
        const content = raw && raw.length > contentCol ? raw[contentCol]?.trim() || '' : '';
        const time = timeCol >= 0 && row.length > timeCol ? row[timeCol]?.trim() || '' : '';
        const channelValue = channelCol >= 0 && row.length > channelCol ? row[channelCol]?.trim() || '' : '';

        // Resolve channel: from column data, or detect from text
        let channel = channelValue || detectChannel(typeValue + ' ' + sectionHeading);

        // Build a meaningful title: use type value, or audience, or channel+time combo
        let title = typeValue;
        if (!title && audience) title = audience;
        if (!title && channel && time) title = `${channel} — ${time}`;
        if (!title && channel) title = channel;
        if (!title) title = sectionHeading || 'Message';

        if (content.length > 5) {
            const timeMatch = (time || title).match(/(\d{1,2}[:.]\d{2}\s*(?:AM|PM)?)/i);
            messages.push({
                title, content,
                section: sectionHeading,
                channel,
                scheduled_time: timeMatch?.[1] || time || ''
            });
        }
    }

    // Heuristic fallback for tables without clear content column
    if (contentCol === -1 && messages.length === 0) {
        const MSG_PATTERN = /\b(hi |hello |dear |greetings|thank you|regards|sincerely|kindly|welcome|invitation|congratulations)\b/i;
        for (let r = 1; r < rows.length; r++) {
            const raw = rawRows[r];
            const row = rows[r];
            if (!raw || raw.length === 0) continue;
            let longestIdx = 0, longestLen = 0;
            for (let c = 0; c < raw.length; c++) {
                if (raw[c].length > longestLen) { longestLen = raw[c].length; longestIdx = c; }
            }
            if (longestLen > 50 && MSG_PATTERN.test(raw[longestIdx])) {
                let title = '';
                for (let c = 0; c < row.length; c++) {
                    if (c !== longestIdx && row[c].length > 1 && row[c].length < 100) { title = row[c]; break; }
                }
                title = title || sectionHeading || `Row ${r}`;
                messages.push({ title, content: raw[longestIdx], section: sectionHeading, channel: detectChannel(title), scheduled_time: '' });
            }
        }
    }

    return messages;
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
