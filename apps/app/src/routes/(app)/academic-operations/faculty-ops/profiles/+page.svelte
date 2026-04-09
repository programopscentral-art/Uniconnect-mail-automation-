<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { getContext } from "svelte";
  import { page } from "$app/stores";

  let faculty = $state<any[]>([]);
  let programs = $state<any[]>([]);
  let terms = $state<any[]>([]);
  let allSubjects = $state<any[]>([]);
  let loading = $state(true);
  let selectedProgram = $state('');
  let selectedTerm = $state('');
  let searchQuery = $state('');

  // Profile detail/edit panel
  let selectedFaculty = $state<any>(null);
  let panelOpen = $state(false);
  let panelMode = $state<'view' | 'edit'>('view');
  let editForm = $state<any>({});
  let assigningSubject = $state(false);
  let subjectSearchQuery = $state('');
  let savingMsg = $state('');
  let saving = $state(false);
  let expandedSubjectName = $state<string | null>(null);

  // Known subjects (expertise)
  let knownSubjects = $state<any[]>([]);
  let knownSubLoading = $state(false);
  let newKnownSubject = $state('');
  let newKnownLevel = $state('PROFICIENT');
  let addingKnown = $state(false);

  // Add new instructor
  let showAddModal = $state(false);
  let addForm = $state({ name: '', email: '', phone: '', employee_code: '', department: '', designation: '', specialization: '' });
  let addSaving = $state(false);
  let addError = $state('');

  // Delete confirmation
  let deleteConfirm = $state<string | null>(null);

  const univCtx = getContext<{ get: () => string }>('facultyOpsUniversityId');
  const universityId = $derived(univCtx?.get() || $page.data?.user?.university_id || '');

  $effect(() => { if (universityId) init(); });

  async function init() {
    const [progRes, termsRes] = await Promise.all([
      fetch(`/api/academic/programs?universityId=${universityId}`),
      fetch(`/api/academic/terms?universityId=${universityId}`)
    ]);
    if (progRes.ok) programs = await progRes.json();
    if (termsRes.ok) terms = await termsRes.json();
    await loadFaculty();
  }

  async function loadFaculty() {
    loading = true;
    try {
      const params = new URLSearchParams({ universityId });
      if (selectedTerm) params.set('termId', selectedTerm);
      if (selectedProgram) params.set('programId', selectedProgram);
      const [facultyRes, subjectsRes] = await Promise.all([
        fetch(`/api/academic/faculty/subjects?${params}`),
        fetch(`/api/academic/subjects/by-university?universityId=${universityId}`)
      ]);
      if (facultyRes.ok) faculty = await facultyRes.json();
      if (subjectsRes.ok) allSubjects = await subjectsRes.json();
    } finally {
      loading = false;
    }
  }

  $effect(() => { selectedProgram; selectedTerm; if (universityId) loadFaculty(); });

  const filtered = $derived(
    faculty.filter(f =>
      !searchQuery ||
      f.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.employee_code?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  function openProfile(f: any) {
    selectedFaculty = f;
    panelOpen = true;
    panelMode = 'view';
    subjectSearchQuery = '';
    savingMsg = '';
    loadKnownSubjects(f.id);
  }

  async function loadKnownSubjects(facultyProfileId: string) {
    knownSubLoading = true;
    try {
      const res = await fetch(`/api/academic/faculty/known-subjects?facultyProfileId=${facultyProfileId}`);
      if (res.ok) knownSubjects = await res.json();
      else knownSubjects = [];
    } catch { knownSubjects = []; }
    finally { knownSubLoading = false; }
  }

  async function addKnownSubject() {
    if (!newKnownSubject.trim() || !selectedFaculty) return;
    addingKnown = true;
    savingMsg = '';
    try {
      const res = await fetch('/api/academic/faculty/known-subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faculty_profile_id: selectedFaculty.id,
          subject_name: newKnownSubject.trim(),
          proficiency_level: newKnownLevel
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success === false) {
          savingMsg = data.message || 'Failed to add';
        } else {
          newKnownSubject = '';
          newKnownLevel = 'PROFICIENT';
          savingMsg = 'Added!';
          loadKnownSubjects(selectedFaculty.id);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        savingMsg = err.message || 'Failed to add known subject';
      }
      setTimeout(() => savingMsg = '', 3000);
    } catch { savingMsg = 'Network error'; setTimeout(() => savingMsg = '', 3000); }
    finally { addingKnown = false; }
  }

  async function removeKnownSubject(id: string) {
    await fetch(`/api/academic/faculty/known-subjects?id=${id}`, { method: 'DELETE' });
    knownSubjects = knownSubjects.filter(k => k.id !== id);
  }

  function startEdit() {
    editForm = {
      name: selectedFaculty.name || '',
      email: selectedFaculty.email || '',
      phone: selectedFaculty.phone || '',
      employee_code: selectedFaculty.employee_code || '',
      department: selectedFaculty.department || '',
      designation: selectedFaculty.designation || '',
      specialization: selectedFaculty.specialization || ''
    };
    panelMode = 'edit';
  }

  async function saveEdit() {
    if (!selectedFaculty) return;
    saving = true;
    savingMsg = '';
    try {
      const res = await fetch('/api/academic/faculty', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedFaculty.id, ...editForm })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success === false) {
          savingMsg = data.message || 'Failed to save';
          setTimeout(() => savingMsg = '', 4000);
        } else {
          savingMsg = 'Saved!';
          panelMode = 'view';
          await loadFaculty();
          selectedFaculty = faculty.find(f => f.id === selectedFaculty.id) || selectedFaculty;
          setTimeout(() => savingMsg = '', 2000);
        }
      } else {
        try {
          const err = await res.json();
          savingMsg = err.message || 'Failed to save';
        } catch { savingMsg = 'Failed to save'; }
        setTimeout(() => savingMsg = '', 4000);
      }
    } finally {
      saving = false;
    }
  }

  async function deleteFaculty(id: string) {
    await fetch(`/api/academic/faculty?id=${id}`, { method: 'DELETE' });
    deleteConfirm = null;
    panelOpen = false;
    selectedFaculty = null;
    await loadFaculty();
  }

  async function removeSubject(mappingId: string) {
    await fetch(`/api/academic/faculty/subjects?mappingId=${mappingId}`, { method: 'DELETE' });
    await loadFaculty();
    if (selectedFaculty) {
      selectedFaculty = faculty.find(f => f.id === selectedFaculty.id) || selectedFaculty;
    }
  }

  async function assignSubject(subjectId: string) {
    if (!selectedFaculty) return;
    assigningSubject = true;
    savingMsg = '';
    try {
      const res = await fetch('/api/academic/faculty/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faculty_profile_id: selectedFaculty.id, subject_id: subjectId })
      });
      if (res.ok) {
        const data = await res.json();
        savingMsg = data.already_exists ? 'Already assigned' : 'Assigned!';
        await loadFaculty();
        selectedFaculty = faculty.find(f => f.id === selectedFaculty.id) || selectedFaculty;
        setTimeout(() => savingMsg = '', 2000);
      } else {
        savingMsg = 'Failed to assign';
        setTimeout(() => savingMsg = '', 3000);
      }
    } finally {
      assigningSubject = false;
    }
  }

  async function addNewInstructor() {
    addSaving = true;
    addError = '';
    try {
      // Create user first if email provided
      let userId: string | null = null;
      if (addForm.email) {
        const userRes = await fetch('/api/academic/faculty', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ university_id: universityId, ...addForm, user_id: null })
        });
        if (userRes.ok) {
          showAddModal = false;
          addForm = { name: '', email: '', phone: '', employee_code: '', department: '', designation: '', specialization: '' };
          await loadFaculty();
          return;
        } else {
          const err = await userRes.json();
          addError = err.message || 'Failed to create faculty';
          return;
        }
      }
      // Create without user
      const res = await fetch('/api/academic/faculty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ university_id: universityId, ...addForm, user_id: null })
      });
      if (res.ok) {
        showAddModal = false;
        addForm = { name: '', email: '', phone: '', employee_code: '', department: '', designation: '', specialization: '' };
        await loadFaculty();
      } else {
        const err = await res.json();
        addError = err.message || 'Failed to create faculty';
      }
    } finally {
      addSaving = false;
    }
  }

  // Group subjects by name for assignment UX — click subject, see branches
  const groupedSubjectsForAssign = $derived(() => {
    const filtered = allSubjects.filter(s =>
      !subjectSearchQuery || s.name?.toLowerCase().includes(subjectSearchQuery.toLowerCase()) || s.code?.toLowerCase().includes(subjectSearchQuery.toLowerCase())
    );
    const groups = new Map<string, { name: string; entries: any[] }>();
    for (const s of filtered) {
      const key = s.name?.toLowerCase() || s.id;
      if (!groups.has(key)) groups.set(key, { name: s.name, entries: [] });
      const isAssigned = (selectedFaculty?.subjects || []).some((a: any) => a.subject_id === s.id);
      groups.get(key)!.entries.push({ ...s, isAssigned });
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  });

  function getInitials(name: string) {
    return (name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  }

  function getUniqueSubs(subjects: any[]) {
    const map = new Map<string, { code: string; name: string; branches: string[] }>();
    for (const sub of subjects) {
      const key = sub.subject_name?.toLowerCase() || sub.subject_id;
      if (!map.has(key)) map.set(key, { code: sub.subject_code, name: sub.subject_name, branches: [] });
      if (sub.program_name) map.get(key)!.branches.push(sub.program_name);
    }
    return Array.from(map.values());
  }

  function getDesignationColor(d: string) {
    if (!d) return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
    const dl = d.toLowerCase();
    if (dl.includes('professor') && !dl.includes('assistant') && !dl.includes('associate')) return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
    if (dl.includes('associate')) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    if (dl.includes('assistant')) return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300';
    if (dl.includes('guest') || dl.includes('visiting')) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';
  }
</script>

<div class="space-y-6" in:fade>
  <!-- Filters — semester first, program optional -->
  <div class="flex flex-wrap items-center gap-3">
    <!-- Semester (primary filter) -->
    <div class="relative">
      <select bind:value={selectedTerm} onchange={() => loadFaculty()}
        class="pl-4 pr-9 py-2.5 bg-indigo-600 text-white border-none rounded-xl text-xs font-bold focus:ring-2 ring-indigo-400 outline-none appearance-none cursor-pointer min-w-[160px]">
        <option value="">All Semesters</option>
        {#each terms as t}
          <option value={t.id}>{t.name}</option>
        {/each}
      </select>
      <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/70">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
      </div>
    </div>

    <!-- Program (secondary filter) -->
    <div class="relative">
      <select bind:value={selectedProgram} onchange={() => loadFaculty()}
        class="pl-4 pr-9 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500 outline-none appearance-none cursor-pointer min-w-[160px]">
        <option value="">All Programs</option>
        {#each programs as p}
          <option value={p.id}>{p.code} — {p.name}</option>
        {/each}
      </select>
      <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
      </div>
    </div>

    <!-- Search -->
    <div class="relative flex-1 min-w-[180px]">
      <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
      </svg>
      <input type="text" placeholder="Search by name, dept, code..." bind:value={searchQuery}
        class="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-2 ring-indigo-500 outline-none" />
    </div>

    <!-- Add New Instructor -->
    <button onclick={() => showAddModal = true}
      class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2 shrink-0">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
      Add Instructor
    </button>

    <span class="ml-auto text-xs font-bold text-gray-500 shrink-0">{filtered.length} faculty</span>
  </div>

  <!-- Faculty Grid -->
  {#if loading}
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {#each Array(6) as _}
        <div class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl animate-pulse">
          <div class="flex gap-3 mb-4"><div class="w-11 h-11 rounded-xl bg-gray-200 dark:bg-slate-700 shrink-0"></div><div class="flex-1 space-y-2 min-w-0"><div class="h-4 bg-gray-200 dark:bg-slate-700 rounded w-3/4"></div><div class="h-3 bg-gray-100 dark:bg-slate-800 rounded w-1/2"></div></div></div>
          <div class="h-12 bg-gray-50 dark:bg-slate-800 rounded-xl"></div>
        </div>
      {/each}
    </div>
  {:else if filtered.length === 0}
    <div class="text-center py-20 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl">
      <div class="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-slate-800 mx-auto flex items-center justify-center mb-4">
        <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
      </div>
      <p class="text-gray-500 font-bold text-sm mb-1">No faculty found</p>
      <p class="text-gray-400 text-xs">Try adjusting filters or import faculty data first</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {#each filtered as f, i}
        <button
          class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-200 group text-left overflow-hidden"
          in:fly={{ y: 12, delay: Math.min(i * 30, 200) }}
          onclick={() => openProfile(f)}
        >
          <!-- Top row: avatar + name + designation badge -->
          <div class="flex items-start gap-3 mb-3 min-w-0">
            <div class="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 font-black text-xs shrink-0">{getInitials(f.name)}</div>
            <div class="min-w-0 flex-1">
              <div class="flex items-start gap-2 min-w-0">
                <h4 class="font-black text-gray-900 dark:text-white group-hover:text-indigo-600 transition-colors text-sm truncate min-w-0 flex-1">{f.name}</h4>
                {#if f.designation}
                  <span class="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap {getDesignationColor(f.designation)}">{f.designation.length > 12 ? f.designation.slice(0, 12) + '...' : f.designation}</span>
                {/if}
              </div>
              <p class="text-[10px] font-bold text-gray-400 mt-0.5 truncate">{f.department || '—'}</p>
            </div>
          </div>

          <!-- Subject tags — grouped by name -->
          <div class="flex flex-wrap gap-1 mb-3 min-h-[24px]">
            {#each getUniqueSubs(f.subjects || []).slice(0, 3) as sub}
              <span class="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded">
                {sub.code || sub.name?.slice(0, 8)}{#if sub.branches.length > 1} <span class="text-indigo-400">({sub.branches.length})</span>{/if}
              </span>
            {/each}
            {#if getUniqueSubs(f.subjects || []).length > 3}
              <span class="text-[8px] font-bold px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-500 rounded">+{getUniqueSubs(f.subjects || []).length - 3}</span>
            {/if}
            {#if (f.subjects || []).length === 0}
              <span class="text-[9px] font-bold text-gray-400 italic">No subjects</span>
            {/if}
          </div>

          <!-- Bottom row: emp code + subject count -->
          <div class="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-slate-800">
            <div class="min-w-0">
              <p class="text-[8px] font-black text-gray-400 uppercase tracking-widest">Emp. Code</p>
              <p class="text-[11px] font-black text-gray-600 dark:text-gray-300 font-mono mt-0.5 truncate">{f.employee_code || '—'}</p>
            </div>
            <div class="text-right shrink-0">
              <p class="text-[8px] font-black text-gray-400 uppercase tracking-widest">Subjects</p>
              <p class="text-sm font-black text-indigo-600 mt-0.5">{getUniqueSubs(f.subjects || []).length}</p>
            </div>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<!-- Profile detail/edit panel -->
{#if panelOpen && selectedFaculty}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div role="button" tabindex="0" class="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" transition:fade={{ duration: 150 }} onclick={() => panelOpen = false}></div>
  <div class="fixed right-0 top-0 h-full w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl z-50 flex flex-col overflow-hidden" transition:fly={{ x: 400, duration: 250 }}>
    <!-- Header -->
    <div class="px-6 py-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-11 h-11 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 font-black shrink-0">{getInitials(selectedFaculty.name)}</div>
        <div class="min-w-0">
          <h3 class="font-black text-gray-900 dark:text-white text-base truncate">{selectedFaculty.name}</h3>
          <p class="text-[10px] font-bold text-gray-400 truncate">{selectedFaculty.designation || 'Faculty'} · {selectedFaculty.department || '—'}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        {#if panelMode === 'view'}
          <button onclick={startEdit} class="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 hover:bg-indigo-100 transition-colors" title="Edit">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
          <button onclick={() => deleteConfirm = selectedFaculty.id} class="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors" title="Delete">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        {/if}
        <button aria-label="Close" onclick={() => panelOpen = false} class="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-800 flex items-center justify-center hover:bg-gray-200 transition-colors">
          <svg class="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-6 space-y-6">
      {#if savingMsg}
        <div class="px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-lg text-center" transition:fade>{savingMsg}</div>
      {/if}

      {#if panelMode === 'edit'}
        <!-- Edit form -->
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            {#each [
              { key: 'name', label: 'Full Name', full: true },
              { key: 'email', label: 'Email', full: true },
              { key: 'phone', label: 'Phone' },
              { key: 'employee_code', label: 'Employee Code' },
              { key: 'department', label: 'Department' },
              { key: 'designation', label: 'Designation' },
              { key: 'specialization', label: 'Specialization', full: true }
            ] as field}
              <div class={field.full ? 'col-span-2' : ''}>
                <!-- svelte-ignore a11y_label_has_associated_control -->
                <label class="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{field.label}</label>
                <input type="text" bind:value={editForm[field.key]}
                  class="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white focus:ring-2 ring-indigo-500 outline-none" />
              </div>
            {/each}
          </div>
          <div class="flex gap-2 pt-2">
            <button onclick={saveEdit} disabled={saving}
              class="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button onclick={() => panelMode = 'view'}
              class="px-4 py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 text-xs font-bold rounded-xl hover:bg-gray-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <!-- View mode: Info grid -->
        <div class="grid grid-cols-2 gap-3">
          {#each [
            { label: 'Employee Code', value: selectedFaculty.employee_code },
            { label: 'Email', value: selectedFaculty.email },
            { label: 'Phone', value: selectedFaculty.phone },
            { label: 'Department', value: selectedFaculty.department },
            { label: 'Designation', value: selectedFaculty.designation },
            { label: 'Specialization', value: selectedFaculty.specialization }
          ] as info}
            <div class="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl">
              <p class="text-[8px] font-black text-gray-400 uppercase tracking-widest">{info.label}</p>
              <p class="text-xs font-bold text-gray-800 dark:text-gray-200 mt-1 truncate">{info.value || '—'}</p>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Assigned subjects — grouped by subject name showing branches -->
      <div>
        <h4 class="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-widest mb-3">
          Assigned Subjects
          <span class="ml-1 text-indigo-600">{(selectedFaculty.subjects || []).length}</span>
        </h4>
        {#if (selectedFaculty.subjects || []).length === 0}
          <p class="text-xs text-gray-400 font-medium italic py-4 text-center bg-gray-50 dark:bg-slate-800 rounded-xl">No subjects assigned yet</p>
        {:else}
          {@const groupedAssigned = (() => {
            const map = new Map();
            for (const sub of (selectedFaculty.subjects || [])) {
              const key = sub.subject_name?.toLowerCase() || sub.subject_id;
              if (!map.has(key)) map.set(key, { name: sub.subject_name, code: sub.subject_code, entries: [] });
              map.get(key).entries.push(sub);
            }
            return Array.from(map.values());
          })()}
          <div class="space-y-2">
            {#each groupedAssigned as group}
              <div class="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl">
                <div class="flex items-center gap-2 mb-1.5">
                  <span class="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded shrink-0">{group.code}</span>
                  <p class="text-xs font-bold text-gray-800 dark:text-gray-200 truncate flex-1">{group.name}</p>
                </div>
                <div class="flex flex-wrap gap-1">
                  {#each group.entries as sub}
                    <div class="flex items-center gap-1 px-2 py-1 bg-white dark:bg-slate-900 rounded-lg group">
                      <span class="text-[9px] font-bold text-indigo-500">{sub.program_name}</span>
                      <span class="text-[8px] text-gray-400">({sub.term_name})</span>
                      <button aria-label="Remove subject" onclick={() => removeSubject(sub.mapping_id)} class="w-4 h-4 rounded bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shrink-0">
                        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Known Subjects (Expertise) -->
      <div>
        <h4 class="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-widest mb-3">
          Known Subjects <span class="text-[9px] font-medium text-gray-400 normal-case">(can teach)</span>
          <span class="ml-1 text-emerald-600">{knownSubjects.length}</span>
        </h4>

        {#if knownSubLoading}
          <div class="py-4 flex justify-center"><div class="w-5 h-5 border-2 border-indigo-600 border-t-transparent animate-spin rounded-full"></div></div>
        {:else}
          {#if knownSubjects.length > 0}
            <div class="space-y-1.5 mb-3">
              {#each knownSubjects as ks}
                <div class="flex items-center justify-between p-2.5 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl group">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{ks.subject_name}</span>
                    <span class="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0
                      {ks.proficiency_level === 'EXPERT' ? 'bg-purple-100 text-purple-600' :
                       ks.proficiency_level === 'PROFICIENT' ? 'bg-blue-100 text-blue-600' :
                       'bg-gray-100 text-gray-500'}">{ks.proficiency_level}</span>
                  </div>
                  <button aria-label="Remove expertise" onclick={() => removeKnownSubject(ks.id)} class="w-5 h-5 rounded bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shrink-0 ml-2">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-xs text-gray-400 font-medium italic py-3 text-center bg-gray-50 dark:bg-slate-800 rounded-xl mb-3">No known subjects added</p>
          {/if}

          <!-- Add known subject form -->
          <div class="flex gap-2">
            <input type="text" bind:value={newKnownSubject} placeholder="e.g. French, English, Thermodynamics..."
              class="flex-1 px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-2 ring-emerald-500 outline-none" />
            <select bind:value={newKnownLevel} class="px-2 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-[10px] font-bold">
              <option value="BASIC">Basic</option>
              <option value="PROFICIENT">Proficient</option>
              <option value="EXPERT">Expert</option>
            </select>
            <button onclick={addKnownSubject} disabled={addingKnown || !newKnownSubject.trim()}
              class="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase rounded-xl transition-colors disabled:opacity-50 shrink-0">
              {addingKnown ? '...' : 'Add'}
            </button>
          </div>
        {/if}
      </div>

      <!-- Assign new subject — grouped by subject name, branches expandable -->
      {#if allSubjects.length > 0}
        <div>
          <h4 class="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-widest mb-3">
            Assign Subject
          </h4>
          <input type="text" placeholder="Search subjects by name or code..." bind:value={subjectSearchQuery}
            class="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium mb-3 focus:ring-2 ring-indigo-500 outline-none" />
          {#if groupedSubjectsForAssign().length === 0}
            <p class="text-xs text-gray-400 text-center py-3">No subjects found</p>
          {:else}
            <div class="space-y-1 max-h-64 overflow-y-auto">
              {#each groupedSubjectsForAssign() as group}
                {@const allAssigned = group.entries.every(e => e.isAssigned)}
                <div class="rounded-xl overflow-hidden">
                  <button
                    onclick={() => expandedSubjectName = expandedSubjectName === group.name ? null : group.name}
                    class="w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors
                      {expandedSubjectName === group.name ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700'}"
                  >
                    <div class="flex items-center gap-2 min-w-0">
                      <svg class="w-3 h-3 text-gray-400 shrink-0 transition-transform {expandedSubjectName === group.name ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
                      <span class="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{group.name}</span>
                      <span class="text-[9px] font-bold text-gray-400 shrink-0">{group.entries.length} branch{group.entries.length > 1 ? 'es' : ''}</span>
                    </div>
                    {#if allAssigned}
                      <span class="text-[8px] font-black text-emerald-600 uppercase tracking-widest shrink-0">All Assigned</span>
                    {/if}
                  </button>
                  {#if expandedSubjectName === group.name}
                    <div class="border-t border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 space-y-1">
                      {#each group.entries as entry}
                        <div class="flex items-center justify-between py-1.5 px-2 rounded-lg {entry.isAssigned ? 'bg-emerald-50 dark:bg-emerald-900/10' : 'hover:bg-indigo-50 dark:hover:bg-indigo-900/10'} transition-colors">
                          <div class="flex items-center gap-2 min-w-0">
                            <span class="text-[8px] font-black uppercase px-1.5 py-0.5 bg-gray-200 dark:bg-slate-700 text-gray-500 rounded shrink-0">{entry.program_code || entry.program_name?.slice(0, 6)}</span>
                            <span class="text-[10px] text-gray-500 truncate">{entry.term_name}</span>
                          </div>
                          {#if entry.isAssigned}
                            <span class="text-[9px] font-black text-emerald-600 shrink-0">Assigned</span>
                          {:else}
                            <button onclick={() => assignSubject(entry.id)} disabled={assigningSubject}
                              class="text-[9px] font-black text-indigo-600 hover:text-indigo-800 shrink-0 disabled:opacity-50">+ Assign</button>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Delete confirmation dialog -->
{#if deleteConfirm}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center" transition:fade={{ duration: 100 }} onclick={() => deleteConfirm = null}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" transition:fly={{ y: 20 }} onclick={(e) => e.stopPropagation()}>
      <div class="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4">
        <svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
      </div>
      <h3 class="text-sm font-black text-gray-900 dark:text-white text-center mb-1">Remove Faculty Member?</h3>
      <p class="text-xs text-gray-500 text-center mb-5">This will deactivate the faculty profile. They can be restored later.</p>
      <div class="flex gap-3">
        <button onclick={() => deleteConfirm = null} class="flex-1 py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
        <button onclick={() => deleteFaculty(deleteConfirm!)} class="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors">Remove</button>
      </div>
    </div>
  </div>
{/if}

<!-- Add New Instructor modal -->
{#if showAddModal}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center" transition:fade={{ duration: 100 }} onclick={() => showAddModal = false}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" transition:fly={{ y: 20 }} onclick={(e) => e.stopPropagation()}>
      <h3 class="text-base font-black text-gray-900 dark:text-white mb-1">Add New Instructor</h3>
      <p class="text-xs text-gray-400 font-medium mb-5">Create a new faculty profile manually.</p>

      {#if addError}
        <div class="px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 text-xs font-bold rounded-lg mb-4">{addError}</div>
      {/if}

      <div class="space-y-3">
        <div>
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Full Name *</label>
          <input type="text" bind:value={addForm.name} placeholder="Dr. John Doe"
            class="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-2 ring-indigo-500 outline-none" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Employee Code *</label>
            <input type="text" bind:value={addForm.employee_code} placeholder="EMP001"
              class="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-2 ring-indigo-500 outline-none" />
          </div>
          <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Phone</label>
            <input type="text" bind:value={addForm.phone} placeholder="9876543210"
              class="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-2 ring-indigo-500 outline-none" />
          </div>
        </div>
        <div>
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Email</label>
          <input type="email" bind:value={addForm.email} placeholder="john@university.edu"
            class="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-2 ring-indigo-500 outline-none" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Department</label>
            <input type="text" bind:value={addForm.department} placeholder="Computer Science"
              class="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-2 ring-indigo-500 outline-none" />
          </div>
          <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Designation</label>
            <input type="text" bind:value={addForm.designation} placeholder="Assistant Professor"
              class="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-2 ring-indigo-500 outline-none" />
          </div>
        </div>
        <div>
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Specialization</label>
          <input type="text" bind:value={addForm.specialization} placeholder="Machine Learning, AI"
            class="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-2 ring-indigo-500 outline-none" />
        </div>
      </div>

      <div class="flex gap-3 mt-5">
        <button onclick={() => showAddModal = false} class="flex-1 py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
        <button onclick={addNewInstructor} disabled={addSaving || !addForm.name || !addForm.employee_code}
          class="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50">
          {addSaving ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  </div>
{/if}
