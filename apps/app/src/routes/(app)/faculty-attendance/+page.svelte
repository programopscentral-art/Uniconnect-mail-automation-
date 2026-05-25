<script lang="ts">
    import { onMount } from 'svelte';
    import {
        Calendar, ChevronLeft, ChevronRight, UserPlus, UserMinus,
        Check, X, Clock, Home, BookOpen, Save, Loader2,
        Users, CheckCircle, XCircle, AlertTriangle, GraduationCap, BarChart3,
        Phone, Target
    } from 'lucide-svelte';

    let { data } = $props();

    type Tab = 'attendance' | 'directory' | 'coaches' | 'summary';
    type AttStatus = 'present' | 'absent' | 'training' | 'wfh' | 'leave' | 'half_day';

    let activeTab = $state<Tab>('attendance');
    let selectedDate = $state(new Date().toISOString().split('T')[0]);
    let universityId = $state(data.universityId || '');
    let universityName = $state(data.universityName || '');
    let universities = $state<any[]>(data.allUniversities || []);
    let loading = $state(false);
    let saving = $state(false);
    let successMsg = $state('');
    let errorMsg = $state('');

    // ─── Attendance state ─────────────────────────────────
    let attendanceRows = $state<any[]>([]);
    let pendingChanges = $state<Map<string, { status: AttStatus; notes: string }>>(new Map());
    let workloadData = $state<Map<string, { sessions: number; topics: string }>>(new Map());
    let expandedRow = $state<string | null>(null);

    // ─── Directory state ──────────────────────────────────
    let instructors = $state<any[]>([]);
    let showAddForm = $state(false);
    let newFaculty = $state({ name: '', email: '', phone: '', designation: '', department: '', subjects: '' });
    let addingFaculty = $state(false);

    // ─── Summary state ────────────────────────────────────
    let summaryData = $state<any>(null);
    let summaryDaily = $state<any[]>([]);
    let monthlyReport = $state<any[]>([]);
    let summaryYear = $state(new Date().getFullYear());
    let summaryMonth = $state(new Date().getMonth() + 1);

    // ─── Coach state ─────────────────────────────────────
    let coachRows = $state<any[]>([]);
    let coachCallData = $state<Map<string, { student: number; parent: number; target: number; notes: string }>>(new Map());
    let coaches = $state<any[]>([]);
    let showAddCoachForm = $state(false);
    let newCoach = $state({ name: '', email: '', phone: '', daily_call_target: 15 });
    let addingCoach = $state(false);
    let savingCoach = $state(false);
    let monthlyCoachReport = $state<any[]>([]);
    let expandedCoach = $state<string | null>(null);

    // ─── Helpers ──────────────────────────────────────────
    const statusMeta: Record<AttStatus, { label: string; short: string; color: string; bg: string; darkBg: string }> = {
        present: { label: 'Present', short: 'P', color: 'text-emerald-700', bg: 'bg-emerald-100', darkBg: 'dark:bg-emerald-950/40' },
        absent: { label: 'Absent', short: 'A', color: 'text-rose-700', bg: 'bg-rose-100', darkBg: 'dark:bg-rose-950/40' },
        training: { label: 'Training', short: 'T', color: 'text-sky-700', bg: 'bg-sky-100', darkBg: 'dark:bg-sky-950/40' },
        wfh: { label: 'WFH', short: 'W', color: 'text-violet-700', bg: 'bg-violet-100', darkBg: 'dark:bg-violet-950/40' },
        leave: { label: 'Leave', short: 'L', color: 'text-amber-700', bg: 'bg-amber-100', darkBg: 'dark:bg-amber-950/40' },
        half_day: { label: 'Half Day', short: 'H', color: 'text-orange-700', bg: 'bg-orange-100', darkBg: 'dark:bg-orange-950/40' }
    };

    function shiftDate(dir: 1 | -1) {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + dir);
        selectedDate = d.toISOString().split('T')[0];
    }

    function today() { selectedDate = new Date().toISOString().split('T')[0]; }

    function flash(msg: string, isErr = false) {
        if (isErr) { errorMsg = msg; setTimeout(() => errorMsg = '', 4000); }
        else { successMsg = msg; setTimeout(() => successMsg = '', 3000); }
    }

    // ─── Loaders ──────────────────────────────────────────

    async function loadUniversities() {
        try {
            const res = await fetch('/api/ops', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'get-universities' })
            });
            if (res.ok) {
                const j = await res.json();
                universities = j.universities || [];
            }
        } catch {}
    }

    async function loadAttendance() {
        if (!universityId) return;
        loading = true;
        try {
            const res = await fetch(`/api/faculty-attendance?view=attendance&universityId=${universityId}&date=${selectedDate}`);
            if (res.ok) {
                const j = await res.json();
                attendanceRows = j.attendance || [];
                pendingChanges = new Map();
                // Pre-fill with existing status
                for (const r of attendanceRows) {
                    if (r.status) {
                        pendingChanges.set(r.instructor_id, { status: r.status, notes: r.notes || '' });
                    }
                }
            }
        } catch (e: any) {
            flash(e?.message || 'Failed to load attendance', true);
        } finally {
            loading = false;
        }
    }

    async function loadDirectory() {
        if (!universityId) return;
        loading = true;
        try {
            const res = await fetch(`/api/faculty-attendance?view=faculty&universityId=${universityId}`);
            if (res.ok) {
                const j = await res.json();
                instructors = j.instructors || [];
            }
        } catch (e: any) {
            flash(e?.message || 'Failed to load directory', true);
        } finally {
            loading = false;
        }
    }

    async function loadSummary() {
        if (!universityId) return;
        loading = true;
        try {
            const startDate = `${summaryYear}-${String(summaryMonth).padStart(2, '0')}-01`;
            const endDate = new Date(summaryYear, summaryMonth, 0).toISOString().split('T')[0];
            const [summRes, reportRes] = await Promise.all([
                fetch(`/api/faculty-attendance?view=summary&universityId=${universityId}&startDate=${startDate}&endDate=${endDate}`).then(r => r.ok ? r.json() : null),
                fetch(`/api/faculty-attendance?view=monthly-report&universityId=${universityId}&year=${summaryYear}&month=${summaryMonth}`).then(r => r.ok ? r.json() : null)
            ]);
            summaryData = summRes?.summary || null;
            summaryDaily = summRes?.daily || [];
            monthlyReport = reportRes?.report || [];
        } catch (e: any) {
            flash(e?.message || 'Failed to load summary', true);
        } finally {
            loading = false;
        }
    }

    // ─── Actions ──────────────────────────────────────────

    // Track per-row save state for instant visual feedback
    let rowSaving = $state<Map<string, boolean>>(new Map());
    // Track if user has acknowledged the Sunday warning (per-page-load)
    let sundayConfirmed = $state(false);

    function isWeekend(dateStr: string): boolean {
        const d = new Date(dateStr + 'T00:00:00');
        return d.getDay() === 0; // 0 = Sunday
    }

    function dateLabel(dateStr: string): string {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    async function setStatus(instructorId: string, status: AttStatus, instructorName: string) {
        // Sunday warning: confirm before marking on a Sunday
        if (isWeekend(selectedDate) && !sundayConfirmed) {
            const confirmed = confirm(
                `⚠️ You're marking attendance for ${dateLabel(selectedDate)}.\n\n` +
                `This is a SUNDAY. Are you sure you have the right date?\n\n` +
                `Click OK to continue marking, or Cancel to change the date first.`
            );
            if (!confirmed) return;
            sundayConfirmed = true;
        }

        const existing = pendingChanges.get(instructorId);

        // Toggle: clicking the same status again → clear the mark
        if (existing?.status === status) {
            pendingChanges.delete(instructorId);
            pendingChanges = new Map(pendingChanges);
            rowSaving.set(instructorId, true);
            rowSaving = new Map(rowSaving);
            try {
                await fetch('/api/faculty-attendance', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'clear-attendance', instructor_id: instructorId, date: selectedDate })
                });
                flash(`Cleared attendance for ${instructorName}`);
            } catch (e: any) {
                flash(e?.message || 'Failed to clear', true);
            } finally {
                rowSaving.delete(instructorId);
                rowSaving = new Map(rowSaving);
            }
            return;
        }

        // Set new status — update UI immediately, then auto-save in background
        pendingChanges.set(instructorId, { status, notes: existing?.notes || '' });
        pendingChanges = new Map(pendingChanges);
        rowSaving.set(instructorId, true);
        rowSaving = new Map(rowSaving);

        try {
            const res = await fetch('/api/faculty-attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'mark-attendance',
                    instructor_id: instructorId,
                    university_id: universityId,
                    date: selectedDate,
                    status,
                    notes: existing?.notes || undefined
                })
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                flash(j.message || `Save failed for ${instructorName}`, true);
                // Roll back UI on failure
                if (existing) pendingChanges.set(instructorId, existing);
                else pendingChanges.delete(instructorId);
                pendingChanges = new Map(pendingChanges);
            }
        } catch (e: any) {
            flash(e?.message || 'Save failed', true);
        } finally {
            rowSaving.delete(instructorId);
            rowSaving = new Map(rowSaving);
        }
    }

    function setNotes(instructorId: string, notes: string) {
        const existing = pendingChanges.get(instructorId);
        if (existing) {
            existing.notes = notes;
            pendingChanges = new Map(pendingChanges);
        }
    }

    function setWorkload(instructorId: string, field: 'sessions' | 'topics', value: any) {
        const existing = workloadData.get(instructorId) || { sessions: 0, topics: '' };
        if (field === 'sessions') existing.sessions = Number(value) || 0;
        else existing.topics = String(value);
        workloadData.set(instructorId, existing);
        workloadData = new Map(workloadData);
    }

    function toggleExpand(instructorId: string) {
        expandedRow = expandedRow === instructorId ? null : instructorId;
    }

    async function submitAttendance() {
        // Status is auto-saved per-click via setStatus().
        // This button now only re-saves notes + workload (which still need explicit save
        // because they're free-text inputs that we don't want to fire requests on every keystroke).
        saving = true;
        try {
            // 1. Re-save attendance with current notes (status hasn't changed since it auto-saves)
            let savedCount = 0;
            if (pendingChanges.size > 0) {
                const entries = Array.from(pendingChanges.entries()).map(([instructor_id, { status, notes }]) => ({
                    instructor_id,
                    university_id: universityId,
                    date: selectedDate,
                    status,
                    notes: notes || undefined
                }));
                const res = await fetch('/api/faculty-attendance', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'mark-bulk-attendance', entries })
                });
                if (res.ok) {
                    const j = await res.json();
                    savedCount = j.count || 0;
                }
            }

            // 2. Save workload logs for those who have topics/sessions filled
            let workloadCount = 0;
            for (const [instructor_id, wl] of workloadData.entries()) {
                if (wl.sessions > 0 || wl.topics.trim()) {
                    try {
                        await fetch('/api/faculty-attendance', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                action: 'log-workload',
                                instructor_id,
                                university_id: universityId,
                                date: selectedDate,
                                sessions_taken: wl.sessions,
                                topics_covered: wl.topics.trim() || undefined
                            })
                        });
                        workloadCount++;
                    } catch {}
                }
            }

            if (savedCount === 0 && workloadCount === 0) {
                flash('Nothing to save — attendance is already auto-saved.');
            } else {
                flash(`Saved notes/workload: ${savedCount} entries${workloadCount > 0 ? ` + ${workloadCount} workload logs` : ''}`);
            }
            await loadAttendance();
        } catch (e: any) {
            flash(e?.message || 'Save failed', true);
        } finally {
            saving = false;
        }
    }

    async function addFaculty() {
        if (!newFaculty.name.trim()) { flash('Name is required', true); return; }
        addingFaculty = true;
        try {
            const res = await fetch('/api/faculty-attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'add-faculty',
                    university_id: universityId,
                    name: newFaculty.name.trim(),
                    email: newFaculty.email.trim() || undefined,
                    phone: newFaculty.phone.trim() || undefined,
                    designation: newFaculty.designation.trim() || undefined,
                    department: newFaculty.department.trim() || undefined,
                    subjects: newFaculty.subjects ? newFaculty.subjects.split(',').map(s => s.trim()).filter(Boolean) : []
                })
            });
            if (res.ok) {
                flash('Faculty member added');
                newFaculty = { name: '', email: '', phone: '', designation: '', department: '', subjects: '' };
                showAddForm = false;
                await loadDirectory();
                loadAttendance(); // refresh attendance list too
            } else {
                const j = await res.json().catch(() => ({}));
                flash(j.message || 'Add failed', true);
            }
        } catch (e: any) {
            flash(e?.message || 'Add failed', true);
        } finally {
            addingFaculty = false;
        }
    }

    async function removeFaculty(id: string, name: string) {
        if (!confirm(`Remove ${name} from the active list? They won't appear in future attendance.`)) return;
        try {
            const res = await fetch('/api/faculty-attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'remove-faculty', id })
            });
            if (res.ok) {
                flash(`${name} removed`);
                await loadDirectory();
                loadAttendance();
            }
        } catch (e: any) {
            flash(e?.message || 'Remove failed', true);
        }
    }

    // ─── Coach loaders & actions ────────────────────────────

    async function loadCoachLogs() {
        if (!universityId) return;
        loading = true;
        try {
            const res = await fetch(`/api/faculty-attendance?view=coach-logs&universityId=${universityId}&date=${selectedDate}`);
            if (res.ok) {
                const j = await res.json();
                coachRows = j.logs || [];
                coachCallData = new Map();
                for (const r of coachRows) {
                    // Only populate if there's actual logged data for this date
                    // (student_calls or parent_calls > 0, or notes filled)
                    const studentCalls = Number(r.student_calls_made) || 0;
                    const parentCalls = Number(r.parent_calls_made) || 0;
                    const hasData = studentCalls > 0 || parentCalls > 0 || (r.notes && r.notes.trim());
                    if (hasData) {
                        // Preserve a saved daily_target of 0 (invigilation day).
                        // Only fall back to profile target if the row didn't save one.
                        const savedDayTarget = r.daily_target == null ? null : Number(r.daily_target);
                        const profileTarget = Number(r.daily_call_target);
                        const resolvedTarget = savedDayTarget !== null && !Number.isNaN(savedDayTarget)
                            ? savedDayTarget
                            : (Number.isFinite(profileTarget) ? profileTarget : 15);
                        coachCallData.set(r.coach_id, {
                            student: studentCalls,
                            parent: parentCalls,
                            target: resolvedTarget,
                            notes: r.notes || ''
                        });
                    }
                }
            }
        } catch (e: any) { flash(e?.message || 'Failed to load coach data', true); }
        finally { loading = false; }
    }

    async function loadCoachDirectory() {
        if (!universityId) return;
        loading = true;
        try {
            const res = await fetch(`/api/faculty-attendance?view=coaches&universityId=${universityId}`);
            if (res.ok) { coaches = (await res.json()).coaches || []; }
        } catch (e: any) { flash(e?.message || 'Failed', true); }
        finally { loading = false; }
    }

    async function loadMonthlyCoachReport() {
        if (!universityId) return;
        try {
            const res = await fetch(`/api/faculty-attendance?view=monthly-coach-report&universityId=${universityId}&year=${summaryYear}&month=${summaryMonth}`);
            if (res.ok) { monthlyCoachReport = (await res.json()).report || []; }
        } catch {}
    }

    // Use a separate plain object for input values so Svelte doesn't
    // re-render and reset the input mid-typing. Only sync to coachCallData
    // on blur (when user finishes typing).
    let coachInputValues = $state<Record<string, { student: string; parent: string; target: string; notes: string }>>({});

    function getCoachInput(coachId: string, field: 'student' | 'parent' | 'target' | 'notes'): string {
        if (coachInputValues[coachId]?.[field] !== undefined) return coachInputValues[coachId][field];
        const cd = coachCallData.get(coachId);
        if (!cd) return field === 'target' ? '15' : '';
        if (field === 'student') return cd.student > 0 ? String(cd.student) : '';
        if (field === 'parent') return cd.parent > 0 ? String(cd.parent) : '';
        if (field === 'target') return String(cd.target);
        return cd.notes || '';
    }

    function updateCoachInput(coachId: string, field: 'student' | 'parent' | 'target' | 'notes', value: string) {
        if (!coachInputValues[coachId]) coachInputValues[coachId] = { student: '', parent: '', target: '', notes: '' };
        coachInputValues[coachId][field] = value;
        coachInputValues = { ...coachInputValues };
    }

    function commitCoachInput(coachId: string, defaultTarget = 15) {
        const inp = coachInputValues[coachId];
        if (!inp) return;
        const existing = coachCallData.get(coachId) || { student: 0, parent: 0, target: defaultTarget, notes: '' };
        // Use Number.isFinite after parseInt so a typed "0" is preserved as 0
        // (coach on invigilation that day). Empty string still falls back.
        if (inp.student !== '') {
            const n = parseInt(inp.student);
            existing.student = Number.isFinite(n) ? n : 0;
        }
        if (inp.parent !== '') {
            const n = parseInt(inp.parent);
            existing.parent = Number.isFinite(n) ? n : 0;
        }
        if (inp.target !== '') {
            const n = parseInt(inp.target);
            existing.target = Number.isFinite(n) ? n : defaultTarget;
        }
        if (inp.notes !== undefined) existing.notes = inp.notes;
        coachCallData.set(coachId, existing);
        coachCallData = new Map(coachCallData);
    }

    async function submitCoachLogs() {
        // Commit any pending input values before checking
        const touchedCoachIds = new Set(Object.keys(coachInputValues));
        for (const coachId of touchedCoachIds) {
            commitCoachInput(coachId);
        }
        if (coachCallData.size === 0) { flash('No call data entered', true); return; }
        savingCoach = true;
        try {
            let count = 0;
            for (const [coach_id, d] of coachCallData.entries()) {
                // Save if the user actually touched this coach's inputs OR
                // there are non-zero call counts already loaded. The magic
                // `target !== 15` check is gone — coaches need to be able
                // to save target=0 for invigilation days.
                if (touchedCoachIds.has(coach_id) || d.student > 0 || d.parent > 0) {
                    const res = await fetch('/api/faculty-attendance', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'log-coach-calls', coach_id,
                            university_id: universityId, date: selectedDate,
                            student_calls_made: d.student, parent_calls_made: d.parent,
                            daily_target: d.target, notes: d.notes || undefined
                        })
                    });
                    if (res.ok) count++;
                }
            }
            flash(`Saved call data for ${count} coaches`);
            await loadCoachLogs();
        } catch (e: any) { flash(e?.message || 'Save failed', true); }
        finally { savingCoach = false; }
    }

    async function addCoach() {
        if (!newCoach.name.trim()) { flash('Name required', true); return; }
        addingCoach = true;
        try {
            const res = await fetch('/api/faculty-attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'add-coach', university_id: universityId,
                    name: newCoach.name.trim(), email: newCoach.email.trim() || undefined,
                    phone: newCoach.phone.trim() || undefined,
                    daily_call_target: newCoach.daily_call_target ?? 15
                })
            });
            if (res.ok) {
                flash('Success coach added');
                newCoach = { name: '', email: '', phone: '', daily_call_target: 15 };
                showAddCoachForm = false;
                await loadCoachLogs(); // refresh the main list immediately
            }
        } catch (e: any) { flash(e?.message || 'Failed', true); }
        finally { addingCoach = false; }
    }

    async function removeCoach(id: string, name: string) {
        if (!confirm(`Remove ${name}?`)) return;
        try {
            await fetch('/api/faculty-attendance', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'remove-coach', id })
            });
            flash(`${name} removed`);
            await loadCoachLogs();
        } catch {}
    }

    // ─── Lifecycle ────────────────────────────────────────

    onMount(() => {
        // BOAs auto-load their university's data immediately
        if (universityId) loadAttendance();
    });

    $effect(() => {
        if (!universityId) return;
        if (activeTab === 'attendance') loadAttendance();
        else if (activeTab === 'directory') loadDirectory();
        else if (activeTab === 'coaches') { loadCoachLogs(); loadCoachDirectory(); }
        else if (activeTab === 'summary') { loadSummary(); loadMonthlyCoachReport(); }
    });

    $effect(() => {
        selectedDate;
        // Reset Sunday acknowledgment when user changes date — so they're reminded again
        sundayConfirmed = false;
        if (!universityId) return;
        if (activeTab === 'attendance') loadAttendance();
        else if (activeTab === 'coaches') loadCoachLogs();
    });

    const markedCount = $derived(pendingChanges.size);
    const totalFaculty = $derived(attendanceRows.length);
    const presentCount = $derived(Array.from(pendingChanges.values()).filter(v => v.status === 'present').length);
    const absentCount = $derived(Array.from(pendingChanges.values()).filter(v => v.status === 'absent').length);
