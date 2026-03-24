<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { page } from "$app/stores";

  let { data } = $props();
  const student = data.student;
  const user = data.user;

  // ─── Tabs ───
  let activeTab = $state<'profile' | 'documents' | 'admission' | 'audit'>('profile');

  // ─── PII ───
  let maskedPii = $state<Record<string, string>>({});
  let revealedPii = $state<Record<string, string>>({});
  let piiRevealed = $state(false);
  let piiLoading = $state(false);
  let editingPii = $state(false);
  let piiForm = $state<Record<string, string>>({});
  let savingPii = $state(false);

  // ─── Documents ───
  let documents = $state(data.documents || []);
  let documentTypes = $state(data.documentTypes || []);
  let uploadingDoc = $state(false);
  let uploadDocType = $state('');
  let showUploadModal = $state(false);

  // ─── Admission Workflow ───
  let workflow = $state(data.workflow);
  let updatingWorkflow = $state(false);

  // ─── Audit ───
  let auditLogs = $state<any[]>([]);
  let auditLoading = $state(false);

  // Load masked PII on mount
  $effect(() => {
    if (student?.id) loadMaskedPii();
  });

  async function loadMaskedPii() {
    try {
      const res = await fetch(`/api/academic/students/${student.id}/pii?masked=true`);
      if (res.ok) maskedPii = await res.json();
    } catch {}
  }

  async function revealPii() {
    piiLoading = true;
    try {
      const res = await fetch(`/api/academic/students/${student.id}/pii`);
      if (res.ok) {
        revealedPii = await res.json();
        piiRevealed = true;
      } else {
        alert('Insufficient permissions to view sensitive data');
      }
    } catch {} finally { piiLoading = false; }
  }

  function startEditPii() {
    piiForm = { ...revealedPii };
    editingPii = true;
  }

  async function savePiiChanges() {
    savingPii = true;
    try {
      const res = await fetch(`/api/academic/students/${student.id}/pii`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(piiForm)
      });
      if (res.ok) {
        revealedPii = { ...piiForm };
        editingPii = false;
        await loadMaskedPii();
      }
    } catch {} finally { savingPii = false; }
  }

  async function uploadDocument(e: Event) {
    const input = (e.target as HTMLFormElement);
    const formData = new FormData(input);

    if (!formData.get('file') || !formData.get('document_type')) {
      alert('Please select a file and document type');
      return;
    }

    formData.set('university_id', student.university_id);
    uploadingDoc = true;

    try {
      const res = await fetch(`/api/academic/students/${student.id}/documents`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const doc = await res.json();
        documents = [...documents, doc];
        showUploadModal = false;
        // Reload full doc list
        const refreshRes = await fetch(`/api/academic/students/${student.id}/documents`);
        if (refreshRes.ok) documents = await refreshRes.json();
      } else {
        const err = await res.json();
        alert(err.message || 'Upload failed');
      }
    } catch { alert('Upload failed'); } finally { uploadingDoc = false; }
  }

  async function deleteDocument(docId: string) {
    if (!confirm('Delete this document? This action is logged.')) return;
    const res = await fetch(`/api/academic/students/${student.id}/documents/${docId}`, { method: 'DELETE' });
    if (res.ok) {
      documents = documents.filter((d: any) => d.id !== docId);
    }
  }

  async function initAdmission() {
    updatingWorkflow = true;
    try {
      const res = await fetch('/api/academic/admissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_profile_id: student.id, university_id: student.university_id })
      });
      if (res.ok) workflow = await res.json();
    } catch {} finally { updatingWorkflow = false; }
  }

  async function updateWorkflowStatus(newStatus: string, remarks?: string) {
    if (!workflow) return;
    updatingWorkflow = true;
    try {
      const res = await fetch(`/api/academic/admissions/${workflow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, remarks })
      });
      if (res.ok) {
        // Refresh workflow
        const wRes = await fetch(`/api/academic/admissions/${student.id}`);
        if (wRes.ok) workflow = await wRes.json();
      } else {
        const err = await res.json();
        alert(err.message || 'Status update failed');
      }
    } catch {} finally { updatingWorkflow = false; }
  }

  async function loadAuditLogs() {
    auditLoading = true;
    try {
      // Fetch from document access logs for this student's documents
      const docIds = documents.map((d: any) => d.id);
      if (docIds.length === 0) { auditLogs = []; return; }
      // We'll load logs via a simple approach - fetch all docs and compile
      auditLogs = []; // Will be populated from API when available
    } catch {} finally { auditLoading = false; }
  }

  const piiLabels: Record<string, string> = {
    niat_id: 'NIAT ID', phone: 'Phone', aadhaar: 'Aadhaar', pan: 'PAN Card',
    email: 'Email', father_phone: 'Father Phone', mother_phone: 'Mother Phone',
    emergency_contact: 'Emergency Contact', bank_account: 'Bank Account', ifsc_code: 'IFSC Code'
  };

  const statusSteps = ['INITIATED', 'DOCUMENTS_PENDING', 'DOCUMENTS_SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'ENROLLED'];
  const statusColors: Record<string, string> = {
    INITIATED: 'bg-gray-100 text-gray-700',
    DOCUMENTS_PENDING: 'bg-amber-100 text-amber-700',
    DOCUMENTS_SUBMITTED: 'bg-blue-100 text-blue-700',
    UNDER_REVIEW: 'bg-violet-100 text-violet-700',
    APPROVED: 'bg-emerald-100 text-emerald-700',
    REJECTED: 'bg-red-100 text-red-700',
    ENROLLED: 'bg-teal-100 text-teal-700',
    CANCELLED: 'bg-gray-200 text-gray-500',
  };

  function fmtDate(d: string) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtSize(bytes: number) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
</script>

{#if !student}
  <div class="flex flex-col items-center justify-center py-24">
    <p class="text-lg font-black text-gray-400">Student not found</p>
    <a href="/academic-operations/student-ops" class="mt-4 text-sm text-indigo-600 font-bold hover:underline">Back to roster</a>
  </div>
{:else}
<div class="space-y-6" in:fade>

  <!-- Back + Header -->
  <div class="flex items-center gap-4">
    <a href="/academic-operations/student-ops" class="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
      <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
    </a>
    <div class="flex-1">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-lg font-black">
          {student.student_name?.[0]?.toUpperCase() || '?'}
        </div>
        <div>
          <h1 class="text-2xl font-black text-gray-900 dark:text-white">{student.student_name || 'Unknown'}</h1>
          <div class="flex items-center gap-3 text-xs text-gray-400 font-medium">
            <span class="font-mono font-bold">{student.enrollment_number || '—'}</span>
            {#if student.program_code}<span class="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg font-black">{student.program_code}</span>{/if}
            {#if student.university_short_name}<span>{student.university_short_name}</span>{/if}
            <span class="px-2 py-0.5 rounded-lg font-black {statusColors[student.student_status] || 'bg-gray-100 text-gray-600'}">{student.student_status}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="flex gap-1 p-1 bg-gray-50 dark:bg-slate-900 rounded-2xl">
    {#each [
      { key: 'profile', label: 'Profile & PII', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
      { key: 'documents', label: 'Documents', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
      { key: 'admission', label: 'Admission', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
    ] as tab}
      <button
        onclick={() => activeTab = tab.key as any}
        class="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex-1 justify-center
          {activeTab === tab.key ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={tab.icon}/></svg>
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- ═══ PROFILE TAB ═══ -->
  {#if activeTab === 'profile'}
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6" in:fly={{ y: 10 }}>

    <!-- Basic Info Card -->
    <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl p-6">
      <h3 class="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Basic Information</h3>
      <div class="space-y-3">
        {#each [
          ['Name', student.student_name],
          ['Email', student.student_email],
          ['Enrollment No.', student.enrollment_number],
          ['NIAT ID', student.niat_id],
          ['Phone', student.phone],
          ['Date of Birth', student.date_of_birth ? fmtDate(student.date_of_birth) : '—'],
          ['Gender', student.gender],
          ['Blood Group', student.blood_group],
          ['Father Name', student.father_name],
          ['Mother Name', student.mother_name],
          ['Program', student.program_name],
          ['Term', student.term_name],
          ['Section', student.section_name],
          ['Batch', student.batch_name],
          ['Admission Date', student.admission_date ? fmtDate(student.admission_date) : '—'],
        ] as [label, value]}
          <div class="flex justify-between py-2 border-b border-gray-50 dark:border-slate-800 last:border-0">
            <span class="text-xs font-bold text-gray-400">{label}</span>
            <span class="text-sm font-bold text-gray-900 dark:text-white">{value || '—'}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Sensitive PII Card -->
    <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
          <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          Encrypted PII Data
        </h3>
        <div class="flex gap-2">
          {#if !piiRevealed}
            <button onclick={revealPii} disabled={piiLoading}
              class="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50">
              {piiLoading ? 'Decrypting...' : 'Reveal (Logged)'}
            </button>
          {:else if !editingPii}
            <button onclick={startEditPii}
              class="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100">
              Edit
            </button>
            <button onclick={() => { piiRevealed = false; revealedPii = {}; }}
              class="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
              Hide
            </button>
          {/if}
        </div>
      </div>

      <div class="p-3 mb-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
        <p class="text-[10px] font-bold text-amber-700 dark:text-amber-400">
          All PII is encrypted with AES-256-GCM. Access is logged and role-restricted. Revealing data creates an audit entry.
        </p>
      </div>

      {#if editingPii}
        <div class="space-y-3">
          {#each Object.entries(piiLabels) as [key, label]}
            <div class="flex items-center gap-3">
              <span class="text-xs font-bold text-gray-400 w-32 shrink-0">{label}</span>
              <input
                type="text"
                value={piiForm[key] || ''}
                oninput={(e) => piiForm[key] = e.currentTarget.value}
                class="flex-1 px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 dark:text-white outline-none focus:ring-2 ring-indigo-500"
              />
            </div>
          {/each}
          <div class="flex gap-2 pt-3">
            <button onclick={savePiiChanges} disabled={savingPii}
              class="px-4 py-2 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {savingPii ? 'Encrypting & Saving...' : 'Save (Encrypted)'}
            </button>
            <button onclick={() => editingPii = false}
              class="px-4 py-2 text-xs font-bold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <div class="space-y-2">
          {#each Object.entries(piiLabels) as [key, label]}
            <div class="flex justify-between py-2 border-b border-gray-50 dark:border-slate-800 last:border-0">
              <span class="text-xs font-bold text-gray-400">{label}</span>
              <span class="text-sm font-mono font-bold {piiRevealed ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-slate-600'}">
                {#if piiRevealed}
                  {revealedPii[key] || '—'}
                {:else}
                  {maskedPii[key] || '••••••'}
                {/if}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
  {/if}

  <!-- ═══ DOCUMENTS TAB ═══ -->
  {#if activeTab === 'documents'}
  <div in:fly={{ y: 10 }}>
    <div class="flex items-center justify-between mb-4">
      <div>
        <h3 class="text-lg font-black text-gray-900 dark:text-white">Student Documents</h3>
        <p class="text-xs text-gray-400">{documents.length} uploaded — {documentTypes.filter((t: any) => t.is_required).length} required types</p>
      </div>
      <button onclick={() => showUploadModal = true}
        class="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
        Upload Document
      </button>
    </div>

    <!-- Document completion grid -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {#each documentTypes as dtype}
        {@const uploaded = documents.find((d: any) => d.document_type === dtype.code)}
        <div class="p-4 rounded-2xl border-2 transition-all
          {uploaded ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/5' : dtype.is_required ? 'border-red-200 bg-red-50/50 dark:border-red-500/30 dark:bg-red-500/5' : 'border-gray-100 bg-gray-50/50 dark:border-slate-800 dark:bg-slate-900'}">
          <div class="flex items-center gap-2 mb-1">
            {#if uploaded}
              <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
            {:else if dtype.is_required}
              <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
            {:else}
              <svg class="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            {/if}
            {#if dtype.is_sensitive}
              <svg class="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            {/if}
          </div>
          <p class="text-[11px] font-black text-gray-700 dark:text-gray-300">{dtype.label}</p>
          {#if uploaded}
            <p class="text-[9px] text-gray-400 mt-1">{fmtSize(uploaded.file_size_bytes)} - {fmtDate(uploaded.uploaded_at)}</p>
          {:else}
            <p class="text-[9px] font-bold mt-1 {dtype.is_required ? 'text-red-400' : 'text-gray-300'}">
              {dtype.is_required ? 'REQUIRED' : 'Optional'}
            </p>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Uploaded documents table -->
    {#if documents.length > 0}
    <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden">
      <table class="w-full">
        <thead>
          <tr class="border-b border-gray-100 dark:border-slate-800">
            <th class="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Document</th>
            <th class="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Type</th>
            <th class="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Size</th>
            <th class="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Uploaded</th>
            <th class="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Security</th>
            <th class="px-5 py-3 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 dark:divide-slate-800">
          {#each documents as doc}
            <tr class="hover:bg-gray-50/50 dark:hover:bg-slate-800/30">
              <td class="px-5 py-3">
                <p class="text-sm font-bold text-gray-900 dark:text-white truncate max-w-[200px]">{doc.file_name}</p>
              </td>
              <td class="px-5 py-3">
                <span class="text-[10px] font-black px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                  {doc.type_label || doc.document_type}
                </span>
              </td>
              <td class="px-5 py-3 text-xs text-gray-500 font-medium">{fmtSize(doc.file_size_bytes)}</td>
              <td class="px-5 py-3 text-xs text-gray-500 font-medium">
                {fmtDate(doc.uploaded_at)}
                {#if doc.uploaded_by_name}
                  <span class="text-gray-400"> by {doc.uploaded_by_name}</span>
                {/if}
              </td>
              <td class="px-5 py-3">
                {#if doc.is_encrypted}
                  <span class="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-lg">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                    AES-256
                  </span>
                {:else}
                  <span class="text-[10px] text-gray-400">Standard</span>
                {/if}
              </td>
              <td class="px-5 py-3 text-right">
                <div class="flex items-center justify-end gap-2">
                  <a href="/api/academic/students/{student.id}/documents/{doc.id}" target="_blank"
                    class="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-indigo-600 transition-colors" title="View">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  </a>
                  <button onclick={() => deleteDocument(doc.id)}
                    class="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-red-400 transition-colors" title="Delete">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {/if}
  </div>

  <!-- Upload Modal -->
  {#if showUploadModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" transition:fade>
    <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md p-6" in:fly={{ y: 20 }}>
      <h3 class="text-lg font-black text-gray-900 dark:text-white mb-4">Upload Document</h3>
      <form onsubmit={(e) => { e.preventDefault(); uploadDocument(e); }}>
        <div class="space-y-4">
          <div>
            <label class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Document Type</label>
            <select name="document_type" bind:value={uploadDocType} required
              class="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500">
              <option value="">Select type...</option>
              {#each documentTypes as dt}
                <option value={dt.code}>
                  {dt.label} {dt.is_required ? '(Required)' : ''} {dt.is_sensitive ? '- Encrypted' : ''}
                </option>
              {/each}
            </select>
          </div>
          <div>
            <label class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">File (PDF, JPEG, PNG — max 10MB)</label>
            <input type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.webp"
              class="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100" />
          </div>
          {#if documentTypes.find((t: any) => t.code === uploadDocType)?.is_sensitive}
            <div class="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200">
              <p class="text-[10px] font-bold text-emerald-700">This document will be encrypted at rest with AES-256-GCM before storage.</p>
            </div>
          {/if}
        </div>
        <div class="flex gap-3 mt-6">
          <button type="submit" disabled={uploadingDoc}
            class="flex-1 px-4 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50">
            {uploadingDoc ? 'Uploading & Encrypting...' : 'Upload'}
          </button>
          <button type="button" onclick={() => showUploadModal = false}
            class="px-4 py-3 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 text-sm font-bold rounded-xl hover:bg-gray-200">
            Cancel
          </button>
        </div>
      </form>
    </div>
  </div>
  {/if}
  {/if}

  <!-- ═══ ADMISSION TAB ═══ -->
  {#if activeTab === 'admission'}
  <div in:fly={{ y: 10 }}>
    {#if !workflow}
      <div class="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800">
        <div class="w-16 h-16 bg-indigo-100 dark:bg-indigo-500/20 rounded-3xl flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        </div>
        <p class="text-sm font-black text-gray-500 mb-2">No admission workflow started</p>
        <p class="text-xs text-gray-400 mb-4">Start the admission integration to track document collection, verification, and enrollment.</p>
        <button onclick={initAdmission} disabled={updatingWorkflow}
          class="px-6 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50">
          {updatingWorkflow ? 'Creating...' : 'Start Admission Workflow'}
        </button>
      </div>
    {:else}
      <!-- Workflow Status Timeline -->
      <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl p-6 mb-6">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-xs font-black text-gray-400 uppercase tracking-widest">Admission Progress</h3>
          <span class="text-[10px] font-black uppercase px-3 py-1 rounded-lg {statusColors[workflow.workflow_status] || 'bg-gray-100 text-gray-600'}">
            {workflow.workflow_status}
          </span>
        </div>

        <!-- Progress Steps -->
        <div class="flex items-center gap-0 mb-8">
          {#each statusSteps as step, i}
            {@const currentIdx = statusSteps.indexOf(workflow.workflow_status)}
            {@const isComplete = i <= currentIdx}
            {@const isCurrent = i === currentIdx}
            <div class="flex-1 flex items-center">
              <div class="flex flex-col items-center flex-1">
                <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all
                  {isComplete ? 'bg-indigo-600 text-white' : isCurrent ? 'bg-indigo-100 text-indigo-600 ring-2 ring-indigo-400' : 'bg-gray-100 text-gray-400'}">
                  {#if isComplete && !isCurrent}
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                  {:else}
                    {i + 1}
                  {/if}
                </div>
                <span class="text-[8px] font-bold mt-1.5 text-center {isComplete ? 'text-indigo-600' : 'text-gray-400'}">
                  {step.replace(/_/g, ' ')}
                </span>
              </div>
              {#if i < statusSteps.length - 1}
                <div class="w-full h-0.5 mx-1 {i < currentIdx ? 'bg-indigo-500' : 'bg-gray-200'}"></div>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Actions -->
        <div class="flex flex-wrap gap-2">
          {#if workflow.workflow_status === 'INITIATED'}
            <button onclick={() => updateWorkflowStatus('DOCUMENTS_PENDING')} disabled={updatingWorkflow}
              class="px-4 py-2 text-xs font-bold bg-amber-500 text-white rounded-xl hover:bg-amber-600 disabled:opacity-50">
              Request Documents
            </button>
          {/if}
          {#if workflow.workflow_status === 'DOCUMENTS_PENDING'}
            <button onclick={() => updateWorkflowStatus('DOCUMENTS_SUBMITTED')} disabled={updatingWorkflow}
              class="px-4 py-2 text-xs font-bold bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50">
              Mark Submitted
            </button>
          {/if}
          {#if workflow.workflow_status === 'DOCUMENTS_SUBMITTED'}
            <button onclick={() => updateWorkflowStatus('UNDER_REVIEW')} disabled={updatingWorkflow}
              class="px-4 py-2 text-xs font-bold bg-violet-500 text-white rounded-xl hover:bg-violet-600 disabled:opacity-50">
              Begin Review
            </button>
          {/if}
          {#if workflow.workflow_status === 'UNDER_REVIEW'}
            <button onclick={() => updateWorkflowStatus('APPROVED')} disabled={updatingWorkflow}
              class="px-4 py-2 text-xs font-bold bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-50">
              Approve
            </button>
            <button onclick={() => { const r = prompt('Rejection reason:'); if (r) updateWorkflowStatus('REJECTED', r); }}
              disabled={updatingWorkflow}
              class="px-4 py-2 text-xs font-bold bg-red-500 text-white rounded-xl hover:bg-red-600 disabled:opacity-50">
              Reject
            </button>
          {/if}
          {#if workflow.workflow_status === 'APPROVED'}
            <button onclick={() => updateWorkflowStatus('ENROLLED')} disabled={updatingWorkflow}
              class="px-4 py-2 text-xs font-bold bg-teal-500 text-white rounded-xl hover:bg-teal-600 disabled:opacity-50">
              Complete Enrollment
            </button>
          {/if}
          {#if workflow.workflow_status === 'REJECTED'}
            <button onclick={() => updateWorkflowStatus('DOCUMENTS_PENDING')} disabled={updatingWorkflow}
              class="px-4 py-2 text-xs font-bold bg-amber-500 text-white rounded-xl hover:bg-amber-600 disabled:opacity-50">
              Allow Re-submission
            </button>
          {/if}
        </div>
      </div>

      <!-- Workflow Details -->
      <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl p-6">
        <h3 class="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Workflow Details</h3>
        <div class="space-y-3">
          {#each [
            ['Reviewer', workflow.reviewer_name || 'Not assigned'],
            ['Submitted', workflow.submitted_at ? fmtDate(workflow.submitted_at) : 'Pending'],
            ['Reviewed', workflow.reviewed_at ? fmtDate(workflow.reviewed_at) : 'Pending'],
            ['Approved', workflow.approved_at ? fmtDate(workflow.approved_at) : 'Pending'],
            ['Created', fmtDate(workflow.created_at)],
            ['Last Updated', fmtDate(workflow.updated_at)],
          ] as [label, value]}
            <div class="flex justify-between py-2 border-b border-gray-50 dark:border-slate-800 last:border-0">
              <span class="text-xs font-bold text-gray-400">{label}</span>
              <span class="text-sm font-bold text-gray-900 dark:text-white">{value}</span>
            </div>
          {/each}
          {#if workflow.remarks}
            <div class="mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200">
              <p class="text-xs font-bold text-red-700">Remarks: {workflow.remarks}</p>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
  {/if}

</div>
{/if}
