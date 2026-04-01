import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addSOPDocument, getSOPDocuments, deleteSOPDocument, addEventChecklistItemsBulk, addEventMessagesBulk } from '@uniconnect/shared';
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
    let checklistItems: { title: string; section: string }[] = [];
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

    // Insert checklist items
    let generatedItems: any[] = [];
    if (checklistItems.length > 0) {
        generatedItems = await addEventChecklistItemsBulk(params.id, checklistItems);
    }

    // Extract and insert messages from the document (both modes now)
    let generatedMessages: any[] = [];
    const messages = contentHtml
        ? parseMessagesFromHTML(contentHtml)
        : parseMessagesFromText(contentText);
    if (messages.length > 0) {
        generatedMessages = await addEventMessagesBulk(params.id, messages);
    }
    console.log(`[SOP_UPLOAD] Messages extracted: ${generatedMessages.length}`);

    console.log(`[SOP_UPLOAD] Mode: ${mode}, File: ${filename}, ${contentText.length} chars, ${generatedItems.length} checklist items, ${generatedMessages.length} messages`);

    return json({
        document: doc,
        mode,
        checklist: {
            generated: generatedItems.length,
            items: generatedItems
        },
        messages: {
            generated: generatedMessages.length,
            items: generatedMessages
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
// RAW TEXT PARSER — works for mammoth raw text, PDF text, plain text
// Mammoth raw text from tables: each cell becomes its own line.
// Strategy: detect section headers, then pair task lines with description lines.
// ═══════════════════════════════════════════════════════════════════════════════

const PURE_HEADER_WORDS = new Set([
    'task', 'task category', 'description', 'phase', 'focus', 'sr no', 's no',
    'sl no', 'serial', 'status', 'priority', 'assignee', 'deadline', 'date',
    'time', 'remarks', 'comments', 'notes', '#'
]);

function isSectionHeader(line: string): boolean {
    // "1. Pre-Event Tasks (Preparation Phase)" or "Pre-Event Tasks" etc.
    return /^(\d+\.\s+)?[\w\s/\-]+(tasks?|phase|checklist|timeline)\s*(\(.*\))?$/i.test(line);
}

function isTableHeader(line: string): boolean {
    const l = line.toLowerCase().trim();
    return PURE_HEADER_WORDS.has(l) || /^task\s+category$/i.test(l);
}

function parseRawTextToChecklist(text: string): { title: string; section: string }[] {
    if (!text || text.trim().length < 5) return [];

    const lines = text.split(/\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0);

    const items: { title: string; section: string }[] = [];
    let currentSection = '';
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Skip pure table header words
        if (isTableHeader(line)) { i++; continue; }

        // Detect section headers
        if (isSectionHeader(line)) {
            currentSection = line.replace(/^\d+\.\s*/, '').replace(/\s*\(.*?\)\s*$/, '').trim();
            i++;
            continue;
        }

        if (line.length < 4) { i++; continue; }
        if (/^(task\s+category|simple\s+operations|phase\s+focus)$/i.test(line)) { i++; continue; }

        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
        const nextIsTableHeader = nextLine ? isTableHeader(nextLine) : true;
        const nextIsSection = nextLine ? isSectionHeader(nextLine) : true;

        if (line.length < 80 && nextLine && !nextIsTableHeader && !nextIsSection
            && nextLine.length > line.length && nextLine.length > 15
            && !isTableHeader(line)) {
            items.push({ title: `${line} — ${nextLine}`, section: currentSection });
            i += 2;
            continue;
        }

        if (line.length >= 5 && !isTableHeader(line)) {
            items.push({ title: line, section: currentSection });
        }

        i++;
    }

    return items.slice(0, 200);
}


// ═══════════════════════════════════════════════════════════════════════════════
// HTML TABLE PARSER — works when mammoth preserves table structure
// ═══════════════════════════════════════════════════════════════════════════════

function parseHTMLTables(html: string): { title: string; section: string }[] {
    const items: { title: string; section: string }[] = [];
    let currentSection = '';

    const parts = html.split(/(<table[\s\S]*?<\/table>|<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>)/gi);

    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const headingMatch = trimmed.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
        if (headingMatch) {
            const text = stripHTML(headingMatch[1]).trim();
            if (text.length > 2 && isSectionHeader(text)) {
                currentSection = text.replace(/^\d+\.\s*/, '').replace(/\s*\(.*?\)\s*$/, '').trim();
            }
            continue;
        }

        if (/<table/i.test(trimmed)) {
            const tableItems = parseOneTable(trimmed, currentSection);
            items.push(...tableItems);
        }
    }

    return items;
}

function parseOneTable(tableHtml: string, section: string): { title: string; section: string }[] {
    const items: { title: string; section: string }[] = [];
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

    if (rows.length < 2) return items;

    const header = rows[0].map(h => h.toLowerCase().trim());

    let taskCol = -1, descCol = -1, catCol = -1;
    for (let c = 0; c < header.length; c++) {
        const h = header[c];
        if (/^task$/i.test(h) || /task\s*name/i.test(h)) taskCol = c;
        else if (/description|detail|explanation|objective|sub.?tasks?/i.test(h)) descCol = c;
        else if (/category|type|phase|group/i.test(h)) catCol = c;
    }

    if (taskCol === -1) {
        if (header.length >= 3) {
            catCol = catCol === -1 ? 0 : catCol;
            taskCol = 1;
            descCol = descCol === -1 ? 2 : descCol;
        } else if (header.length === 2) {
            taskCol = 0;
            descCol = 1;
        } else {
            taskCol = 0;
        }
    }

    let lastCategory = '';
    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (row.length <= taskCol) continue;

        const taskName = row[taskCol]?.trim() || '';
        const taskDesc = descCol >= 0 && row.length > descCol ? row[descCol]?.trim() || '' : '';
        const category = catCol >= 0 && row.length > catCol ? row[catCol]?.trim() || '' : '';

        if (!taskName || taskName.length < 2) continue;
        if (PURE_HEADER_WORDS.has(taskName.toLowerCase())) continue;

        if (category && category.length > 1) lastCategory = category;

        const sectionLabel = section || lastCategory;
        let title = taskName;
        if (taskDesc && taskDesc.length > 2) title += ` — ${taskDesc}`;

        if (title.length > 3) items.push({ title: title.trim(), section: sectionLabel });
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
// MESSAGE PARSER — detects sections titled "Messages", "Communication", etc.
// Extracts message blocks with title + content for communication tasks.
// ═══════════════════════════════════════════════════════════════════════════════

const MESSAGE_SECTION_PATTERN = /message|communication|email|whatsapp|sms|notification|announce|broadcast|template/i;

function isMessageSection(text: string): boolean {
    return MESSAGE_SECTION_PATTERN.test(text);
}

type ParsedMessage = { title: string; content: string; section: string; channel: string; scheduled_time: string };

function parseMessagesFromHTML(html: string): ParsedMessage[] {
    const messages: ParsedMessage[] = [];
    let inMessageSection = false;
    let sectionHeading = '';
    let currentSubHeading = '';

    const headings = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
    const parts = html.split(/(<table[\s\S]*?<\/table>|<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<p[^>]*>[\s\S]*?<\/p>)/gi);

    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const headingMatch = trimmed.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
        if (headingMatch) {
            const text = stripHTML(headingMatch[1]).trim();
            if (isMessageSection(text)) {
                inMessageSection = true;
                sectionHeading = text;
                currentSubHeading = '';
                continue;
            } else if (inMessageSection && text.length > 2) {
                currentSubHeading = text;
                continue;
            }
            if (!isMessageSection(text) && text.length > 2) {
                inMessageSection = false;
            }
            continue;
        }

        if (!inMessageSection) continue;

        const pMatch = trimmed.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        if (pMatch) {
            const text = stripHTMLPreserveFormat(pMatch[1]).trim();
            if (text.length > 10) {
                const title = currentSubHeading || sectionHeading || 'Message';
                // Try to extract time from title like "8:00 AM — Morning briefing"
                const timeMatch = title.match(/(\d{1,2}[:.]\d{2}\s*(?:AM|PM)?)/i);
                messages.push({
                    title, content: text,
                    section: sectionHeading,
                    channel: detectChannel(sectionHeading + ' ' + title),
                    scheduled_time: timeMatch?.[1] || ''
                });
            }
            continue;
        }

        if (/<table/i.test(trimmed)) {
            const tableMessages = parseMessageTable(trimmed, sectionHeading);
            messages.push(...tableMessages);
        }
    }

    if (messages.length === 0) {
        const allTables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
        for (let t = 0; t < allTables.length; t++) {
            const table = allTables[t];
            let nearestHeading = '';
            const tablePos = html.indexOf(table);
            for (const h of headings) {
                const hPos = h.index || 0;
                if (hPos < tablePos) nearestHeading = stripHTML(h[1]).trim();
            }
            const tableMessages = parseMessageTable(table, nearestHeading);
            messages.push(...tableMessages);
        }
    }

    return messages.slice(0, 100);
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

function parseMessageTable(tableHtml: string, sectionHeading: string): ParsedMessage[] {
    const messages: ParsedMessage[] = [];
    const rows: string[][] = [];
    const rawCells: string[][] = [];
    const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    for (const row of rowMatches) {
        const cells: string[] = [];
        const cellsRaw: string[] = [];
        const cellMatches = row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
        for (const cell of cellMatches) {
            cells.push(stripHTML(cell).trim());
            cellsRaw.push(stripHTMLPreserveFormat(cell).trim());
        }
        if (cells.length > 0) { rows.push(cells); rawCells.push(cellsRaw); }
    }

    if (rows.length < 2) return messages;

    const header = rows[0].map(h => h.toLowerCase().trim());

    let typeCol = -1, contentCol = -1, timeCol = -1, channelCol = -1;
    for (let c = 0; c < header.length; c++) {
        const h = header[c];
        if (timeCol === -1 && /^time$|^scheduled|^when/i.test(h)) timeCol = c;
        else if (channelCol === -1 && /channel|platform|medium/i.test(h)) channelCol = c;
        else if (typeCol === -1 && /type|heading|category|subject/i.test(h) && !/content|body|text|draft/i.test(h)) typeCol = c;
        else if (contentCol === -1 && /message|content|body|text|template|draft/i.test(h)) contentCol = c;
    }

    if (contentCol >= 0) {
        for (let r = 1; r < rows.length; r++) {
            const row = rows[r];
            const raw = rawCells[r];
            const typeValue = typeCol >= 0 && row.length > typeCol ? row[typeCol]?.trim() || '' : '';
            const title = typeValue || sectionHeading || 'Message';
            const content = raw && raw.length > contentCol ? raw[contentCol]?.trim() || '' : '';
            const time = timeCol >= 0 && row.length > timeCol ? row[timeCol]?.trim() || '' : '';
            const channel = channelCol >= 0 && row.length > channelCol ? row[channelCol]?.trim() || '' : '';
            if (content.length > 5) {
                const timeMatch = (time || title).match(/(\d{1,2}[:.]\d{2}\s*(?:AM|PM)?)/i);
                messages.push({
                    title, content,
                    section: sectionHeading,
                    channel: channel || detectChannel(sectionHeading + ' ' + title),
                    scheduled_time: timeMatch?.[1] || time || ''
                });
            }
        }
    }

    // Heuristic fallback
    if (contentCol === -1 && messages.length === 0) {
        const MESSAGE_CONTENT_PATTERN = /\b(hi |hello |dear |greetings|thank you|thanks|regards|sincerely|best wishes|cheers|warm regards|kindly|please find|we are pleased|we would like|invitation|congratulations|welcome)\b/i;
        for (let r = 1; r < rows.length; r++) {
            const raw = rawCells[r];
            const row = rows[r];
            if (!raw || raw.length === 0) continue;
            let longestIdx = 0, longestLen = 0;
            for (let c = 0; c < raw.length; c++) {
                if (raw[c].length > longestLen) { longestLen = raw[c].length; longestIdx = c; }
            }
            if (longestLen > 50 && MESSAGE_CONTENT_PATTERN.test(raw[longestIdx])) {
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

        if (isMessageSection(line) && (isSectionHeader(line) || line.length < 60)) {
            inMessageSection = true;
            flushMessage();
            sectionHeading = line.replace(/^\d+\.\s*/, '').trim();
            currentSubHeading = '';
            continue;
        }

        if (isSectionHeader(line) && !isMessageSection(line)) {
            if (inMessageSection) flushMessage();
            inMessageSection = false;
            continue;
        }

        if (!inMessageSection) continue;
        if (isTableHeader(line)) continue;

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
