// googleapis is loaded dynamically to avoid hard dependency in shared package
let _google: any;
async function loadGoogle() {
    if (!_google) {
        const mod = await import('googleapis');
        _google = mod.google;
    }
    return _google;
}

import { decryptString } from '../crypto';
import {
    getMeetingConnectionCredentials,
    createMeeting,
    getMeetingByGoogleEventId,
    getMeetingByMeetCode,
    updateMeeting,
    upsertMeetingInvitee,
    upsertMeetingParticipant,
    clearMeetingParticipants,
    clearTranscriptParticipants,
    type OrgMeeting
} from '../db/meetings';

// ─── Auth Helper ─────────────────────────────────────────────────────

async function getOAuth2Client(refreshToken: string) {
    const google = await loadGoogle();
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Google OAuth credentials not configured');
    }

    const client = new google.auth.OAuth2(clientId, clientSecret);
    client.setCredentials({ refresh_token: refreshToken });
    return client;
}

async function getAuthClient(connectionId: string) {
    const conn = await getMeetingConnectionCredentials(connectionId);
    if (!conn || conn.status !== 'ACTIVE') {
        throw new Error('Meeting connection not found or revoked');
    }
    const refreshToken = decryptString(conn.refresh_token_enc);
    return getOAuth2Client(refreshToken);
}

// ─── Calendar Sync ───────────────────────────────────────────────────

export async function syncCalendarMeetings(
    connectionId: string,
    userId: string,
    options: { timeMin?: string; timeMax?: string } = {}
): Promise<{ synced: number; skipped: number }> {
    const google = await loadGoogle();
    const auth = await getAuthClient(connectionId);
    const calendar = google.calendar({ version: 'v3', auth });

    const now = new Date();
    const timeMin = options.timeMin || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = options.timeMax || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    let synced = 0;
    let skipped = 0;
    let pageToken: string | undefined;

    do {
        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 100,
            pageToken
        });

        const events = response.data.items || [];

        for (const event of events) {
            const meetLink = event.conferenceData?.entryPoints?.find(
                (ep: any) => ep.entryPointType === 'video'
            )?.uri;

            if (!meetLink && !event.hangoutLink) {
                skipped++;
                continue;
            }

            const meetCode = extractMeetCode(meetLink || event.hangoutLink || '');

            // Check if meeting already exists (by google event ID or meet code)
            let existingMeeting: OrgMeeting | null = null;
            if (event.id) {
                existingMeeting = await getMeetingByGoogleEventId(event.id);
            }
            if (!existingMeeting && meetCode) {
                existingMeeting = await getMeetingByMeetCode(meetCode);
            }

            let meetingId: string;

            if (existingMeeting) {
                meetingId = existingMeeting.id;
                // Update existing meeting with calendar data (fills in google_event_id for manual meetings, updates title etc.)
                await updateMeeting(existingMeeting.id, {
                    google_event_id: event.id || existingMeeting.google_event_id,
                    title: event.summary || existingMeeting.title,
                    description: event.description || existingMeeting.description,
                    organizer_email: event.organizer?.email || existingMeeting.organizer_email,
                    organizer_name: event.organizer?.displayName || existingMeeting.organizer_name,
                    scheduled_start: event.start?.dateTime ? new Date(event.start.dateTime) : existingMeeting.scheduled_start,
                    scheduled_end: event.end?.dateTime ? new Date(event.end.dateTime) : existingMeeting.scheduled_end,
                });
            } else {
                const meeting = await createMeeting({
                    user_id: userId,
                    meeting_connection_id: connectionId,
                    google_event_id: event.id || undefined,
                    google_meet_code: meetCode || undefined,
                    title: event.summary || 'Untitled Meeting',
                    description: event.description || undefined,
                    organizer_email: event.organizer?.email || '',
                    organizer_name: event.organizer?.displayName || undefined,
                    meet_link: meetLink || event.hangoutLink || undefined,
                    scheduled_start: event.start?.dateTime ? new Date(event.start.dateTime) : undefined,
                    scheduled_end: event.end?.dateTime ? new Date(event.end.dateTime) : undefined,
                    source: 'CALENDAR',
                    status: 'DISCOVERED'
                } as any);
                meetingId = meeting.id;
                synced++;
            }

            // Always sync attendees (upsert is safe for existing invitees)
            if (event.attendees) {
                for (const attendee of event.attendees) {
                    if (!attendee.email) continue;
                    await upsertMeetingInvitee({
                        meeting_id: meetingId,
                        email: attendee.email,
                        name: attendee.displayName || undefined,
                        response_status: attendee.responseStatus || 'needsAction',
                        is_organizer: attendee.organizer || false
                    });
                }
            }

            if (existingMeeting) {
                skipped++;
            }
        }

        pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return { synced, skipped };
}

