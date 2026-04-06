import {
    getOpsTodaySummary, getOpsWeekSummary, getOpsMonthSummary,
    getOpsDailyByDate, getOpsDataRange, getOpsUniversities,
    getOpsSessionsByUniversity, getOpsAttendanceByUniversity,
    getOpsInstructorsByUniversity, getOpsWeekByUniversity,
    getOpsTeamActivity, getOpsInstructorActivity,
    getOpsComplianceData,
    getOpsDailyReport, getOpsWeeklyReport, getOpsMonthlyReport,
    upsertOpsDailyData, upsertOpsInstructorDaily,
    getOpsSheetConfig, upsertOpsSheetConfig, updateSheetLastSynced,
    parseOpsCSV,
    clearOpsData,
    submitDailyForm,
    getDailyFormComplianceStatus,
    aggregateAllUniversities,
    getAllUniversities,
    getOpsTaskPatterns,
    getOpsPeerComparison,
    getOpsUniversityRankings,
    getOpsUniversityTrends,
    getOpsEventBudgetIntelligence,
} from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

function getWeekRange(dateStr: string) {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(d);
    start.setDate(diff);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
    };
}

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const view = url.searchParams.get('view') || 'overview';
    const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
    const university = url.searchParams.get('university') || undefined;
    const role = url.searchParams.get('role') || undefined;
    const dateRange = url.searchParams.get('dateRange') || 'today';

    const week = getWeekRange(date);
    const d = new Date(date);
    const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];

    switch (view) {
        case 'overview': {
            const [today, weekData, monthData, universities] = await Promise.all([
                getOpsTodaySummary(date),
                getOpsWeekSummary(week.start, week.end),
                getOpsMonthSummary(d.getFullYear(), d.getMonth() + 1),
                getOpsUniversities()
            ]);
            return json({ today, week: weekData, month: monthData, universities, date });
        }

        case 'sessions': {
            const [todayByUniv, weekByUniv, todaySummary, weekSummary, universities] = await Promise.all([
                getOpsSessionsByUniversity(date),
                getOpsWeekByUniversity(week.start, week.end),
                getOpsTodaySummary(date),
                getOpsWeekSummary(week.start, week.end),
                getOpsUniversities()
            ]);
            return json({ todayByUniversity: todayByUniv, weekByUniversity: weekByUniv, todaySummary, weekSummary, universities, date });
        }

        case 'attendance': {
            const [todayByUniv, weekByUniv, todaySummary, weekSummary, universities] = await Promise.all([
                getOpsAttendanceByUniversity(date),
                getOpsWeekByUniversity(week.start, week.end),
                getOpsTodaySummary(date),
                getOpsWeekSummary(week.start, week.end),
                getOpsUniversities()
            ]);
            return json({ todayByUniversity: todayByUniv, weekByUniversity: weekByUniv, todaySummary, weekSummary, universities, date });
        }

        case 'instructors': {
            const [todayByUniv, weekByUniv, todaySummary, universities] = await Promise.all([
                getOpsInstructorsByUniversity(date),
                getOpsWeekByUniversity(week.start, week.end),
                getOpsTodaySummary(date),
                getOpsUniversities()
            ]);
            return json({ todayByUniversity: todayByUniv, weekByUniversity: weekByUniv, todaySummary, universities, date });
        }

        case 'at-risk': {
            const [todayData, weekData, universities] = await Promise.all([
                getOpsDailyByDate(date),
                getOpsWeekByUniversity(week.start, week.end),
                getOpsUniversities()
            ]);
            return json({ todayByUniversity: todayData, weekByUniversity: weekData, universities, date });
        }

        case 'events': {
            const monthData = await getOpsDataRange(monthStart, monthEnd);
            const byUniv: Record<string, any> = {};
            for (const row of monthData) {
                if (!byUniv[row.university_name]) {
                    byUniv[row.university_name] = { university_name: row.university_name, events_planned: 0, events_executed: 0, events_cancelled: 0 };
                }
                byUniv[row.university_name].events_planned += parseInt(row.events_planned) || 0;
                byUniv[row.university_name].events_executed += parseInt(row.events_executed) || 0;
                byUniv[row.university_name].events_cancelled += parseInt(row.events_cancelled) || 0;
            }
            const monthSummary = await getOpsWeekSummary(monthStart, monthEnd);
            return json({ byUniversity: Object.values(byUniv), monthSummary, date, monthStart, monthEnd });
        }

        case 'exams': {
            const monthData = await getOpsDataRange(monthStart, monthEnd);
            const byUniv: Record<string, any> = {};
            for (const row of monthData) {
                if (!byUniv[row.university_name]) {
                    byUniv[row.university_name] = { university_name: row.university_name, exams_planned: 0, exams_completed: 0, post_exam_comms_sent: 0 };
                }
                byUniv[row.university_name].exams_planned += parseInt(row.exams_planned) || 0;
                byUniv[row.university_name].exams_completed += parseInt(row.exams_completed) || 0;
                byUniv[row.university_name].post_exam_comms_sent += parseInt(row.post_exam_comms_sent) || 0;
            }
            const monthSummary = await getOpsWeekSummary(monthStart, monthEnd);
            return json({ byUniversity: Object.values(byUniv), monthSummary, date, monthStart, monthEnd });
        }

        case 'post-exam': {
            const monthData = await getOpsDataRange(monthStart, monthEnd);
            const byUniv: Record<string, any> = {};
            for (const row of monthData) {
                if (!byUniv[row.university_name]) {
                    byUniv[row.university_name] = { university_name: row.university_name, exams_completed: 0, post_exam_comms_sent: 0 };
                }
                byUniv[row.university_name].exams_completed += parseInt(row.exams_completed) || 0;
                byUniv[row.university_name].post_exam_comms_sent += parseInt(row.post_exam_comms_sent) || 0;
            }
            return json({ byUniversity: Object.values(byUniv), date, monthStart, monthEnd });
        }

        case 'per-university': {
            const univName = university;
            if (!univName) {
                const universities = await getOpsUniversities();
                return json({ universities });
            }
            const [todayData, weekData, monthData] = await Promise.all([
                getOpsDataRange(date, date, univName),
                getOpsDataRange(week.start, week.end, univName),
                getOpsDataRange(monthStart, monthEnd, univName)
            ]);
            return json({ university: univName, today: todayData[0] || null, weekData, monthData, date });
        }

        case 'team-activity': {
            const [teamData, instructorData, universities] = await Promise.all([
                getOpsTeamActivity(date, university),
                getOpsInstructorActivity(date, university, role),
                getOpsUniversities()
            ]);
            return json({ teamData, instructorData, universities, date });
        }

        case 'daily-reports': {
            let reportData;
            if (dateRange === 'week') {
                reportData = await getOpsDataRange(week.start, week.end);
            } else if (dateRange === 'month') {
                reportData = await getOpsDataRange(monthStart, monthEnd);
            } else {
                reportData = await getOpsDailyByDate(date);
            }
            const todaySummary = await getOpsTodaySummary(date);
            const weekCompliance = await getOpsComplianceData(week.start, week.end);
            return json({ reportData, todaySummary, weekCompliance, date, dateRange });
        }

        case 'compliance': {
            const thirtyDaysAgo = new Date(d);
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
            const compStart = thirtyDaysAgo.toISOString().split('T')[0];
            const compliance = await getOpsComplianceData(compStart, date);
            const universities = await getOpsUniversities();
            return json({ compliance, universities, startDate: compStart, endDate: date });
        }

        case 'report': {
            const reportType = url.searchParams.get('type') || 'daily';
            if (reportType === 'weekly') {
                // Allow custom week range via weekStart/weekEnd params
                const customStart = url.searchParams.get('weekStart');
                const customEnd = url.searchParams.get('weekEnd');
                const wStart = customStart || week.start;
                const wEnd = customEnd || week.end;
                const report = await getOpsWeeklyReport(wStart, wEnd);
                return json(report);
            } else if (reportType === 'monthly') {
                // Allow custom year/month params
                const customYear = url.searchParams.get('year');
                const customMonth = url.searchParams.get('month');
                const rYear = customYear ? parseInt(customYear) : d.getFullYear();
                const rMonth = customMonth ? parseInt(customMonth) : d.getMonth() + 1;
                const report = await getOpsMonthlyReport(rYear, rMonth);
                return json(report);
            } else {
                const report = await getOpsDailyReport(date);
                return json(report);
            }
        }

        case 'config': {
            const config = await getOpsSheetConfig();
            return json({ config });
        }

        // ─── Phase 3: Enhanced Analytics ──────────────────────────────

        case 'task-patterns': {
            const patterns = await getOpsTaskPatterns(monthStart, monthEnd, university);
            return json({ ...patterns, date, monthStart, monthEnd });
        }

        case 'peer-comparison': {
            const comparison = await getOpsPeerComparison(monthStart, monthEnd, university);
            return json({ ...comparison, date, monthStart, monthEnd });
        }

        case 'university-rankings': {
            const rankings = await getOpsUniversityRankings(monthStart, monthEnd);
            // Also get previous month for trend
            const prevMonthEnd = new Date(d.getFullYear(), d.getMonth(), 0);
            const prevMonthStart = `${prevMonthEnd.getFullYear()}-${String(prevMonthEnd.getMonth() + 1).padStart(2, '0')}-01`;
            const prevEnd = prevMonthEnd.toISOString().split('T')[0];
            let prevRankings: any[] = [];
            try { prevRankings = await getOpsUniversityRankings(prevMonthStart, prevEnd); } catch {}
            // Compute trend deltas
            const prevMap = new Map(prevRankings.map((r: any) => [r.university_name, r.score]));
            const withTrend = rankings.map((r: any) => ({
                ...r,
                prev_score: prevMap.get(r.university_name) ?? null,
                trend_delta: prevMap.has(r.university_name) ? r.score - (prevMap.get(r.university_name) || 0) : null,
            }));
            return json({ rankings: withTrend, date, monthStart, monthEnd });
        }

        case 'university-trends': {
            const univName = university;
            if (!univName) {
                const universities = await getOpsUniversities();
                return json({ universities });
            }
            const trends = await getOpsUniversityTrends(univName, 8);
            return json({ university: univName, trends, date });
        }

        // ─── Phase 4: Advanced AI ────────────────────────────────────

        case 'event-intelligence': {
            const intel = await getOpsEventBudgetIntelligence(monthStart, monthEnd, university);
            return json({ ...intel, date, monthStart, monthEnd });
        }

        // Views that manage their own data (NLQ uses /api/ops/nlq directly)
        case 'ask-ai':
        case 'daily-form':
        case 'form-compliance':
        case 'sheet-setup':
            return json({ ok: true });

        default:
            throw error(400, 'Invalid view');
    }
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const body = await request.json();
    const action = body.action;

    switch (action) {
        case 'sync-sheet': {
            const sheetUrl = body.sheetUrl;
            const syncDate = body.syncDate; // optional: YYYY-MM-DD date for the data
            if (!sheetUrl) throw error(400, 'Sheet URL required');

            try {
                // Save config
                const config = await upsertOpsSheetConfig(sheetUrl, locals.user.id);

                // Fetch CSV — follow redirects (Google Sheets always redirects)
                const resp = await fetch(sheetUrl, { redirect: 'follow' });
                if (!resp.ok) {
                    console.error('[OPS] Sheet fetch failed:', resp.status, resp.statusText);
                    return json({ success: false, error: `Sheet fetch failed: ${resp.status} ${resp.statusText}` }, { status: 400 });
                }
                const csvText = await resp.text();

                if (!csvText || csvText.length < 10) {
                    return json({ success: false, error: 'Sheet returned empty content' }, { status: 400 });
                }

                // Parse and store — pass syncDate so rows without a date column get the right date
                const { dailyData, instructorData } = parseOpsCSV(csvText, syncDate);

                if (!dailyData.length) {
                    return json({
                        success: false,
                        error: 'No data rows parsed. Check that your CSV headers match the expected format.',
                        headers: csvText.split('\n')[0],
                        rowCount: csvText.split('\n').length
                    }, { status: 400 });
                }

                // Log what dates we're storing
                const dates = [...new Set(dailyData.map((r: any) => r.date))];
                const universities = [...new Set(dailyData.map((r: any) => r.university_name))];
                console.log(`[OPS] Syncing ${dailyData.length} rows: dates=${dates.join(',')} universities=${universities.length} syncDate=${syncDate || 'none'}`);

                await upsertOpsDailyData(dailyData);
                if (instructorData.length) await upsertOpsInstructorDaily(instructorData);

                if (config?.id) await updateSheetLastSynced(config.id);

                return json({
                    success: true,
                    rowsProcessed: dailyData.length,
                    instructorRows: instructorData.length,
                    dates,
                    universityCount: universities.length
                });
            } catch (e: any) {
                console.error('[OPS] Sync error:', e);
                return json({ success: false, error: e.message || 'Unknown error during sync' }, { status: 500 });
            }
        }

        case 'sync-sheet-tabs': {
            // Bulk upload: Google Sheet with multiple tabs, each tab name is a date
            const baseUrl = body.sheetUrl;
            if (!baseUrl) throw error(400, 'Sheet URL required');

            try {
                // Extract sheet ID from URL — handle both edit and published URLs
                // Edit URL: /spreadsheets/d/SHEET_ID/edit
                // Published URL: /spreadsheets/d/e/PUBLISHED_KEY/pubhtml
                let sheetId: string;
                let isPublishedUrl = false;
                const pubMatch = baseUrl.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)/);
                const editMatch = baseUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
                if (pubMatch) {
                    // Published URL — try to find the real sheet ID from the published page
                    isPublishedUrl = true;
                    sheetId = ''; // will be extracted from pubhtml
                    try {
                        const pubHtmlUrl = `https://docs.google.com/spreadsheets/d/e/${pubMatch[1]}/pubhtml`;
                        const pubResp = await fetch(pubHtmlUrl, { redirect: 'follow' });
                        if (pubResp.ok) {
                            const pubHtml = await pubResp.text();
                            // Extract real sheet ID from published HTML (look for /spreadsheets/d/REAL_ID/)
                            const realIdMatch = pubHtml.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})(?:\/|")/);
                            if (realIdMatch) {
                                sheetId = realIdMatch[1];
                                console.log(`[OPS] Extracted real sheet ID from published URL: ${sheetId}`);
                            }
                        }
                    } catch {}
                    // Fallback: use the published key (works with /pub?output=csv)
                    if (!sheetId) sheetId = pubMatch[1];
                } else if (editMatch && editMatch[1] !== 'e') {
                    sheetId = editMatch[1];
                } else {
                    return json({ success: false, error: 'Could not extract Google Sheet ID from URL. Use the Google Sheets URL from your browser address bar. Example: https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit' }, { status: 400 });
                }

                // Save config
                const config = await upsertOpsSheetConfig(baseUrl, locals.user.id);

                // Discover sheet tabs — try multiple methods
                let html = '';
                const urlsToTry = isPublishedUrl
                    ? [
                        `https://docs.google.com/spreadsheets/d/e/${pubMatch![1]}/pubhtml`,
                        `https://docs.google.com/spreadsheets/d/${sheetId}/pubhtml`,
                        `https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`,
                        `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
                    ]
                    : [
                        `https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`,
                        `https://docs.google.com/spreadsheets/d/${sheetId}/pubhtml`,
                        `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
                        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&headers=0&tq=SELECT%20*%20LIMIT%200`,
                    ];
                for (const tryUrl of urlsToTry) {
                    try {
                        const htmlResp = await fetch(tryUrl, {
                            redirect: 'follow',
                            headers: { 'Accept': 'text/html,*/*' }
                        });
                        if (htmlResp.ok) {
                            const text = await htmlResp.text();
                            // Check if this response has tab info
                            if (text.length > 200 && (text.includes('sheetId') || text.includes('sheet-id') || text.includes('gid='))) {
                                html = text;
                                break;
                            }
                            if (!html && text.length > 200) html = text;
                        }
                    } catch { /* try next */ }
                }

                // Build tabs list from all patterns found in the HTML
                const tabs: { name: string; gid: string }[] = [];
                const seenGids = new Set<string>();

                if (html) {
                    // Pattern 1: JSON-style {"sheetId":123,"title":"28th March"}
                    for (const m of html.matchAll(/"title"\s*:\s*"([^"]+)"[^}]*?"sheetId"\s*:\s*(\d+)/g)) {
                        const [, name, gid] = m;
                        if (!seenGids.has(gid)) { seenGids.add(gid); tabs.push({ name, gid }); }
                    }
                    // Pattern 2: reverse order {"sheetId":123,"title":"..."}
                    for (const m of html.matchAll(/"sheetId"\s*:\s*(\d+)[^}]*?"title"\s*:\s*"([^"]+)"/g)) {
                        const [, gid, name] = m;
                        if (!seenGids.has(gid)) { seenGids.add(gid); tabs.push({ name, gid }); }
                    }
                    // Pattern 3: HTML tab buttons
                    for (const m of html.matchAll(/data-sheet-id="(\d+)"[^>]*>([^<]+)</g)) {
                        const [, gid, name] = m;
                        if (!seenGids.has(gid)) { seenGids.add(gid); tabs.push({ name: name.trim(), gid }); }
                    }
                    // Pattern 4: sheet-button class elements
                    for (const m of html.matchAll(/id="sheet-button-(\d+)"[^>]*>([^<]+)</g)) {
                        const [, gid, name] = m;
                        if (!seenGids.has(gid)) { seenGids.add(gid); tabs.push({ name: name.trim(), gid }); }
                    }
                    // Pattern 5: gid= in links with sheet names
                    for (const m of html.matchAll(/gid=(\d+)[^"]*"[^>]*>\s*([^<]+)</g)) {
                        const [, gid, name] = m;
                        const cleanName = name.trim();
                        if (cleanName && !seenGids.has(gid)) { seenGids.add(gid); tabs.push({ name: cleanName, gid }); }
                    }
                }

                // If we still couldn't discover tabs, try fetching the first sheet CSV
                // and check if the URL has a gid parameter — at minimum load that one tab
                if (!tabs.length) {
                    // Extract gid from original URL if present
                    const gidMatch = baseUrl.match(/gid=(\d+)/);
                    // Try to fetch the overview tab (gid=0) CSV as a sanity check
                    const testUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
                    try {
                        const testResp = await fetch(testUrl, { redirect: 'follow' });
                        if (testResp.ok) {
                            const csvText = await testResp.text();
                            if (csvText && csvText.length > 10) {
                                // Sheet is accessible but we can't discover tabs
                                // Fall back: use gids from the sheet URL, or try known tab names from the body
                                if (body.tabGids && Array.isArray(body.tabGids)) {
                                    for (const t of body.tabGids) {
                                        tabs.push({ name: t.name, gid: String(t.gid) });
                                    }
                                } else if (gidMatch) {
                                    tabs.push({ name: 'current', gid: gidMatch[1] });
                                }
                            }
                        }
                    } catch { /* ignore */ }
                }

                if (!tabs.length) {
                    return json({
                        success: false,
                        error: 'Could not discover sheet tabs. The sheet must be shared as "Anyone with the link" and either: (1) Published to web (File → Share → Publish to web), OR (2) Share the link with viewer access. If the issue persists, try using "Load data" for individual tabs instead.'
                    }, { status: 400 });
                }

                // Parse tab names as dates — supports many formats
                const monthNames: Record<string, string> = {
                    jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
                    apr: '04', april: '04', may: '05', jun: '06', june: '06',
                    jul: '07', july: '07', aug: '08', august: '08', sep: '09', september: '09',
                    oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12'
                };

                function parseTabDate(name: string): string | null {
                    const s = name.trim();
                    // YYYY-MM-DD
                    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
                    // DD-MM-YYYY or DD/MM/YYYY
                    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
                    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
                    // "28th March", "1st April", "3 Mar", "March 28" etc.
                    const nlDate = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)(?:\s+(\d{4}))?$/i);
                    if (nlDate) {
                        const day = nlDate[1].padStart(2, '0');
                        const mon = monthNames[nlDate[2].toLowerCase()];
                        const year = nlDate[3] || new Date().getFullYear().toString();
                        if (mon) return `${year}-${mon}-${day}`;
                    }
                    // "March 28th", "April 1" etc.
                    const nlDate2 = s.match(/^([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?$/i);
                    if (nlDate2) {
                        const day = nlDate2[2].padStart(2, '0');
                        const mon = monthNames[nlDate2[1].toLowerCase()];
                        const year = nlDate2[3] || new Date().getFullYear().toString();
                        if (mon) return `${year}-${mon}-${day}`;
                    }
                    return null;
                }

                const dateTabsRaw: { name: string; gid: string }[] = [];
                const skippedTabs: string[] = [];
                for (const t of tabs) {
                    const isoDate = parseTabDate(t.name);
                    if (isoDate) {
                        dateTabsRaw.push({ name: isoDate, gid: t.gid });
                    } else {
                        skippedTabs.push(t.name);
                    }
                }

                if (!dateTabsRaw.length) {
                    return json({
                        success: false,
                        error: `Found ${tabs.length} tab(s) but none have recognizable date names. Tab names found: ${tabs.map(t => t.name).join(', ')}. Use formats like "28th March", "2026-03-28", or "28-03-2026".`,
                    }, { status: 400 });
                }

                // Fetch CSV for each date tab and parse
                let totalRows = 0;
                let totalInstructorRows = 0;
                const processedDates: string[] = [];
                const errors: string[] = [];

                for (const tab of dateTabsRaw) {
                    try {
                        // Try multiple export URL patterns
                        let csvText = '';
                        const csvUrls = [
                            `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${tab.gid}`,
                            `https://docs.google.com/spreadsheets/d/${sheetId}/pub?output=csv&gid=${tab.gid}`,
                        ];
                        // For published URLs, also try with the published key
                        if (isPublishedUrl && pubMatch) {
                            csvUrls.unshift(`https://docs.google.com/spreadsheets/d/e/${pubMatch[1]}/pub?output=csv&gid=${tab.gid}`);
                        }
                        for (const csvUrl of csvUrls) {
                            const csvResp = await fetch(csvUrl, { redirect: 'follow' });
                            if (csvResp.ok) {
                                csvText = await csvResp.text();
                                if (csvText && csvText.length > 10) break;
                            }
                        }
                        if (!csvText || csvText.length < 10) {
                            errors.push(`Tab "${tab.name}": could not fetch CSV or empty content`);
                            continue;
                        }

                        const { dailyData, instructorData } = parseOpsCSV(csvText, tab.name);
                        if (dailyData.length) {
                            await upsertOpsDailyData(dailyData);
                            totalRows += dailyData.length;
                        }
                        if (instructorData.length) {
                            await upsertOpsInstructorDaily(instructorData);
                            totalInstructorRows += instructorData.length;
                        }
                        processedDates.push(tab.name);
                        console.log(`[OPS] Tab "${tab.name}": ${dailyData.length} rows, ${instructorData.length} instructor rows`);
                    } catch (tabErr: any) {
                        errors.push(`Tab "${tab.name}": ${tabErr.message}`);
                    }
                }

                if (config?.id) await updateSheetLastSynced(config.id);

                return json({
                    success: totalRows > 0,
                    rowsProcessed: totalRows,
                    instructorRows: totalInstructorRows,
                    dates: processedDates,
                    tabsFound: tabs.length,
                    dateTabsProcessed: dateTabsRaw.length,
                    errors: errors.length ? errors : undefined,
                    message: totalRows > 0
                        ? `Bulk synced ${totalRows} rows across ${processedDates.length} date(s): ${processedDates.join(', ')}`
                        : 'No data rows were parsed from any tab'
                });
            } catch (e: any) {
                console.error('[OPS] Bulk sync error:', e);
                return json({ success: false, error: e.message || 'Unknown error during bulk sync' }, { status: 500 });
            }
        }

        case 'discover-tabs': {
            const sheetUrl = body.sheetUrl;
            if (!sheetUrl) throw error(400, 'Sheet URL required');
            const sheetIdMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
            if (!sheetIdMatch) return json({ tabs: [] });
            const sheetId = sheetIdMatch[1];

            const tabs: { name: string; gid: string }[] = [];
            const seenGids = new Set<string>();
            let html = '';

            for (const tryUrl of [
                `https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`,
                `https://docs.google.com/spreadsheets/d/${sheetId}/pubhtml`,
                `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
            ]) {
                try {
                    const resp = await fetch(tryUrl, { redirect: 'follow', headers: { 'Accept': 'text/html,*/*' } });
                    if (resp.ok) {
                        const text = await resp.text();
                        if (text.length > 200 && (text.includes('sheetId') || text.includes('gid='))) { html = text; break; }
                        if (!html && text.length > 200) html = text;
                    }
                } catch {}
            }

            if (html) {
                for (const m of html.matchAll(/"title"\s*:\s*"([^"]+)"[^}]*?"sheetId"\s*:\s*(\d+)/g)) {
                    if (!seenGids.has(m[2])) { seenGids.add(m[2]); tabs.push({ name: m[1], gid: m[2] }); }
                }
                for (const m of html.matchAll(/"sheetId"\s*:\s*(\d+)[^}]*?"title"\s*:\s*"([^"]+)"/g)) {
                    if (!seenGids.has(m[1])) { seenGids.add(m[1]); tabs.push({ name: m[2], gid: m[1] }); }
                }
                for (const m of html.matchAll(/data-sheet-id="(\d+)"[^>]*>([^<]+)</g)) {
                    if (!seenGids.has(m[1])) { seenGids.add(m[1]); tabs.push({ name: m[2].trim(), gid: m[1] }); }
                }
                for (const m of html.matchAll(/id="sheet-button-(\d+)"[^>]*>([^<]+)</g)) {
                    if (!seenGids.has(m[1])) { seenGids.add(m[1]); tabs.push({ name: m[2].trim(), gid: m[1] }); }
                }
            }
            return json({ tabs });
        }

        case 'submit-daily-form': {
            try {
                const { university_id, university_name, date, sessions_planned, sessions_completed,
                    sessions_cancelled, cancellation_reason, enrolled, attended,
                    at_risk_total, at_risk_informed, acknowledgments, remarks } = body;

                if (!university_id || !university_name || !date) {
                    throw error(400, 'university_id, university_name, and date are required');
                }

                const result = await submitDailyForm({
                    university_id,
                    university_name,
                    date,
                    sessions_planned: parseInt(sessions_planned) || 0,
                    sessions_completed: parseInt(sessions_completed) || 0,
                    sessions_cancelled: parseInt(sessions_cancelled) || 0,
                    cancellation_reason: cancellation_reason || undefined,
                    enrolled: parseInt(enrolled) || 0,
                    attended: parseInt(attended) || 0,
                    at_risk_total: parseInt(at_risk_total) || 0,
                    at_risk_informed: parseInt(at_risk_informed) || 0,
                    acknowledgments: parseInt(acknowledgments) || 0,
                    remarks: remarks || undefined,
                    submitted_by: locals.user.id,
                    submitted_by_name: locals.user.name || locals.user.email,
                });

                return json({
                    success: true,
                    message: `Daily report for ${university_name} on ${date} submitted successfully`,
                    data: result
                });
            } catch (e: any) {
                console.error('[OPS] Daily form submit error:', e);
                return json({ success: false, error: e.message || 'Failed to submit daily form' }, { status: 500 });
            }
        }

        case 'get-compliance': {
            try {
                const date = body.date || new Date().toISOString().split('T')[0];
                const compliance = await getDailyFormComplianceStatus(date);
                return json({ success: true, date, compliance });
            } catch (e: any) {
                return json({ success: false, error: e.message }, { status: 500 });
            }
        }

        case 'aggregate-all': {
            try {
                const date = body.date || new Date().toISOString().split('T')[0];
                const results = await aggregateAllUniversities(date);
                return json({ success: true, date, universities: results.length, data: results });
            } catch (e: any) {
                return json({ success: false, error: e.message }, { status: 500 });
            }
        }

        case 'get-universities': {
            try {
                const universities = await getAllUniversities();
                return json({ success: true, universities: universities.filter(u => !u.is_team) });
            } catch (e: any) {
                return json({ success: false, error: e.message }, { status: 500 });
            }
        }

        case 'clear-data': {
            try {
                const clearDate = body.date; // optional: clear only a specific date
                await clearOpsData(clearDate);
                return json({
                    success: true,
                    message: clearDate ? `Data for ${clearDate} cleared` : 'All ops data cleared'
                });
            } catch (e: any) {
                console.error('[OPS] Clear data error:', e);
                return json({ success: false, error: e.message || 'Failed to clear data' }, { status: 500 });
            }
        }

        default:
            throw error(400, 'Invalid action');
    }
};