</script>

<svelte:head>
    <title>Faculty Attendance</title>
</svelte:head>

<div class="max-w-5xl mx-auto">
    <!-- Header -->
    <div class="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
            <h1 class="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Faculty Attendance</h1>
            <p class="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Mark daily attendance, manage faculty, and view reports.</p>
        </div>

        {#if universities.length > 0}
            <select
                bind:value={universityId}
                class="text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500 min-w-[180px]"
            >
                <option value="">Select university</option>
                {#each universities as u}
                    <option value={u.id}>{u.name}</option>
                {/each}
            </select>
        {/if}
    </div>

    <!-- Notifications -->
    {#if successMsg}
        <div class="mb-4 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-sm font-medium border border-emerald-200 dark:border-emerald-900/40">
            {successMsg}
        </div>
    {/if}
    {#if errorMsg}
        <div class="mb-4 px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 text-sm font-medium border border-rose-200 dark:border-rose-900/40">
            {errorMsg}
        </div>
    {/if}

    {#if !universityId}
        <div class="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-10 text-center">
            <Users size={40} class="mx-auto text-zinc-300 dark:text-zinc-600 mb-4" />
            <p class="text-zinc-500 dark:text-zinc-400">Select a university to manage faculty attendance.</p>
        </div>
    {:else}
        <!-- Tabs -->
        <div class="flex gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 mb-5">
            {#each [
                { id: 'attendance', label: 'Mark Attendance', icon: CheckCircle },
                { id: 'directory', label: 'Faculty Directory', icon: Users },
                { id: 'coaches', label: 'Success Coaches', icon: Phone },
                { id: 'summary', label: 'Monthly Summary', icon: BarChart3 }
            ] as tab}
                <button
                    onclick={() => activeTab = tab.id as Tab}
                    class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all
                           {activeTab === tab.id
                               ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                               : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}"
                >
                    <svelte:component this={tab.icon} size={15} />
                    <span class="hidden sm:inline">{tab.label}</span>
                </button>
            {/each}
        </div>

        <!-- ── ATTENDANCE TAB ─────────────────────────── -->
        {#if activeTab === 'attendance'}
            <!-- Date nav + submit -->
            <div class="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div class="inline-flex items-center gap-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-1.5 py-1">
                    <button onclick={() => shiftDate(-1)} class="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"><ChevronLeft size={14} /></button>
                    <div class="flex items-center gap-1.5 px-2">
                        <Calendar size={12} class="text-zinc-400" />
                        <input type="date" bind:value={selectedDate} class="bg-transparent text-sm text-zinc-800 dark:text-zinc-100 border-0 focus:outline-none focus:ring-0 p-0 min-w-[130px]" />
                    </div>
                    <button onclick={() => shiftDate(1)} class="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"><ChevronRight size={14} /></button>
                    <button onclick={today} class="text-xs font-medium px-2 py-1 rounded-lg text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40">Today</button>
                </div>

                <div class="flex items-center gap-3">
                    <div class="flex items-center gap-3 text-xs font-medium">
                        <span class="text-zinc-500 dark:text-zinc-400">{markedCount}/{totalFaculty} marked</span>
                        <span class="text-emerald-600 dark:text-emerald-400">{presentCount} P</span>
                        <span class="text-rose-600 dark:text-rose-400">{absentCount} A</span>
                    </div>
                    <span class="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle size={12} /> Auto-saved
                    </span>
                    <button
                        onclick={submitAttendance}
                        disabled={saving || (pendingChanges.size === 0 && workloadData.size === 0)}
                        class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                               bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Save notes and workload entries (status is auto-saved on click)"
                    >
                        {#if saving}
                            <Loader2 size={14} class="animate-spin" />
                        {:else}
                            <Save size={14} />
                        {/if}
                        Save Notes & Workload
                    </button>
                </div>
            </div>

            <!-- Sunday warning banner -->
            {#if isWeekend(selectedDate)}
                <div class="mb-4 flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800">
                    <AlertTriangle size={18} class="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div class="flex-1 text-sm">
                        <div class="font-bold text-amber-900 dark:text-amber-200">
                            Heads-up — you're marking attendance for a SUNDAY ({dateLabel(selectedDate)})
                        </div>
                        <div class="text-amber-700 dark:text-amber-300 mt-0.5">
                            Most faculty don't work on Sundays. Double-check the date before marking. You'll be asked to confirm on first click.
                        </div>
                    </div>
                    <button onclick={today} class="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white whitespace-nowrap">
                        Go to Today
                    </button>
                </div>
            {/if}

            <!-- Attendance grid -->
            {#if loading}
                <div class="space-y-2">
                    {#each Array(6) as _}
                        <div class="h-16 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-pulse"></div>
                    {/each}
                </div>
            {:else if attendanceRows.length === 0}
                <div class="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-10 text-center">
                    <GraduationCap size={40} class="mx-auto text-zinc-300 dark:text-zinc-600 mb-3" />
                    <p class="text-zinc-500 dark:text-zinc-400 mb-2">No faculty members found.</p>
                    <button onclick={() => activeTab = 'directory'} class="text-sm text-sky-600 dark:text-sky-400 hover:underline">
                        Go to Faculty Directory to add instructors →
                    </button>
                </div>
            {:else}
                <div class="flex flex-col gap-1.5">
                    {#each attendanceRows as row}
                        {@const current = pendingChanges.get(row.instructor_id)}
                        {@const wl = workloadData.get(row.instructor_id)}
                        {@const isExpanded = expandedRow === row.instructor_id}
                        <div class="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors overflow-hidden {current ? 'ring-1 ring-emerald-200 dark:ring-emerald-900/40' : ''}">
                            <!-- Main row: name + status buttons -->
                            <div class="flex items-center gap-3 p-3">
                                <!-- Faculty info + expand arrow -->
                                <button
                                    onclick={() => toggleExpand(row.instructor_id)}
                                    class="flex items-center gap-2 flex-1 min-w-0 text-left group"
                                >
                                    <ChevronRight size={14} class="text-zinc-400 transition-transform shrink-0 {isExpanded ? 'rotate-90' : ''} group-hover:text-sky-500" />
                                    <div class="min-w-0">
                                        <div class="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                                            {row.name}
                                        </div>
                                        <div class="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                            {row.designation || 'No designation'}
                                            {#if row.subjects && row.subjects.length > 0}
                                                · {row.subjects.join(', ')}
                                            {:else}
                                                · <span class="text-amber-500 italic">No subjects added — click to edit</span>
                                            {/if}
                                        </div>
                                    </div>
                                </button>

                                <!-- Status buttons — full labels on md+, short on mobile. Click again to clear. -->
                                <div class="flex items-center gap-1 flex-wrap">
                                    {#if rowSaving.get(row.instructor_id)}
                                        <Loader2 size={14} class="animate-spin text-sky-500 mr-1" />
                                    {/if}
                                    {#each Object.entries(statusMeta) as [key, meta]}
                                        {@const isActive = current?.status === key}
                                        <button
                                            onclick={() => setStatus(row.instructor_id, key as AttStatus, row.name)}
                                            disabled={rowSaving.get(row.instructor_id)}
                                            class="px-2 md:px-3 py-1.5 rounded-lg text-[10px] md:text-[11px] font-bold transition-all border disabled:opacity-50
                                                   {isActive
                                                       ? `${meta.bg} ${meta.darkBg} ${meta.color} dark:${meta.color.replace('700', '300')} border-current shadow-sm`
                                                       : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-700'}"
                                            title={isActive ? `${meta.label} (click again to clear)` : meta.label}
                                        >
                                            <span class="md:hidden">{meta.short}</span>
                                            <span class="hidden md:inline">{meta.label}</span>
                                        </button>
                                    {/each}
                                </div>
                            </div>

                            <!-- Expanded: Notes + Workload -->
                            {#if isExpanded || current}
                                <div class="px-3 pb-3 {isExpanded ? '' : 'pt-0'} flex flex-col gap-2 border-t border-zinc-100 dark:border-zinc-800">
                                    <!-- Notes -->
                                    <div class="flex items-center gap-2 pt-2">
                                        <span class="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider w-16 shrink-0">Notes</span>
                                        <input
                                            type="text"
                                            placeholder="Attendance notes (optional)"
                                            value={current?.notes || ''}
                                            oninput={(e) => setNotes(row.instructor_id, (e.target as HTMLInputElement).value)}
                                            class="flex-1 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder-zinc-400"
                                        />
                                    </div>

                                    {#if isExpanded}
                                        <!-- Edit profile -->
                                        <div class="p-2.5 rounded-lg bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900/40">
                                            <div class="text-[9px] uppercase tracking-wider font-bold text-sky-600 dark:text-sky-400 mb-2">Edit Profile</div>
                                            <div class="grid grid-cols-2 gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Designation"
                                                    value={row.designation || ''}
                                                    onchange={async (e) => {
                                                        const val = (e.target as HTMLInputElement).value;
                                                        try {
                                                            await fetch('/api/faculty-attendance', {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ action: 'update-faculty', id: row.instructor_id, designation: val })
                                                            });
                                                            row.designation = val;
                                                            flash('Designation updated');
                                                        } catch {}
                                                    }}
                                                    class="text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder-zinc-400"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Subjects (comma-separated)"
                                                    value={(row.subjects || []).join(', ')}
                                                    onchange={async (e) => {
                                                        const val = (e.target as HTMLInputElement).value;
                                                        const subjects = val.split(',').map((s: string) => s.trim()).filter(Boolean);
                                                        try {
                                                            await fetch('/api/faculty-attendance', {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ action: 'update-faculty', id: row.instructor_id, subjects })
                                                            });
                                                            row.subjects = subjects;
                                                            flash('Subjects updated');
                                                        } catch {}
                                                    }}
                                                    class="text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder-zinc-400"
                                                />
                                            </div>
                                        </div>

                                        <!-- Sessions taken -->
                                        <div class="flex items-center gap-2">
                                            <span class="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider w-16 shrink-0">Sessions</span>
                                            <input
                                                type="number"
                                                min="0"
                                                max="20"
                                                placeholder="0"
                                                value={wl?.sessions || ''}
                                                oninput={(e) => setWorkload(row.instructor_id, 'sessions', (e.target as HTMLInputElement).value)}
                                                class="w-20 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder-zinc-400"
                                            />
                                            <span class="text-[10px] text-zinc-400">sessions taken today</span>
                                        </div>

                                        <!-- Topics covered -->
                                        <div class="flex items-start gap-2">
                                            <span class="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider w-16 shrink-0 pt-1.5">Topics</span>
                                            <textarea
                                                placeholder="Topics covered today — e.g., Ch 5: Thermodynamics, problems 1-15"
                                                rows="2"
                                                value={wl?.topics || ''}
                                                oninput={(e) => setWorkload(row.instructor_id, 'topics', (e.target as HTMLTextAreaElement).value)}
                                                class="flex-1 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder-zinc-400 resize-none"
                                            ></textarea>
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}

        <!-- ── DIRECTORY TAB ──────────────────────────── -->
        {:else if activeTab === 'directory'}
            <div class="flex items-center justify-between gap-3 mb-4">
                <h2 class="text-lg font-bold text-zinc-900 dark:text-zinc-50">{instructors.length} Faculty Members</h2>
                <button
                    onclick={() => showAddForm = !showAddForm}
                    class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold
                           {showAddForm ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200' : 'bg-sky-600 hover:bg-sky-700 text-white'} transition-colors"
                >
                    {#if showAddForm}<X size={14} /> Cancel{:else}<UserPlus size={14} /> Add Faculty{/if}
                </button>
            </div>

            {#if showAddForm}
                <div class="rounded-xl bg-white dark:bg-zinc-900 border border-sky-200 dark:border-sky-900/40 p-4 mb-4">
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                        <input bind:value={newFaculty.name} placeholder="Full name *" class="col-span-2 md:col-span-1 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                        <input bind:value={newFaculty.designation} placeholder="Designation" class="text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                        <input bind:value={newFaculty.department} placeholder="Department" class="text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                        <input bind:value={newFaculty.email} placeholder="Email" class="text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                        <input bind:value={newFaculty.phone} placeholder="Phone" class="text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                        <input bind:value={newFaculty.subjects} placeholder="Subjects (comma-sep)" class="text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                    <button
                        onclick={addFaculty}
                        disabled={addingFaculty || !newFaculty.name.trim()}
                        class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 transition-colors"
                    >
                        {#if addingFaculty}<Loader2 size={14} class="animate-spin" />{:else}<UserPlus size={14} />{/if}
                        Add
                    </button>
                </div>
            {/if}

            {#if loading}
                <div class="space-y-2">{#each Array(5) as _}<div class="h-14 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-pulse"></div>{/each}</div>
            {:else}
                <div class="flex flex-col gap-1.5">
                    {#each instructors as f}
                        <div class="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800">
                            <div class="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-violet-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                                {f.name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2">
                                    <span class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{f.name}</span>
                                    {#if !f.is_active}
                                        <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-500 uppercase font-bold">Inactive</span>
                                    {/if}
                                </div>
                                <div class="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                    {f.designation || '—'} · {f.department || '—'}
                                    {#if f.subjects?.length > 0} · {f.subjects.join(', ')}{/if}
                                    {#if f.email} · {f.email}{/if}
                                </div>
                            </div>
                            {#if f.is_active}
                                <button
                                    onclick={() => removeFaculty(f.id, f.name)}
                                    class="p-2 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                    title="Remove"
                                >
                                    <UserMinus size={14} />
                                </button>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}

        <!-- ── COACHES TAB ─────────────────────────────── -->
        {:else if activeTab === 'coaches'}
            <!-- Date nav + submit -->
            <div class="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div class="inline-flex items-center gap-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-1.5 py-1">
                    <button onclick={() => shiftDate(-1)} class="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"><ChevronLeft size={14} /></button>
                    <div class="flex items-center gap-1.5 px-2">
                        <Calendar size={12} class="text-zinc-400" />
                        <input type="date" bind:value={selectedDate} class="bg-transparent text-sm text-zinc-800 dark:text-zinc-100 border-0 focus:outline-none focus:ring-0 p-0 min-w-[130px]" />
                    </div>
                    <button onclick={() => shiftDate(1)} class="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"><ChevronRight size={14} /></button>
                    <button onclick={today} class="text-xs font-medium px-2 py-1 rounded-lg text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40">Today</button>
                </div>
                <div class="flex items-center gap-3">
                    <button
                        onclick={() => showAddCoachForm = !showAddCoachForm}
                        class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold
                               {showAddCoachForm ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 hover:bg-zinc-200'} transition-colors"
                    >
                        {#if showAddCoachForm}<X size={13} /> Cancel{:else}<UserPlus size={13} /> Add Coach{/if}
                    </button>
                    <button
                        onclick={submitCoachLogs}
                        disabled={savingCoach || coachCallData.size === 0}
                        class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                               bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 transition-colors"
                    >
                        {#if savingCoach}<Loader2 size={14} class="animate-spin" />{:else}<Save size={14} />{/if}
                        Submit Calls
                    </button>
                </div>
            </div>

            {#if showAddCoachForm}
                <div class="rounded-xl bg-white dark:bg-zinc-900 border border-sky-200 dark:border-sky-900/40 p-4 mb-4">
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                        <input bind:value={newCoach.name} placeholder="Coach name *" class="text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                        <input bind:value={newCoach.email} placeholder="Email" class="text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                        <input bind:value={newCoach.phone} placeholder="Phone" class="text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                        <div class="flex items-center gap-2">
                            <input type="number" bind:value={newCoach.daily_call_target} min="0" max="100" class="w-20 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                            <span class="text-xs text-zinc-500">daily target</span>
                        </div>
                    </div>
                    <button onclick={addCoach} disabled={addingCoach || !newCoach.name.trim()} class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 transition-colors">
                        {#if addingCoach}<Loader2 size={14} class="animate-spin" />{:else}<UserPlus size={14} />{/if} Add
                    </button>
                </div>
            {/if}

            {#if loading}
                <div class="space-y-2">{#each Array(4) as _}<div class="h-20 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-pulse"></div>{/each}</div>
            {:else if coachRows.length === 0}
                <div class="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-10 text-center">
                    <Phone size={40} class="mx-auto text-zinc-300 dark:text-zinc-600 mb-3" />
                    <p class="text-zinc-500 dark:text-zinc-400 mb-2">No success coaches found for this university.</p>
                    <p class="text-xs text-zinc-400">Click "Add Coach" above to register success coaches.</p>
                </div>
            {:else}
                <div class="flex flex-col gap-1.5">
                    {#each coachRows as row}
                        {@const cd = coachCallData.get(row.coach_id)}
                        {@const totalCalls = (cd?.student || 0) + (cd?.parent || 0)}
                        {@const profileTargetNum = Number(row.daily_call_target)}
                        {@const target = cd?.target !== undefined
                            ? cd.target
                            : (Number.isFinite(profileTargetNum) ? profileTargetNum : 15)}
                        {@const achieved = target > 0 ? Math.round((totalCalls / target) * 100) : 0}
                        {@const isExpanded = expandedCoach === row.coach_id}
                        <div class="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 overflow-hidden {cd ? 'ring-1 ring-sky-200 dark:ring-sky-900/40' : ''}">
                            <div class="flex items-center gap-3 p-3">
                                <!-- Coach info + expand arrow -->
                                <button onclick={() => expandedCoach = isExpanded ? null : row.coach_id} class="flex items-center gap-2 flex-1 min-w-0 text-left group">
                                    <ChevronRight size={14} class="text-zinc-400 transition-transform shrink-0 {isExpanded ? 'rotate-90' : ''} group-hover:text-violet-500" />
                                    <div class="min-w-0">
                                        <div class="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                                            {row.name}
                                        </div>
                                        <div class="text-[11px] text-zinc-500 dark:text-zinc-400">
                                            Target: {target} calls/day
                                            {#if cd && totalCalls > 0} · <span class="font-semibold {achieved >= 100 ? 'text-emerald-600' : achieved >= 70 ? 'text-amber-600' : 'text-rose-600'}">{achieved}% achieved</span>{:else if !cd} · <span class="text-zinc-400 italic">Not filled</span>{/if}
                                        </div>
                                    </div>
                                </button>

                                <!-- Quick call inputs -->
                                <div class="flex items-center gap-2">
                                    <div class="flex flex-col items-center">
                                        <span class="text-[9px] text-zinc-400 uppercase font-bold">Student</span>
                                        <input
                                            type="number" min="0" max="200" placeholder="0"
                                            value={getCoachInput(row.coach_id, 'student')}
                                            oninput={(e) => updateCoachInput(row.coach_id, 'student', (e.target as HTMLInputElement).value)}
                                            onblur={() => commitCoachInput(row.coach_id, Number(row.daily_call_target) || 15)}
                                            class="w-16 text-center text-sm font-bold rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-1 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                        />
                                    </div>
                                    <div class="flex flex-col items-center">
                                        <span class="text-[9px] text-zinc-400 uppercase font-bold">Parent</span>
                                        <input
                                            type="number" min="0" max="200" placeholder="0"
                                            value={getCoachInput(row.coach_id, 'parent')}
                                            oninput={(e) => updateCoachInput(row.coach_id, 'parent', (e.target as HTMLInputElement).value)}
                                            onblur={() => commitCoachInput(row.coach_id, Number(row.daily_call_target) || 15)}
                                            class="w-16 text-center text-sm font-bold rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-1 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                        />
                                    </div>
                                    <!-- Achievement chip — only show when calls are logged -->
                                    {#if cd && totalCalls > 0}
                                        <div class="w-14 text-center py-1.5 rounded-lg text-xs font-bold tabular-nums
                                             {achieved >= 100 ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400' :
                                              achieved >= 70 ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400' :
                                              'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400'}">
                                            {totalCalls}/{target}
                                        </div>
                                    {:else}
                                        <div class="w-14 text-center py-1.5 rounded-lg text-xs font-medium tabular-nums bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
                                            0/{target}
                                        </div>
                                    {/if}
                                </div>

                                <!-- Remove button -->
                                <button onclick={() => removeCoach(row.coach_id, row.name)} class="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors" title="Remove">
                                    <UserMinus size={13} />
                                </button>
                            </div>

                            {#if isExpanded}
                                <div class="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-800 flex flex-col gap-2 pt-2">
                                    <!-- Edit coach profile -->
                                    <div class="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-900/40">
                                        <div class="text-[9px] uppercase tracking-wider font-bold text-violet-600 dark:text-violet-400 mb-2">Edit Coach</div>
                                        <div class="grid grid-cols-3 gap-2">
                                            <input type="text" placeholder="Name" value={row.name || ''}
                                                onchange={async (e) => {
                                                    const val = (e.target as HTMLInputElement).value;
                                                    try { await fetch('/api/faculty-attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-coach', id: row.coach_id, name: val }) }); row.name = val; flash('Name updated'); } catch {}
                                                }}
                                                class="text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500 placeholder-zinc-400" />
                                            <input type="email" placeholder="Email" value={row.email || ''}
                                                onchange={async (e) => {
                                                    const val = (e.target as HTMLInputElement).value;
                                                    try { await fetch('/api/faculty-attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-coach', id: row.coach_id, email: val }) }); flash('Email updated'); } catch {}
                                                }}
                                                class="text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500 placeholder-zinc-400" />
                                            <div class="flex items-center gap-1">
                                                <input type="number" min="0" max="100" placeholder="15" value={row.daily_call_target ?? 15}
                                                    onchange={async (e) => {
                                                        const val = Number((e.target as HTMLInputElement).value);
                                                        try { await fetch('/api/faculty-attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-coach', id: row.coach_id, daily_call_target: val }) }); row.daily_call_target = val; flash('Target updated'); } catch {}
                                                    }}
                                                    class="w-16 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                                                <span class="text-[9px] text-zinc-400">/day</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="flex gap-3">
                                    <div class="flex items-center gap-2 flex-1">
                                        <span class="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider w-12 shrink-0">Target</span>
                                        <input type="number" min="1" max="200"
                                            value={getCoachInput(row.coach_id, 'target') || target}
                                            oninput={(e) => updateCoachInput(row.coach_id, 'target', (e.target as HTMLInputElement).value)}
                                            onblur={() => commitCoachInput(row.coach_id, Number(row.daily_call_target) || 15)}
                                            class="w-16 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-500" />
                                    </div>
                                    <div class="flex items-center gap-2 flex-[2]">
                                        <span class="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider w-12 shrink-0">Notes</span>
                                        <input type="text" placeholder="Notes (optional)"
                                            value={getCoachInput(row.coach_id, 'notes')}
                                            oninput={(e) => updateCoachInput(row.coach_id, 'notes', (e.target as HTMLInputElement).value)}
                                            onblur={() => commitCoachInput(row.coach_id, Number(row.daily_call_target) || 15)}
                                            class="flex-1 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder-zinc-400" />
                                    </div>
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}

        <!-- ── SUMMARY TAB ────────────────────────────── -->
        {:else if activeTab === 'summary'}
            <div class="flex items-center gap-3 mb-4">
                <select bind:value={summaryMonth} onchange={() => loadSummary()} class="text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-3 py-2">
                    {#each Array.from({ length: 12 }, (_, i) => i + 1) as m}
                        <option value={m}>{new Date(2024, m - 1).toLocaleDateString('en-IN', { month: 'long' })}</option>
                    {/each}
                </select>
                <select bind:value={summaryYear} onchange={() => loadSummary()} class="text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-3 py-2">
                    {#each [2024, 2025, 2026, 2027] as y}
                        <option value={y}>{y}</option>
                    {/each}
                </select>
            </div>

            {#if loading}
                <div class="h-48 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-pulse"></div>
            {:else if summaryData}
                <!-- KPI row -->
                <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                    {#each [
                        { label: 'Total faculty', value: summaryData.total_instructors, color: 'text-zinc-900 dark:text-zinc-50' },
                        { label: 'Present', value: summaryData.present, color: 'text-emerald-600 dark:text-emerald-400' },
                        { label: 'Absent', value: summaryData.absent, color: 'text-rose-600 dark:text-rose-400' },
                        { label: 'Training', value: summaryData.training, color: 'text-sky-600 dark:text-sky-400' },
                        { label: 'On leave', value: summaryData.on_leave, color: 'text-amber-600 dark:text-amber-400' }
                    ] as kpi}
                        <div class="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                            <div class="text-[10px] uppercase tracking-wider font-semibold text-zinc-500 dark:text-zinc-400">{kpi.label}</div>
                            <div class="text-2xl font-bold tabular-nums mt-1 {kpi.color}">{kpi.value || 0}</div>
                        </div>
                    {/each}
                </div>

                <!-- Monthly per-instructor table -->
                {#if monthlyReport.length > 0}
                    <div class="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        <div class="overflow-x-auto">
                            <table class="w-full text-sm">
                                <thead>
                                    <tr class="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                                        <th class="text-left py-3 px-4 font-semibold">Instructor</th>
                                        <th class="text-right py-3 px-2 font-semibold">P</th>
                                        <th class="text-right py-3 px-2 font-semibold">A</th>
                                        <th class="text-right py-3 px-2 font-semibold">T</th>
                                        <th class="text-right py-3 px-2 font-semibold">WFH</th>
                                        <th class="text-right py-3 px-2 font-semibold">Leave</th>
                                        <th class="text-right py-3 px-2 font-semibold">Sessions</th>
                                        <th class="text-right py-3 px-4 font-semibold">Att %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each monthlyReport as r}
                                        {@const total = Number(r.total_marked) || 0}
                                        {@const present = Number(r.days_present) || 0}
                                        {@const attPct = total > 0 ? Math.round((present / total) * 100) : 0}
                                        {@const attTone = attPct >= 90 ? 'text-emerald-600 dark:text-emerald-400' : attPct >= 75 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}
                                        <tr class="border-b border-zinc-50 dark:border-zinc-800/50 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                                            <td class="py-2.5 px-4">
                                                <div class="font-medium text-zinc-900 dark:text-zinc-100">{r.name}</div>
                                                <div class="text-[10px] text-zinc-500 dark:text-zinc-400">{r.designation || '—'}{r.subjects?.length ? ` · ${r.subjects.join(', ')}` : ''}</div>
                                            </td>
                                            <td class="py-2.5 px-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">{r.days_present || 0}</td>
                                            <td class="py-2.5 px-2 text-right tabular-nums text-rose-600 dark:text-rose-400 font-semibold">{r.days_absent || 0}</td>
                                            <td class="py-2.5 px-2 text-right tabular-nums text-sky-600 dark:text-sky-400">{r.days_training || 0}</td>
                                            <td class="py-2.5 px-2 text-right tabular-nums text-violet-600 dark:text-violet-400">{r.days_wfh || 0}</td>
                                            <td class="py-2.5 px-2 text-right tabular-nums text-amber-600 dark:text-amber-400">{r.days_leave || 0}</td>
                                            <td class="py-2.5 px-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300 font-semibold">{r.total_sessions || 0}</td>
                                            <td class="py-2.5 px-4 text-right tabular-nums font-bold {attTone}">{attPct}%</td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    </div>
                {:else}
                    <p class="text-sm text-zinc-500 dark:text-zinc-400">No attendance data for this month yet.</p>
                {/if}

                <!-- Coach monthly report -->
                {#if monthlyCoachReport.length > 0}
                    <h3 class="text-lg font-bold text-zinc-900 dark:text-zinc-50 mt-6 mb-3">Success Coach Performance</h3>
                    <div class="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        <div class="overflow-x-auto">
                            <table class="w-full text-sm">
                                <thead>
                                    <tr class="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                                        <th class="text-left py-3 px-4 font-semibold">Coach</th>
                                        <th class="text-right py-3 px-2 font-semibold">Days</th>
                                        <th class="text-right py-3 px-2 font-semibold">Student</th>
                                        <th class="text-right py-3 px-2 font-semibold">Parent</th>
                                        <th class="text-right py-3 px-2 font-semibold">Total</th>
                                        <th class="text-right py-3 px-2 font-semibold">Target</th>
                                        <th class="text-right py-3 px-4 font-semibold">Achieved</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each monthlyCoachReport as r}
                                        {@const achieved = Number(r.total_target) > 0 ? Math.round((Number(r.total_calls) / Number(r.total_target)) * 100) : 0}
                                        {@const acTone = achieved >= 100 ? 'text-emerald-600 dark:text-emerald-400' : achieved >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}
                                        <tr class="border-b border-zinc-50 dark:border-zinc-800/50 last:border-0">
                                            <td class="py-2.5 px-4">
                                                <div class="font-medium text-zinc-900 dark:text-zinc-100">{r.name}</div>
                                                <div class="text-[10px] text-zinc-500 dark:text-zinc-400">Target: {r.daily_call_target}/day</div>
                                            </td>
                                            <td class="py-2.5 px-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{r.days_logged || 0}</td>
                                            <td class="py-2.5 px-2 text-right tabular-nums text-sky-600 dark:text-sky-400 font-semibold">{r.total_student_calls || 0}</td>
                                            <td class="py-2.5 px-2 text-right tabular-nums text-violet-600 dark:text-violet-400 font-semibold">{r.total_parent_calls || 0}</td>
                                            <td class="py-2.5 px-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100 font-bold">{r.total_calls || 0}</td>
                                            <td class="py-2.5 px-2 text-right tabular-nums text-zinc-500 dark:text-zinc-400">{r.total_target || 0}</td>
                                            <td class="py-2.5 px-4 text-right tabular-nums font-bold {acTone}">{achieved}%</td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    </div>
                {/if}
            {:else}
                <p class="text-sm text-zinc-500 dark:text-zinc-400">Select a month and year above.</p>
            {/if}
        {/if}
    {/if}
</div>
