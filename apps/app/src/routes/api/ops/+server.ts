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
    clearOpsData
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
                const report = await getOpsWeeklyReport(week.start, week.end);
                return json(report);
            } else if (reportType === 'monthly') {
                const report = await getOpsMonthlyReport(d.getFullYear(), d.getMonth() + 1);
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
            // Bulk upload: Google Sheet with multiple tabs, each tab name is a date (YYYY-MM-DD)
            const baseUrl = body.sheetUrl;
            if (!baseUrl) throw error(400, 'Sheet URL required');

            try {
                // Extract sheet ID from URL
                const sheetIdMatch = baseUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
                if (!sheetIdMatch) {
                    return json({ success: false, error: 'Could not extract Google Sheet ID from URL. Use a standard Google Sheets URL.' }, { status: 400 });
                }
                const sheetId = sheetIdMatch[1];

                // Save config
                const config = await upsertOpsSheetConfig(baseUrl, locals.user.id);

                // Fetch the spreadsheet HTML to discover sheet tabs
                // Try pubhtml first (works for published sheets), fall back to edit URL
                let html = '';
                for (const urlSuffix of ['/pubhtml', '/edit']) {
                    const htmlResp = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}${urlSuffix}`, { redirect: 'follow' });
                    if (htmlResp.ok) {
                        html = await htmlResp.text();
                        if (html.length > 100) break;
                    }
                }
                if (!html) {
                    return json({ success: false, error: 'Could not access spreadsheet. Make sure it is published to the web.' }, { status: 400 });
                }

                // Extract sheet names and gids from HTML — Google embeds this in JS
                // Pattern: {"sheetId":0,"title":"2025-03-14"} or similar in the page source
                const tabMatches = [...html.matchAll(/"title"\s*:\s*"([^"]+)"[^}]*"sheetId"\s*:\s*(\d+)/g)];
                const tabMatchesAlt = [...html.matchAll(/"sheetId"\s*:\s*(\d+)[^}]*"title"\s*:\s*"([^"]+)"/g)];

                // Also try regex for sheet tab buttons in the HTML
                const tabButtonMatches = [...html.matchAll(/data-sheet-id="(\d+)"[^>]*>([^<]+)</g)];

                // Build tabs list from all patterns
                const tabs: { name: string; gid: string }[] = [];
                const seenGids = new Set<string>();

                for (const m of tabMatches) {
                    const name = m[1], gid = m[2];
                    if (!seenGids.has(gid)) { seenGids.add(gid); tabs.push({ name, gid }); }
                }
                for (const m of tabMatchesAlt) {
                    const gid = m[1], name = m[2];
                    if (!seenGids.has(gid)) { seenGids.add(gid); tabs.push({ name, gid }); }
                }
                for (const m of tabButtonMatches) {
                    const gid = m[1], name = m[2].trim();
                    if (!seenGids.has(gid)) { seenGids.add(gid); tabs.push({ name, gid }); }
                }

                if (!tabs.length) {
                    return json({ success: false, error: 'Could not discover sheet tabs. Make sure the spreadsheet is published to the web (File → Share → Publish to web).' }, { status: 400 });
                }

                // Filter tabs that look like dates (YYYY-MM-DD or DD-MM-YYYY or similar)
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                const dateTabsRaw = tabs.filter(t => dateRegex.test(t.name.trim()));

                // Also try DD/MM/YYYY, DD-MM-YYYY, etc.
                const altDateRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
                const altDateTabs = tabs.filter(t => !dateRegex.test(t.name.trim()) && altDateRegex.test(t.name.trim()));
                for (const t of altDateTabs) {
                    const m = t.name.trim().match(altDateRegex);
                    if (m) {
                        // Assume DD-MM-YYYY
                        const isoDate = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
                        dateTabsRaw.push({ name: isoDate, gid: t.gid });
                    }
                }

                if (!dateTabsRaw.length) {
                    return json({
                        success: false,
                        error: `Found ${tabs.length} tab(s) but none have date names (YYYY-MM-DD). Tab names found: ${tabs.map(t => t.name).join(', ')}`,
                    }, { status: 400 });
                }

                // Fetch CSV for each date tab and parse
                let totalRows = 0;
                let totalInstructorRows = 0;
                const processedDates: string[] = [];
                const errors: string[] = [];

                for (const tab of dateTabsRaw) {
                    try {
                        // Try both export URL patterns — /export works for shared sheets, /pub works for published
                        let csvText = '';
                        for (const csvUrl of [
                            `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${tab.gid}`,
                            `https://docs.google.com/spreadsheets/d/${sheetId}/pub?output=csv&gid=${tab.gid}`
                        ]) {
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
