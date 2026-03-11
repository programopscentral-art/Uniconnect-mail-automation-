<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  let profile = $state<any>(null);
  let loading = $state(true);
  let knownSubjects = $state<any[]>([]);
  let knownSubLoading = $state(false);

  let newSubjectName = $state('');
  let newLevel = $state('PROFICIENT');
  let adding = $state(false);
  let msg = $state('');
  let msgType = $state<'success' | 'error'>('success');

  const levels = [
    { key: 'BASIC', label: 'Basic', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
    { key: 'PROFICIENT', label: 'Proficient', color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' },
    { key: 'EXPERT', label: 'Expert', color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400' },
  ];

  function levelColor(level: string) {
    return levels.find(l => l.key === level)?.color || 'bg-gray-100 text-gray-500';
  }

  onMount(async () => {
    try {
      const res = await fetch('/api/academic/faculty/me');
      if (res.ok) {
        const data = await res.json();
        profile = data.profile;
        if (profile) loadKnownSubjects();
      }
    } finally { loading = false; }
  });

  async function loadKnownSubjects() {
    if (!profile) return;
    knownSubLoading = true;
    try {
      const res = await fetch(`/api/academic/faculty/known-subjects?facultyProfileId=${profile.id}`);
      if (res.ok) knownSubjects = await res.json();
    } catch { } finally { knownSubLoading = false; }
  }

  async function addSubject() {
    if (!newSubjectName.trim() || !profile) return;
    adding = true; msg = '';
    try {
      const res = await fetch('/api/academic/faculty/known-subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faculty_profile_id: profile.id,
          subject_name: newSubjectName.trim(),
          proficiency_level: newLevel
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success === false) {
          msg = data.message || 'Failed to add'; msgType = 'error';
        } else {
          msg = 'Subject added!'; msgType = 'success';
          newSubjectName = '';
          newLevel = 'PROFICIENT';
          loadKnownSubjects();
        }
      } else {
        const err = await res.json().catch(() => ({}));
        msg = err.message || 'Failed to add'; msgType = 'error';
      }
      setTimeout(() => msg = '', 3000);
    } catch { msg = 'Network error'; msgType = 'error'; setTimeout(() => msg = '', 3000); }
    finally { adding = false; }
  }

  async function removeSubject(id: string) {
    await fetch(`/api/academic/faculty/known-subjects?id=${id}`, { method: 'DELETE' });
    knownSubjects = knownSubjects.filter(k => k.id !== id);
  }
</script>

<div class="space-y-6" in:fade>
  <div>
    <a href="/faculty-portal/dashboard" class="text-xs font-bold text-indigo-600 hover:underline mb-1 inline-block">&larr; Back to Dashboard</a>
    <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">My <span class="text-indigo-600">Expertise</span></h2>
    <p class="text-xs font-medium text-gray-400 mt-1">Add subjects you can teach so admins can assign you accordingly</p>
  </div>

  {#if loading}
    <div class="p-20 flex flex-col items-center">
      <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent animate-spin rounded-full mb-4"></div>
    </div>
  {:else if !profile}
    <div class="text-center py-16 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl">
      <p class="text-gray-500 font-bold text-sm">No faculty profile found</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

      <!-- Add Subject Form -->
      <div class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2rem] space-y-4">
        <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Add Subject You Can Teach</p>

        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Subject Name <span class="text-rose-500">*</span></label>
          <input type="text" bind:value={newSubjectName} placeholder="e.g. French, Thermodynamics, Data Structures..."
            class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Proficiency Level</label>
          <div class="grid grid-cols-3 gap-2">
            {#each levels as l}
              <button onclick={() => newLevel = l.key}
                class="py-2 px-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all
                  {newLevel === l.key ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600' : 'border-gray-100 dark:border-slate-700 text-gray-400 hover:border-gray-300'}">
                {l.label}
              </button>
            {/each}
          </div>
        </div>

        {#if msg}
          <div class="p-3 rounded-xl text-xs font-bold {msgType === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}" transition:fade>{msg}</div>
        {/if}

        <button onclick={addSubject} disabled={adding || !newSubjectName.trim()}
          class="w-full py-3 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-600/20">
          {adding ? 'Adding...' : 'Add Subject'}
        </button>
      </div>

      <!-- My Known Subjects List -->
      <div class="lg:col-span-2 space-y-4">
        <div class="flex items-center justify-between">
          <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest">My Known Subjects</p>
          <span class="text-[10px] text-gray-400">{knownSubjects.length} subject{knownSubjects.length !== 1 ? 's' : ''}</span>
        </div>

        {#if knownSubLoading}
          <div class="p-12 flex justify-center">
            <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent animate-spin rounded-full"></div>
          </div>
        {:else if knownSubjects.length === 0}
          <div class="p-16 bg-white dark:bg-slate-900 border border-dashed border-gray-200 dark:border-slate-700 rounded-[2rem] flex flex-col items-center text-center">
            <div class="w-16 h-16 bg-indigo-50 dark:bg-indigo-500/10 rounded-full flex items-center justify-center mb-4">
              <svg class="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
            </div>
            <p class="text-sm font-black text-gray-500">No subjects added yet</p>
            <p class="text-[10px] text-gray-400 mt-1">Add subjects you can teach using the form</p>
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            {#each knownSubjects as ks, i}
              <div class="p-4 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl flex items-center justify-between gap-3 group hover:shadow-md transition-all" in:fly={{ y: 10, delay: i * 40 }}>
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 font-black text-[10px] shrink-0">
                    {ks.subject_name?.slice(0, 2).toUpperCase()}
                  </div>
                  <div class="min-w-0">
                    <h4 class="text-sm font-black text-gray-900 dark:text-white truncate">{ks.subject_name}</h4>
                    <span class="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded {levelColor(ks.proficiency_level)}">{ks.proficiency_level}</span>
                  </div>
                </div>
                <button onclick={() => removeSubject(ks.id)} class="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all" title="Remove">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