// ─── Drive Scan for Meet Artifacts ───────────────────────────────────

export async function scanDriveForMeetArtifacts(
    connectionId: string,
    meetingId: string
): Promise<{ transcript: boolean; recording: boolean; attendance: boolean }> {
    const google = await loadGoogle();
    const auth = await getAuthClient(connectionId);
    const drive = google.drive({ version: 'v3', auth });
    const meeting = await getMeetingByIdInternal(meetingId);

    if (!meeting) throw new Error('Meeting not found');

    const result = { transcript: false, recording: false, attendance: false };
    const meetCode = meeting.google_meet_code;
    const meetTitle = meeting.title;

    // Search for transcript (Google Docs) — Google names these like "Meeting Title - Date - Notes by Gemini"
    const escapedTitle = meetTitle.replace(/'/g, "\\'");
    // Use shorter title keywords if title is long (Drive search works better with fewer words)
    const titleWords = meetTitle.split(/\s+/).filter((w: string) => w.length > 2).slice(0, 4);
    const shortTitle = titleWords.join(' ').replace(/'/g, "\\'");
    try {
        // Try multiple search strategies — Google Meet creates "Notes by Gemini" docs
        const searches = [
            // Strategy 1: Docs matching full meeting title
            `mimeType='application/vnd.google-apps.document' AND name contains '${escapedTitle}'`,
            // Strategy 2: Docs with "Notes by Gemini" (Google's default name format)
            `mimeType='application/vnd.google-apps.document' AND name contains 'Notes by Gemini'`,
            // Strategy 3: Docs with "Notes" containing short title keywords
            `mimeType='application/vnd.google-apps.document' AND name contains 'Notes' AND name contains '${shortTitle}'`,
            // Strategy 4: Docs with "transcript" in name
            `mimeType='application/vnd.google-apps.document' AND name contains 'transcript'`,
        ];
        if (meetCode) {
            // Strategy 5: Docs matching meet code
            searches.push(`mimeType='application/vnd.google-apps.document' AND name contains '${meetCode}'`);
        }

        for (const query of searches) {
            try {
                console.log(`[MEETING] Transcript search: ${query}`);
                const transcriptSearch = await drive.files.list({
                    q: query,
                    fields: 'files(id, name, webViewLink, modifiedTime)',
                    orderBy: 'modifiedTime desc',
                    pageSize: 5
                });

                const files = transcriptSearch.data.files || [];
                console.log(`[MEETING] Found ${files.length} docs for query`);

                // Prefer file closest to meeting date
                let transcriptFile = files[0];
                if (files.length > 1 && meeting.scheduled_start) {
                    const meetTime = new Date(meeting.scheduled_start).getTime();
                    transcriptFile = files.reduce((best: any, f: any) => {
                        const fDiff = Math.abs(new Date(f.modifiedTime).getTime() - meetTime);
                        const bDiff = Math.abs(new Date(best.modifiedTime).getTime() - meetTime);
                        return fDiff < bDiff ? f : best;
                    });
                }

                if (transcriptFile) {
                    console.log(`[MEETING] Found transcript: "${transcriptFile.name}" (${transcriptFile.id})`);
                    await updateMeeting(meetingId, {
                        transcript_doc_id: transcriptFile.id,
                        transcript_doc_url: transcriptFile.webViewLink
                    });
                    result.transcript = true;
                    break;
                }
            } catch (searchErr: any) {
                console.warn(`[MEETING] Search query failed: ${searchErr.message}`);
                continue;
            }
        }
    } catch (e: any) {
        console.error(`[MEETING] Failed to search for transcript:`, e);
    }

    // Search for recording (video files and Meet recordings)
    try {
        const recordingQueries = [
            `(mimeType contains 'video/' OR name contains 'Recording') AND name contains '${escapedTitle}'`,
        ];
        if (meetCode) {
            recordingQueries.push(`(mimeType contains 'video/' OR name contains 'Recording') AND name contains '${meetCode}'`);
        }

        for (const query of recordingQueries) {
            const recordingSearch = await drive.files.list({
                q: query,
                fields: 'files(id, name, webViewLink, modifiedTime)',
                orderBy: 'modifiedTime desc',
                pageSize: 5
            });

            const recordingFile = recordingSearch.data.files?.[0];
            if (recordingFile) {
                console.log(`[MEETING] Found recording: ${recordingFile.name}`);
                await updateMeeting(meetingId, {
                    recording_file_id: recordingFile.id,
                    recording_url: recordingFile.webViewLink
                });
                result.recording = true;
                break;
            }
        }
    } catch (e: any) {
        console.error(`[MEETING] Failed to search for recording:`, e);
    }

    // Search for attendance CSV
    try {
        const attendanceSearch = await drive.files.list({
            q: `mimeType='text/csv' AND (name contains '${meetTitle}' OR name contains 'attendance' OR ${meetCode ? `name contains '${meetCode}'` : '1=1'})`,
            fields: 'files(id, name, webViewLink, modifiedTime)',
            orderBy: 'modifiedTime desc',
            pageSize: 5
        });

        const attendanceFile = attendanceSearch.data.files?.[0];
        if (attendanceFile) {
            await updateMeeting(meetingId, { attendance_file_id: attendanceFile.id });
            result.attendance = true;

            await parseAttendanceCsv(connectionId, meetingId, attendanceFile.id!);
        }
    } catch (e: any) {
        console.error(`[MEETING] Failed to search for attendance:`, e);
    }

    return result;
}

// ─── Transcript / Notes Extraction ──────────────────────────────────

// Known section headings in "Notes by Gemini" that should NOT be treated as speaker names
const KNOWN_HEADINGS = new Set([
    'attachments', 'details', 'meeting records', 'summary', 'suggested next steps',
    'action items', 'key decisions', 'notes', 'agenda', 'topics', 'overview',
    'follow up', 'follow-up', 'next steps', 'discussion', 'decisions',
    'attendees', 'participants', 'meeting notes', 'transcript', 'recording',
    'meeting details', 'meeting summary', 'meeting agenda', 'references',
    'links', 'resources', 'questions', 'answers', 'feedback', 'conclusion',
    'final confirmation', 'immediate action items', 'meeting commencement',
    'platform walkthrough', 'platform legacy', 'external success story',
    'key takeaways', 'introduction', 'closing remarks', 'wrap up', 'wrap-up'
]);

// Words that never appear in real person names — used to reject topic headings
const NON_NAME_WORDS = new Set([
    'action', 'items', 'confirmation', 'commencement', 'walkthrough', 'legacy',
    'platform', 'external', 'success', 'story', 'immediate', 'final', 'overview',
    'introduction', 'discussion', 'session', 'update', 'updates', 'review',
    'strategy', 'planning', 'analysis', 'report', 'status', 'progress',
    'agenda', 'timeline', 'roadmap', 'milestone', 'objective', 'initiative',
    'implementation', 'integration', 'deployment', 'migration', 'configuration',
    'demonstration', 'presentation', 'workshop', 'training', 'onboarding',
    'feedback', 'retrospective', 'standup', 'sync', 'kickoff', 'wrap',
    'closing', 'opening', 'remarks', 'takeaways', 'highlights', 'blockers'
]);

function isLikelyPersonName(text: string): boolean {
    const cleaned = text.trim();
    if (cleaned.length < 3 || cleaned.length > 60) return false;
    // Skip known headings
    if (KNOWN_HEADINGS.has(cleaned.toLowerCase())) return false;
    // Skip if it contains special chars that names don't have
    if (/[{}[\]<>|@#$%^&*()+=]/.test(cleaned)) return false;
    // Skip if it looks like a URL or timestamp
    if (/^https?:|^\d{2}:\d{2}|^\(\d/.test(cleaned)) return false;
    // Skip if it's a single word that's too generic
    const words = cleaned.split(/\s+/);
    if (words.length === 1 && cleaned.length < 4) return false;
    // Skip if ANY word is a known non-name word (topic/heading vocabulary)
    const lowerWords = words.map((w: string) => w.toLowerCase());
    if (lowerWords.some((w: string) => NON_NAME_WORDS.has(w))) return false;
    // Skip if 3+ words (most Indian/person names are 2-3 words, topic titles often 3+)
    // Only allow 3+ word names if they look like "First Middle Last" pattern
    if (words.length >= 3) {
        // Each word should be short (typical name words are 3-10 chars)
        const allShortWords = words.every((w: string) => w.length <= 12);
        if (!allShortWords) return false;
    }
    // A person name typically has 2-4 words, all starting with uppercase
    if (words.length >= 2 && words.length <= 4) {
        const allCapitalized = words.every((w: string) => /^[A-Z]/.test(w));
        if (allCapitalized) return true;
    }
    return false;
}

export async function extractTranscript(
    connectionId: string,
    meetingId: string
): Promise<string | null> {
    const google = await loadGoogle();
    const auth = await getAuthClient(connectionId);
    const meeting = await getMeetingByIdInternal(meetingId);

    if (!meeting?.transcript_doc_id) return null;

    const docs = google.docs({ version: 'v1', auth });

    try {
        const doc = await docs.documents.get({ documentId: meeting.transcript_doc_id });
        const content = doc.data.body?.content || [];
        const docTitle = (doc.data.title || '').toLowerCase();
        const isGeminiNotes = docTitle.includes('notes by gemini') || docTitle.includes('notes');
        let fullText = '';
        const headings: string[] = [];
        const speakers = new Map<string, number>();

        // First pass: extract all text and identify headings vs body
        for (const element of content) {
            if (element.paragraph) {
                const text = element.paragraph.elements
                    ?.map((e: any) => e.textRun?.content || '')
                    .join('') || '';

                if (!text.trim()) continue;
                fullText += text;

                // Check if this paragraph is a heading (Google Docs style)
                const style = element.paragraph.paragraphStyle?.namedStyleType || '';
                if (style.startsWith('HEADING')) {
                    headings.push(text.trim());
                    continue; // Don't treat headings as speaker lines
                }

                // For "Notes by Gemini" format: extract person names mentioned in text
                // Pattern: "Speaker Name said/mentioned/asked/noted/shared/discussed/explained..."
                // Or: "Speaker Name: ..." (actual transcript format)
                if (isGeminiNotes) {
                    // Extract names from patterns like "Yash kanaboina mentioned..."
                    const namePatterns = [
                        /([A-Z][a-z]+(?:\s+[A-Za-z][a-z]+){1,3})\s+(?:said|mentioned|asked|noted|shared|discussed|explained|outlined|suggested|proposed|thanked|granted|explored|concluded|introduced|transitioned|shifted|focused|examined|determined|referenced|acknowledged)/g,
                        /([A-Z][a-z]+(?:\s+[A-Za-z][a-z]+){1,3})\s+(?:and\s+[A-Z][a-z]+(?:\s+[A-Za-z][a-z]+){1,3})/g,
                    ];
                    for (const pattern of namePatterns) {
                        let match;
                        while ((match = pattern.exec(text)) !== null) {
                            const name = match[1].trim();
                            if (isLikelyPersonName(name)) {
                                speakers.set(name, (speakers.get(name) || 0) + 1);
                            }
                        }
                    }
                } else {
                    // Standard transcript format: "Speaker Name: text" or "Speaker Name\n"
                    const speakerMatch = text.match(/^([A-Za-z][A-Za-z\s.]{1,50}?)(?::\s|\n)/);
                    if (speakerMatch) {
                        const speaker = speakerMatch[1].trim();
                        if (isLikelyPersonName(speaker)) {
                            speakers.set(speaker, (speakers.get(speaker) || 0) + 1);
                        }
                    }
                }
            }
        }

        console.log(`[MEETING] Extracted ${speakers.size} speakers from ${isGeminiNotes ? 'Gemini notes' : 'transcript'}: ${[...speakers.keys()].join(', ')}`);

        await updateMeeting(meetingId, { raw_transcript: fullText });

        for (const [name, segments] of speakers) {
            await upsertMeetingParticipant({
                meeting_id: meetingId,
                name,
                spoke_in_transcript: true,
                speaking_segments: segments,
                source: 'TRANSCRIPT'
            });
        }

        await updateMeeting(meetingId, { participant_count: speakers.size });
        return fullText;
    } catch (e: any) {
        console.error(`[MEETING] Failed to extract transcript:`, e);
        return null;
    }
}

// ─── Attendance CSV Parsing ──────────────────────────────────────────

async function parseAttendanceCsv(connectionId: string, meetingId: string, fileId: string) {
    const google = await loadGoogle();
    const auth = await getAuthClient(connectionId);
    const drive = google.drive({ version: 'v3', auth });

    try {
        const response = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'text' }
        );

        const csvText = response.data as string;
        const lines = csvText.split('\n').filter((l: string) => l.trim());
        if (lines.length < 2) return;

        const header = lines[0].split(',').map((h: string) => h.trim().toLowerCase());
        const nameIdx = header.findIndex((h: string) => h.includes('name') || h.includes('participant'));
        const emailIdx = header.findIndex((h: string) => h.includes('email'));
        const durationIdx = header.findIndex((h: string) => h.includes('duration'));

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map((c: string) => c.trim());
            const name = nameIdx >= 0 ? cols[nameIdx] : `Participant ${i}`;
            const email = emailIdx >= 0 ? cols[emailIdx] : undefined;

            if (!name || name === '') continue;

            await upsertMeetingParticipant({
                meeting_id: meetingId,
                name: name.replace(/"/g, ''),
                email: email?.replace(/"/g, '') || undefined,
                duration_minutes: durationIdx >= 0 ? parseInt(cols[durationIdx]) || undefined : undefined,
                source: 'ATTENDANCE_CSV'
            });
        }
    } catch (e: any) {
        console.error(`[MEETING] Failed to parse attendance CSV:`, e);
    }
}

// ─── AI Summary Generation ──────────────────────────────────────────

export async function generateAiReport(meetingId: string): Promise<boolean> {
    const meeting = await getMeetingByIdInternal(meetingId);
    if (!meeting?.raw_transcript) {
        console.log(`[MEETING_AI] No transcript available for meeting ${meetingId}`);
        return false;
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
        console.error('[MEETING_AI] GEMINI_API_KEY not set');
        return false;
    }

    try {
        const prompt = buildAiPrompt(meeting);

        // Try Gemini models in priority order
        const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-latest'];
        let aiText: string | null = null;

        for (const model of modelsToTry) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${geminiApiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            maxOutputTokens: 4096,
                            temperature: 0.3
                        }
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.warn(`[MEETING_AI] Gemini ${model} failed: ${response.status} ${errorText}`);
                    continue;
                }

                const data = await response.json();
                aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (aiText) {
                    console.log(`[MEETING_AI] Successfully used model: ${model}`);
                    break;
                }
            } catch (e: any) {
                console.warn(`[MEETING_AI] Gemini ${model} error:`, e.message);
                continue;
            }
        }

        if (!aiText) {
            console.error('[MEETING_AI] All Gemini models failed');
            return false;
        }

        const parsed = parseAiResponse(aiText);

        await updateMeeting(meetingId, {
            ai_summary: parsed.summary,
            ai_action_items: JSON.stringify(parsed.actionItems),
            ai_key_decisions: JSON.stringify(parsed.keyDecisions),
            ai_topics: JSON.stringify(parsed.topics),
            ai_sentiment: parsed.sentiment,
            ai_processed_at: new Date()
        });

        return true;
    } catch (e: any) {
        console.error(`[MEETING_AI] Failed to generate AI report:`, e);
        return false;
    }
}

function buildAiPrompt(meeting: OrgMeeting): string {
    const transcript = meeting.raw_transcript || '';
    const maxChars = 80000;
    const truncatedTranscript = transcript.length > maxChars
        ? transcript.substring(0, maxChars) + '\n\n[TRANSCRIPT TRUNCATED]'
        : transcript;

    return `You are analyzing meeting notes/transcript. The content may be a "Notes by Gemini" summary or a raw transcript. Extract the key information and provide a structured analysis in the exact JSON format specified below.

Meeting Title: ${meeting.title}
Date: ${meeting.scheduled_start ? new Date(meeting.scheduled_start).toLocaleDateString() : 'Unknown'}
Organizer: ${meeting.organizer_name || meeting.organizer_email}

MEETING NOTES/TRANSCRIPT:
${truncatedTranscript}

Respond ONLY with valid JSON in this exact format (no markdown, no code fences):
{
    "summary": "A concise 2-4 paragraph summary of the meeting covering main discussion points and outcomes",
    "actionItems": [
        {"assignee": "Person Name", "task": "Description of action item", "deadline": "if mentioned, else null"}
    ],
    "keyDecisions": [
        {"decision": "What was decided", "context": "Brief context"}
    ],
    "topics": [
        {"topic": "Topic Name", "duration_estimate": "approximate time spent", "summary": "Brief summary"}
    ],
    "sentiment": "positive|neutral|mixed|negative - overall meeting tone"
}`;
}

function parseAiResponse(text: string): {
    summary: string;
    actionItems: any[];
    keyDecisions: any[];
    topics: any[];
    sentiment: string;
} {
    try {
        let jsonStr = text.trim();
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1].trim();

        const parsed = JSON.parse(jsonStr);
        return {
            summary: parsed.summary || 'No summary generated',
            actionItems: parsed.actionItems || [],
            keyDecisions: parsed.keyDecisions || [],
            topics: parsed.topics || [],
            sentiment: parsed.sentiment || 'neutral'
        };
    } catch {
        return {
            summary: text,
            actionItems: [],
            keyDecisions: [],
            topics: [],
            sentiment: 'neutral'
        };
    }
}

