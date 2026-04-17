<script lang="ts">
    import { onMount } from 'svelte';
    import {
        Calendar, ChevronLeft, ChevronRight, UserPlus, UserMinus,
        Check, X, Clock, Home, BookOpen, Save, Loader2,
        Users, CheckCircle, XCircle, AlertTriangle, GraduationCap, BarChart3
    } from 'lucide-svelte';

    let { data } = $props();

    type Tab = 'attendance' | 'directory' | 'summary';
    type AttStatus = 'present' | 'absent' | 'training' | 'wfh' | 'leave' | 'half_day';

    let activeTab = $state<Tab>('attendance');
    let selectedDate = $state(new Date().toISOString().split('T')[0]);
    let universityId = $state(data.universityId || '');
    let universities = $state<any[]>([]);
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

    function setStatus(instructorId: string, status: AttStatus) {
        const existing = pendingChanges.get(instructorId);
        pendingChanges.set(instructorId, { status, notes: existing?.notes || '' });
        pendingChanges = new Map(pendingChanges); // trigger reactivity
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
        if (pendingChanges.size === 0) { flash('No attendance marked yet', true); return; }
        saving = true;
        try {
            // 1. Save attendance
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
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                flash(j.message || `Save failed: ${res.status}`, true);
                saving = false;
                return;
            }
            const j = await res.json();

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

            flash(`Saved: ${j.count} attendance${workloadCount > 0 ? ` + ${workloadCount} workload logs` : ''}`);
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
            }
        } catch (e: any) {
            flash(e?.message || 'Remove failed', true);
        }
    }

    // ─── Lifecycle ────────────────────────────────────────

    onMount(async () => {
        if (data.userRole === 'ADMIN' || data.userRole === 'PROGRAM_OPS') {
            await loadUniversities();
        }
        if (universityId) loadAttendance();
    });

    $effect(() => {
        if (!universityId) return;
        if (activeTab === 'attendance') loadAttendance();
        else if (activeTab === 'directory') loadDirectory();
        else if (activeTab === 'summary') loadSummary();
    });

    $effect(() => { selectedDate; if (activeTab === 'attendance' && universityId) loadAttendance(); });

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

        {#if data.userRole === 'ADMIN' || data.userRole === 'PROGRAM_OPS'}
            <select
                bind:value={universityId}
                class="text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
                <option value="">Select university</option>
                {#each universities as u}
                    <option value={u.id || u}>{typeof u === 'string' ? u : u.name || u.short_name}</option>
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
                    <button
                        onclick={submitAttendance}
                        disabled={saving || pendingChanges.size === 0}
                        class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                               bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {#if saving}
                            <Loader2 size={14} class="animate-spin" />
                        {:else}
                            <Save size={14} />
                        {/if}
                        Submit Attendance
                    </button>
                </div>
            </div>

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
                                <!-- Faculty info + expand toggle -->
                                <button
                                    onclick={() => toggleExpand(row.instructor_id)}
                                    class="flex-1 min-w-0 text-left group"
                                >
                                    <div class="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                                        {row.name}
                                        <span class="text-[10px] text-zinc-400 ml-1">{isExpanded ? '▾' : '▸'}</span>
                                    </div>
                                    <div class="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                        {row.designation || '—'}
                                        {#if row.subjects && row.subjects.length > 0}
                                            · {row.subjects.join(', ')}
                                        {/if}
                                    </div>
                                </button>

                                <!-- Status buttons -->
                                <div class="flex items-center gap-1">
                                    {#each Object.entries(statusMeta) as [key, meta]}
                                        {@const isActive = current?.status === key}
                                        <button
                                            onclick={() => setStatus(row.instructor_id, key as AttStatus)}
                                            class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border
                                                   {isActive
                                                       ? `${meta.bg} ${meta.darkBg} ${meta.color} dark:${meta.color.replace('700', '300')} border-current`
                                                       : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-700'}"
                                            title={meta.label}
                                        >
                                            {meta.short}
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
            {:else}
                <p class="text-sm text-zinc-500 dark:text-zinc-400">Select a month and year above.</p>
            {/if}
        {/if}
    {/if}
</div>
