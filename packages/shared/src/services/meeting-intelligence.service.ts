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

            if (event.id) {
                const existing = await getMeetingByGoogleEventId(event.id);
                if (existing) { skipped++; continue; }
            }

            if (meetCode) {
                const existing = await getMeetingByMeetCode(meetCode);
                if (existing) { skipped++; continue; }
            }

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

            if (event.attendees) {
                for (const attendee of event.attendees) {
                    if (!attendee.email) continue;
                    await upsertMeetingInvitee({
                        meeting_id: meeting.id,
                        email: attendee.email,
                        name: attendee.displayName || undefined,
                        response_status: attendee.responseStatus || 'needsAction',
                        is_organizer: attendee.organizer || false
                    });
                }
            }

            synced++;
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

    // Search for transcript (Google Docs)
    try {
        const transcriptSearch = await drive.files.list({
            q: `mimeType='application/vnd.google-apps.document' AND (name contains '${meetTitle}' OR ${meetCode ? `name contains '${meetCode}'` : 'name contains "transcript"'}) AND name contains 'transcript'`,
            fields: 'files(id, name, webViewLink, modifiedTime)',
            orderBy: 'modifiedTime desc',
            pageSize: 5
        });

        const transcriptFile = transcriptSearch.data.files?.[0];
        if (transcriptFile) {
            await updateMeeting(meetingId, {
                transcript_doc_id: transcriptFile.id,
                transcript_doc_url: transcriptFile.webViewLink
            });
            result.transcript = true;
        }
    } catch (e: any) {
        console.error(`[MEETING] Failed to search for transcript:`, e);
    }

    // Search for recording (video files)
    try {
        const recordingSearch = await drive.files.list({
            q: `(mimeType contains 'video/' OR name contains 'Recording') AND (name contains '${meetTitle}' OR ${meetCode ? `name contains '${meetCode}'` : '1=1'})`,
            fields: 'files(id, name, webViewLink, modifiedTime)',
            orderBy: 'modifiedTime desc',
            pageSize: 5
        });

        const recordingFile = recordingSearch.data.files?.[0];
        if (recordingFile) {
            await updateMeeting(meetingId, {
                recording_file_id: recordingFile.id,
                recording_url: recordingFile.webViewLink
            });
            result.recording = true;
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

// ─── Transcript Extraction ───────────────────────────────────────────

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
        let transcript = '';
        const speakers = new Map<string, number>();

        for (const element of content) {
            if (element.paragraph) {
                const text = element.paragraph.elements
                    ?.map((e: any) => e.textRun?.content || '')
                    .join('') || '';

                if (text.trim()) {
                    transcript += text;

                    const speakerMatch = text.match(/^([A-Za-z\s.]+?)(?:\n|$)/);
                    if (speakerMatch && speakerMatch[1].trim().length > 1 && speakerMatch[1].trim().length < 50) {
                        const speaker = speakerMatch[1].trim();
                        speakers.set(speaker, (speakers.get(speaker) || 0) + 1);
                    }
                }
            }
        }

        await updateMeeting(meetingId, { raw_transcript: transcript });

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
        return transcript;
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

    return `You are analyzing a meeting transcript. Provide a structured analysis in the exact JSON format specified below.

Meeting Title: ${meeting.title}
Date: ${meeting.scheduled_start ? new Date(meeting.scheduled_start).toLocaleDateString() : 'Unknown'}
Organizer: ${meeting.organizer_name || meeting.organizer_email}

TRANSCRIPT:
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
        await updateMeeting(meetingId, { status: 'PROCESSING' });

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