// ─── Full Meeting Processing Pipeline ────────────────────────────────

export async function processMeeting(connectionId: string, meetingId: string): Promise<void> {
    console.log(`[MEETING] Processing meeting ${meetingId}...`);

    try {
        await updateMeeting(meetingId, {
            status: 'PROCESSING',
            processing_error: null,
            // Clear AI-generated data before re-processing (but NOT participants/invitees)
            raw_transcript: null,
            ai_summary: null,
            ai_action_items: null,
            ai_key_decisions: null,
            ai_topics: null,
            ai_sentiment: null,
            ai_processed_at: null,
            transcript_doc_id: null,
            transcript_doc_url: null,
        });

        // NOTE: We intentionally do NOT clear participants here.
        // Participants from calendar invitees or attendance CSVs are preserved.
        // Only transcript-sourced participants are cleared and re-extracted.
        await clearTranscriptParticipants(meetingId);

        console.log(`[MEETING] Step 1: Scanning Drive for artifacts...`);
        const artifacts = await scanDriveForMeetArtifacts(connectionId, meetingId);
        console.log(`[MEETING] Artifacts found:`, artifacts);

        if (artifacts.transcript) {
            console.log(`[MEETING] Step 2: Extracting transcript...`);
            await extractTranscript(connectionId, meetingId);
        }

        const meeting = await getMeetingByIdInternal(meetingId);
        if (meeting?.raw_transcript) {
            console.log(`[MEETING] Step 3: Generating AI report...`);
            await generateAiReport(meetingId);
        }

        const hasAnyData = artifacts.transcript || artifacts.recording || artifacts.attendance;
        await updateMeeting(meetingId, {
            status: hasAnyData ? 'COMPLETED' : 'NO_DATA',
            processing_error: hasAnyData ? null : 'No meeting artifacts found in Drive. Meeting may not have been recorded or transcribed.'
        });

        console.log(`[MEETING] Meeting ${meetingId} processed. Status: ${hasAnyData ? 'COMPLETED' : 'NO_DATA'}`);
    } catch (e: any) {
        console.error(`[MEETING] Processing failed for ${meetingId}:`, e);
        await updateMeeting(meetingId, {
            status: 'FAILED',
            processing_error: e.message || 'Unknown error'
        });
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function extractMeetCode(url: string): string | null {
    const match = url.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/);
    return match ? match[1] : null;
}

async function getMeetingByIdInternal(id: string): Promise<OrgMeeting | null> {
    const { db } = await import('../db/client');
    const result = await db.query(`SELECT * FROM org_meetings WHERE id = $1`, [id]);
    return result.rows[0] || null;
}
