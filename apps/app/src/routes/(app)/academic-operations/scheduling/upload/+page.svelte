<script lang="ts">
  import { fade, fly } from "svelte/transition";

  let files: FileList | null = $state(null);
  let isDragging = $state(false);
  let uploadStatus = $state<"idle" | "uploading" | "success" | "error">("idle");

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    files = e.dataTransfer?.files || null;
  }

  function handleFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    files = target.files;
  }

  async function uploadTimetable() {
    if (!files || files.length === 0) return;
    uploadStatus = "uploading";
    
    // Simulate upload delay
    setTimeout(() => {
        uploadStatus = "success";
    }, 2000);
  }
</script>

<div class="max-w-4xl space-y-8" in:fade>
  <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm">
    <div class="mb-8">
      <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Timetable <span class="text-indigo-600">Ingestion</span></h2>
      <p class="text-sm text-gray-500 font-medium mt-1">Upload university timetable (XLSX/CSV) to detect conflicts and publish.</p>
    </div>

    {#if uploadStatus === 'idle' || uploadStatus === 'uploading'}
      <div 
        role="button"
        tabindex="0"
        onclic={() => document.getElementById('file-input')?.click()}
        onkeydown={(e) => e.key === 'Enter' && document.getElementById('file-input')?.click()}
        ondragover={(e) => { e.preventDefault(); isDragging = true; }}
        ondragleave={() => isDragging = false}
        ondrop={handleDrop}
        class="relative h-64 border-2 border-dashed {isDragging ? 'border-indigo-600 bg-indigo-50/50' : 'border-gray-200 dark:border-slate-800'} rounded-[2rem] flex flex-col items-center justify-center transition-all cursor-pointer group"
      >
        <input 
            id="file-input"
            type="file" 
            class="hidden" 
            accept=".xlsx,.xls,.csv"
            onchange={handleFileSelect}
        />
        
        <div class="p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl mb-4 group-hover:scale-110 transition-transform">
          <svg class="w-8 h-8 text-gray-400 group-hover:text-indigo-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
        </div>

        <p class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">
            {files ? files[0].name : 'Click to upload or drag & drop'}
        </p>
        <p class="text-xs text-gray-400 font-bold mt-2 uppercase tracking-tighter">XLSX, XLS or CSV files up to 20MB</p>

        {#if uploadStatus === 'uploading'}
          <div class="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm rounded-[2rem] flex flex-col items-center justify-center">
            <div class="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p class="mt-4 text-xs font-black uppercase tracking-widest text-indigo-600">Processing Rules...</p>
          </div>
        {/if}
      </div>

      <div class="mt-8 flex justify-end gap-3">
        <button class="px-6 py-3 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
          Download Template
        </button>
        <button 
            onclick={uploadTimetable}
            disabled={!files || uploadStatus === 'uploading'}
            class="px-8 py-3 bg-indigo-600 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
        >
          Analyze & Validate
        </button>
      </div>
    {:else if uploadStatus === 'success'}
      <div class="py-12 text-center" in:fly={{ y: 10 }}>
        <div class="p-4 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 rounded-full w-fit mx-auto mb-6">
            <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
        </div>
        <h3 class="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">Analysis Complete</h3>
        <p class="text-gray-500 dark:text-gray-400 font-medium mt-2">We found 0 conflicts across 452 sessions.</p>
        
        <div class="mt-10 grid grid-cols-3 gap-6 text-left">
            <div class="p-5 bg-gray-50 dark:bg-slate-800 rounded-3xl">
                <p class="text-[10px] font-black text-gray-400 uppercase mb-1">Total Sessions</p>
                <p class="text-2xl font-black text-gray-900 dark:text-white">452</p>
            </div>
            <div class="p-5 bg-gray-50 dark:bg-slate-800 rounded-3xl">
                <p class="text-[10px] font-black text-gray-400 uppercase mb-1">Faculty</p>
                <p class="text-2xl font-black text-gray-900 dark:text-white">38</p>
            </div>
            <div class="p-5 bg-gray-50 dark:bg-slate-800 rounded-3xl">
                <p class="text-[10px] font-black text-gray-400 uppercase mb-1">Rooms</p>
                <p class="text-2xl font-black text-gray-900 dark:text-white">12</p>
            </div>
        </div>

        <div class="mt-10 flex justify-center gap-4">
            <button onclick={() => uploadStatus = 'idle'} class="px-8 py-3 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-900 transition-colors">
                Cancel
            </button>
            <button class="px-10 py-3 bg-emerald-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all">
                Publish Schedule
            </button>
        </div>
      </div>
    {/if}
  </div>

  <!-- Validation Status Sidebar (Mock) -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm">
        <h3 class="text-sm font-black text-gray-900 dark:text-white tracking-widest uppercase mb-6">Validation Checklist</h3>
        <div class="space-y-4">
            {#each ['Faculty Clash Detection', 'Room Capacity Verification', 'Section Availability', 'Consecutive Class Rules'] as check}
                <div class="flex items-center gap-3">
                    <div class="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                    </div>
                    <span class="text-sm font-bold text-gray-700 dark:text-gray-300">{check}</span>
                </div>
            {/each}
        </div>
      </div>

      <div class="p-8 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-[2.5rem] shadow-sm">
        <h3 class="text-sm font-black text-amber-900 dark:text-amber-100 tracking-widest uppercase mb-4">Pro-Tip</h3>
        <p class="text-xs text-amber-800 dark:text-amber-200 font-medium leading-relaxed">
            Ensure your file follows the UniConnect standard format. The system will automatically suggest substitutes if a faculty member is on leave during a scheduled class.
        </p>
      </div>
  </div>
</div>
