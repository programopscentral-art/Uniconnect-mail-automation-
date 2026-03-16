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
    parseOpsCSV, generateOpsSampleData,
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

        case 'load-sample': {
            try {
                const { dailyData, instructorData } = generateOpsSampleData();
                await upsertOpsDailyData(dailyData);
                await upsertOpsInstructorDaily(instructorData);
                return json({
                    success: true,
                    rowsProcessed: dailyData.length,
                    instructorRows: instructorData.length,
                    message: 'Sample data loaded'
                });
            } catch (e: any) {
                console.error('[OPS] Sample data error:', e);
                return json({ success: false, error: e.message || 'Failed to load sample data. Has the migration been run?' }, { status: 500 });
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
