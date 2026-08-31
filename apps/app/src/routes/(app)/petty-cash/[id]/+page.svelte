<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  let { data } = $props();

  const money = (n: any) => "₹" + Number(n || 0).toLocaleString("en-IN");
  const fdate = (d: any) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
  const fdt = (d: any) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

  const STATUS: Record<string, { label: string; cls: string }> = {
    DRAFT: { label: "Draft", cls: "bg-slate-400/10 text-slate-500 border-slate-300 dark:border-slate-700" },
    SUBMITTED: { label: "Awaiting Approval", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/30" },
    SENT_BACK: { label: "Sent Back", cls: "bg-orange-500/10 text-orange-600 dark:text-orange-300 border-orange-500/30" },
    APPROVED: { label: "Approved", cls: "bg-teal-500/10 text-teal-600 dark:text-teal-300 border-teal-500/30" },
    DISBURSED: { label: "Disbursed", cls: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/30" },
    BILL_SUBMITTED: { label: "Bill Submitted", cls: "bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/30" },
    BILL_VERIFIED: { label: "Bill Verified", cls: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border-cyan-500/30" },
    SETTLED: { label: "Settled", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30" },
    CLOSED: { label: "Closed", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30" },
    REJECTED: { label: "Rejected", cls: "bg-red-500/10 text-red-600 dark:text-red-300 border-red-500/30" },
    CANCELLED: { label: "Cancelled", cls: "bg-slate-500/10 text-slate-500 border-slate-300 dark:border-slate-700" },
  };
  const st = (s: string) => STATUS[s] || STATUS.DRAFT;

  const STEPS = ["DRAFT", "SUBMITTED", "APPROVED", "DISBURSED", "BILL_SUBMITTED", "BILL_VERIFIED", "SETTLED"];
  const STEP_LABEL: Record<string, string> = { DRAFT: "Drafted", SUBMITTED: "Submitted", APPROVED: "Approved", DISBURSED: "Disbursed", BILL_SUBMITTED: "Bill", BILL_VERIFIED: "Verified", SETTLED: "Settled" };

  const req = $derived(data.request);
  const isOwner = $derived(req.requester_user_id === data.me.id);
  const canFin = $derived(data.caps.isFinance);
  const terminal = $derived(["REJECTED", "CANCELLED"].includes(req.status));
  const stepIdx = $derived(
    req.status === "CLOSED" ? STEPS.length : req.status === "SENT_BACK" ? 0 : STEPS.indexOf(req.status),
  );

  let busy = $state(false);
  let err = $state("");
  let panel = $state(""); // which action form is open

  async function uploadFile(file: File): Promise<{ url: string; file_name: string } | null> {
    const fd = new FormData();
    fd.set("file", file);
    const r = await fetch("/api/petty-cash/upload", { method: "POST", body: fd });
    if (!r.ok) return null;
    return await r.json();
  }

  async function call(url: string, body?: any, method = "POST") {
    err = "";
    busy = true;
    const r = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    busy = false;
    if (!r.ok) {
      err = (await r.json().catch(() => ({}))).message || "Action failed.";
      return false;
    }
    panel = "";
    await invalidateAll();
    return true;
  }

  // ── Action form models ─────────────────────────────────────────────────
  let approveForm = $state({ amount_approved: null as number | null, approval_channel: "IN_APP", approved_by_name: "", remarks: "", evidence_url: "" });
  let disburseForm = $state({ amount_paid: null as number | null, payment_mode: "UPI", reference_no: "", proof_url: "", paid_on: "" });
  let billForm = $state({ bill_no: "", bill_date: "", vendor: "", bill_amount: null as number | null, file_url: "", file_name: "" });
  let settleForm = $state({ spent_amount: null as number | null, reference: "", reason_code: "" });
  let noteText = $state("");
  let uploading = $state(false);

  $effect(() => {
    // sensible defaults when opening panels
    if (panel === "approve" && approveForm.amount_approved === null) approveForm.amount_approved = Number(req.amount_requested);
    if (panel === "disburse" && disburseForm.amount_paid === null) disburseForm.amount_paid = Number(req.amount_approved ?? req.amount_requested);
    if (panel === "settle" && settleForm.spent_amount === null) settleForm.spent_amount = Number(req.bill_total ?? 0);
  });

  async function onFile(e: Event, target: "evidence" | "proof" | "bill") {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    uploading = true;
    const up = await uploadFile(file);
    uploading = false;
    if (!up) { err = "Upload failed"; return; }
    if (target === "evidence") approveForm.evidence_url = up.url;
    if (target === "proof") disburseForm.proof_url = up.url;
    if (target === "bill") { billForm.file_url = up.url; billForm.file_name = up.file_name; }
  }

  const settleBalance = $derived(Number(req.total_paid || 0) - Number(settleForm.spent_amount || 0));

  const isImage = (name: string | undefined) => /\.(png|jpe?g|webp|gif|heic)$/i.test(name || "");
  const isPdf = (name: string | undefined) => /\.pdf$/i.test(name || "");
  let previewUrl = $state<string | null>(null);
  let previewPdf = $state(false);
  let previewName = $state("");
  function openPreview(url: string, name: string) {
    if (isImage(name) || isPdf(name)) { previewUrl = url; previewPdf = isPdf(name); previewName = name; }
    else window.open(url, "_blank");
  }

  async function deleteRequest() {
    if (!confirm(`Delete ${req.request_no}? This removes the request and all its records permanently.`)) return;
    busy = true;
    const r = await fetch(`/api/petty-cash/${req.id}`, { method: "DELETE" });
    busy = false;
    if (r.ok) { goto("/petty-cash"); return; }
    err = (await r.json().catch(() => ({}))).message || "Could not delete.";
  }
</script>

<div class="min-h-screen bg-gray-50 dark:bg-slate-950 p-4 sm:p-8">
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex items-start gap-4">
      <a href="/petty-cash" class="w-11 h-11 shrink-0 rounded-2xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 shadow-sm flex items-center justify-center text-gray-400 hover:text-indigo-600" title="Back">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" /></svg>
      </a>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-3 flex-wrap">
          <span class="font-mono text-xs font-black text-indigo-500">{req.request_no}</span>
          <span class="inline-flex px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest {st(req.status).cls}">{st(req.status).label}</span>
        </div>
        <h1 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight mt-1">{req.purpose}</h1>
        <p class="text-[11px] font-bold text-gray-400 uppercase tracking-wider mt-1">{req.university_name} · {req.category} · by {req.requester_name || req.requester_email}</p>
      </div>
      <div class="text-right shrink-0">
        <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Amount</p>
        <p class="text-2xl font-black text-gray-900 dark:text-white tabular-nums">{money(req.amount_approved ?? req.amount_requested)}</p>
        {#if req.amount_approved != null && Number(req.amount_approved) !== Number(req.amount_requested)}
          <p class="text-[10px] font-bold text-gray-400">req {money(req.amount_requested)}</p>
        {/if}
      </div>
    </div>

    {#if err}
      <div class="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 text-sm font-semibold">{err}</div>
    {/if}

    <!-- Lifecycle timeline -->
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm p-6">
      {#if terminal}
        <div class="flex items-center gap-3 text-sm font-black uppercase tracking-widest {req.status === 'REJECTED' ? 'text-red-500' : 'text-slate-400'}">
          <span class="w-8 h-8 rounded-full flex items-center justify-center {req.status === 'REJECTED' ? 'bg-red-500' : 'bg-slate-400'} text-white">✕</span>
          {st(req.status).label} — this request is closed.
        </div>
      {:else}
        <div class="flex items-center">
          {#each STEPS as s, i}
            {@const done = i < stepIdx}
            {@const active = i === stepIdx}
            <div class="flex flex-col items-center flex-1 relative">
              {#if i > 0}
                <div class="absolute top-3 right-1/2 w-full h-0.5 {i <= stepIdx ? 'bg-indigo-500' : 'bg-gray-200 dark:bg-slate-700'}"></div>
              {/if}
              <div class="relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black
                {done ? 'bg-indigo-500 text-white' : active ? 'bg-indigo-600 text-white ring-4 ring-indigo-500/20' : 'bg-gray-200 dark:bg-slate-700 text-gray-400'}">
                {#if done}✓{:else}{i + 1}{/if}
              </div>
              <span class="mt-2 text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-center {active ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}">{STEP_LABEL[s]}</span>
            </div>
          {/each}
        </div>
      {/if}
      {#if req.status === "SENT_BACK"}
        <p class="mt-4 text-[11px] font-bold text-orange-500 uppercase tracking-wider">↩ Sent back for changes — edit and resubmit.</p>
      {/if}
      {#if req.bill_due_on && ["DISBURSED", "BILL_SUBMITTED"].includes(req.status)}
        <p class="mt-4 text-[11px] font-bold uppercase tracking-wider {req.bill_overdue ? 'text-red-500' : 'text-gray-400'}">
          {req.bill_overdue ? "● Bill overdue since" : "Bill due by"} {fdate(req.bill_due_on)}
        </p>
      {/if}
    </div>

    <div class="grid lg:grid-cols-3 gap-6">
      <!-- Main column -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Details -->
        <div class="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm p-6">
          <h2 class="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4">Request Details</h2>
          <dl class="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div><dt class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Payee / Vendor</dt><dd class="font-bold text-gray-900 dark:text-white mt-0.5">{req.payee_vendor || "—"}</dd></div>
            <div><dt class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Needed by</dt><dd class="font-bold text-gray-900 dark:text-white mt-0.5">{fdate(req.needed_by)}</dd></div>
            <div><dt class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Requested</dt><dd class="font-bold text-gray-900 dark:text-white mt-0.5 tabular-nums">{money(req.amount_requested)}</dd></div>
            <div><dt class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Linked activity</dt><dd class="font-bold text-gray-900 dark:text-white mt-0.5">{req.linked_activity || "—"}</dd></div>
          </dl>
        </div>

        <!-- Approval record -->
        {#if data.approvals.length}
          {@const a = data.approvals[data.approvals.length - 1]}
          <div class="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm p-6">
            <h2 class="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4">Approval</h2>
            <div class="flex items-center justify-between">
              <div>
                <p class="font-black text-gray-900 dark:text-white">{money(a.amount_approved)} approved</p>
                <p class="text-[11px] text-gray-400 mt-0.5">by {a.approved_by_name} · {fdt(a.approved_at)}</p>
              </div>
              <span class="inline-flex px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest {a.approval_channel === 'IN_APP' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' : 'bg-amber-500/10 text-amber-600 border-amber-500/30'}">{a.approval_channel}</span>
            </div>
            {#if a.approval_channel !== "IN_APP"}
              <p class="text-[11px] text-amber-600 dark:text-amber-400 mt-2">Recorded by {a.recorded_by_name} (offline approval){a.evidence_url ? " · " : ""}{#if a.evidence_url}<a href={a.evidence_url} target="_blank" class="underline">evidence</a>{/if}</p>
            {/if}
            {#if a.remarks}<p class="text-sm text-gray-500 mt-2">"{a.remarks}"</p>{/if}
          </div>
        {/if}

        <!-- Disbursement record -->
        {#if data.disbursements.length}
          <div class="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm p-6">
            <h2 class="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4">Disbursement</h2>
            {#each data.disbursements as d}
              <div class="flex items-center justify-between py-2">
                <div>
                  <p class="font-black text-gray-900 dark:text-white tabular-nums">{money(d.amount_paid)} <span class="text-[10px] font-bold text-gray-400 uppercase">{d.payment_mode}</span></p>
                  <p class="text-[11px] text-gray-400">{d.reference_no || "no ref"} · {fdate(d.paid_on)} · by {d.paid_by_name}</p>
                </div>
                {#if d.proof_url}<a href={d.proof_url} target="_blank" class="text-[10px] font-black text-indigo-500 uppercase tracking-widest hover:underline">Proof</a>{/if}
              </div>
            {/each}
          </div>
        {/if}

        <!-- Bills -->
        {#if data.bills.length}
          <div class="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm p-6">
            <h2 class="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4">Bills</h2>
            <div class="space-y-3">
              {#each data.bills as b}
                <div class="flex items-center gap-4 p-3 rounded-2xl bg-gray-50 dark:bg-slate-800/40 border border-gray-100 dark:border-slate-800">
                  <!-- Thumbnail / file icon -->
                  {#if b.file_url && isImage(b.file_name)}
                    <button onclick={() => openPreview(b.file_url, b.file_name)} class="w-16 h-16 shrink-0 rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700 bg-white">
                      <img src={b.file_url} alt="Bill" class="w-full h-full object-cover" />
                    </button>
                  {:else if b.file_url}
                    <button onclick={() => openPreview(b.file_url, b.file_name || "bill.pdf")} class="w-16 h-16 shrink-0 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-red-500">
                      <svg class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    </button>
                  {:else}
                    <div class="w-16 h-16 shrink-0 rounded-xl border border-dashed border-gray-200 dark:border-slate-700 flex items-center justify-center text-gray-300 text-[9px] font-black uppercase">No file</div>
                  {/if}

                  <div class="flex-1 min-w-0">
                    <p class="font-black text-gray-900 dark:text-white tabular-nums">{money(b.bill_amount)} <span class="text-[10px] font-bold text-gray-400">{b.vendor || ""}</span></p>
                    <p class="text-[11px] text-gray-400 truncate">{b.bill_no || "no #"} · {fdate(b.bill_date)}{b.file_name ? ` · ${b.file_name}` : ""}</p>
                    {#if b.file_url}
                      <button onclick={() => openPreview(b.file_url, b.file_name || "bill.pdf")} class="mt-1.5 inline-flex items-center gap-1 text-[10px] font-black text-indigo-500 uppercase tracking-widest hover:underline">View Bill</button>
                    {/if}
                  </div>

                  <div class="flex items-center gap-2 shrink-0">
                    <span class="inline-flex px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest {b.status === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' : b.status === 'REJECTED' ? 'bg-red-500/10 text-red-600 border-red-500/30' : 'bg-amber-500/10 text-amber-600 border-amber-500/30'}">{b.status}</span>
                    {#if canFin && b.status === "PENDING" && req.status === "BILL_SUBMITTED"}
                      <button onclick={() => call(`/api/petty-cash/${req.id}/bills/${b.id}/verify`, { decision: "verify" })} disabled={busy} class="px-2.5 py-1 bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-emerald-700">Verify</button>
                      <button onclick={() => call(`/api/petty-cash/${req.id}/bills/${b.id}/verify`, { decision: "reject" })} disabled={busy} class="px-2.5 py-1 bg-white dark:bg-slate-800 border border-red-300 text-red-500 text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-red-50">Reject</button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Settlement record -->
        {#if data.settlements.length}
          {@const s = data.settlements[data.settlements.length - 1]}
          <div class="bg-white dark:bg-slate-900 rounded-3xl border border-emerald-200 dark:border-emerald-900/40 shadow-sm p-6">
            <h2 class="text-[11px] font-black text-emerald-500 uppercase tracking-widest mb-3">Settled</h2>
            <div class="grid grid-cols-3 gap-4 text-center">
              <div><p class="text-[10px] font-black text-gray-400 uppercase">Spent</p><p class="font-black text-gray-900 dark:text-white tabular-nums">{money(s.spent_amount)}</p></div>
              <div><p class="text-[10px] font-black text-gray-400 uppercase">{s.direction === "TOPPED_UP" ? "Topped up" : "Returned"}</p><p class="font-black text-gray-900 dark:text-white tabular-nums">{money(Math.abs(s.balance_amount))}</p></div>
              <div><p class="text-[10px] font-black text-gray-400 uppercase">On</p><p class="font-black text-gray-900 dark:text-white">{fdate(s.settled_on)}</p></div>
            </div>
          </div>
        {/if}

        <!-- Audit trail -->
        <div class="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm p-6">
          <h2 class="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4">Ledger &amp; Audit</h2>
          <div class="space-y-3">
            {#each [...data.audit].reverse() as e}
              <div class="flex gap-3 text-sm">
                <div class="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 shrink-0"></div>
                <div class="flex-1">
                  <p class="text-gray-700 dark:text-slate-200"><span class="font-bold">{e.actor_name || "System"}</span> — {e.note || (e.to_status ? `→ ${st(e.to_status).label}` : e.action)}</p>
                  <p class="text-[10px] text-gray-400 uppercase tracking-wider">{fdt(e.created_at)}</p>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <!-- Action column -->
      <div class="space-y-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm p-6 lg:sticky lg:top-6">
          <h2 class="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4">Actions</h2>

          {#if terminal}
            <p class="text-sm text-gray-400">No actions available.</p>

          <!-- DRAFT / SENT_BACK: owner submits -->
          {:else if ["DRAFT", "SENT_BACK"].includes(req.status) && (isOwner || data.caps.isAdmin)}
            <div class="space-y-2">
              <button onclick={() => call(`/api/petty-cash/${req.id}/submit`)} disabled={busy} class="w-full py-3 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 disabled:opacity-50">Send for Approval</button>
              <a href={`/petty-cash/create`} class="hidden"></a>
              <button onclick={() => call(`/api/petty-cash/${req.id}/approve`, { action: "cancel" })} disabled={busy} class="w-full py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-500 text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-gray-50">Cancel Request</button>
            </div>

          <!-- SUBMITTED: approver approves -->
          {:else if req.status === "SUBMITTED" && data.caps.canApprove}
            {#if panel === "approve"}
              <div class="space-y-3">
                <label class="block"><span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Approved amount (₹)</span>
                  <input type="number" bind:value={approveForm.amount_approved} class="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm tabular-nums" /></label>
                <label class="block"><span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Channel</span>
                  <select bind:value={approveForm.approval_channel} class="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
                    <option value="IN_APP">In-app (I am approving)</option><option value="WHATSAPP">WhatsApp</option><option value="CALL">Call</option><option value="EMAIL">Email</option>
                  </select></label>
                {#if approveForm.approval_channel !== "IN_APP"}
                  <label class="block"><span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Approver name</span>
                    <input bind:value={approveForm.approved_by_name} placeholder="e.g. Satish" class="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" /></label>
                  <label class="block"><span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Evidence (screenshot) *</span>
                    <input type="file" onchange={(e) => onFile(e, "evidence")} class="mt-1 w-full text-xs" /></label>
                  {#if approveForm.evidence_url}<p class="text-[10px] text-emerald-500 font-bold">✓ evidence attached</p>{/if}
                {/if}
                <input bind:value={approveForm.remarks} placeholder="Remarks (optional)" class="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
                <button onclick={() => call(`/api/petty-cash/${req.id}/approve`, { action: "approve", ...approveForm })} disabled={busy || uploading} class="w-full py-3 bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-700 disabled:opacity-50">{busy ? "…" : "Confirm Approval"}</button>
                <button onclick={() => (panel = "")} class="w-full py-2 text-gray-400 text-[10px] font-black uppercase tracking-widest">Cancel</button>
              </div>
            {:else if panel === "reject" || panel === "send_back"}
              <div class="space-y-3">
                <textarea bind:value={noteText} rows="3" placeholder={panel === "reject" ? "Reason for rejection" : "What needs changing?"} class="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm resize-none"></textarea>
                <button onclick={() => call(`/api/petty-cash/${req.id}/approve`, { action: panel, note: noteText })} disabled={busy || !noteText.trim()} class="w-full py-3 {panel === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-500 hover:bg-orange-600'} text-white text-[11px] font-black uppercase tracking-widest rounded-xl disabled:opacity-50">{panel === "reject" ? "Confirm Reject" : "Send Back"}</button>
                <button onclick={() => (panel = "")} class="w-full py-2 text-gray-400 text-[10px] font-black uppercase tracking-widest">Cancel</button>
              </div>
            {:else}
              <div class="space-y-2">
                <button onclick={() => (panel = "approve")} class="w-full py-3 bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-700">Approve</button>
                <button onclick={() => { panel = 'send_back'; noteText=''; }} class="w-full py-3 bg-orange-500 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-orange-600">Send Back</button>
                <button onclick={() => { panel = 'reject'; noteText=''; }} class="w-full py-3 bg-white dark:bg-slate-800 border border-red-300 text-red-500 text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-red-50">Reject</button>
              </div>
            {/if}

          <!-- APPROVED: finance disburses -->
          {:else if req.status === "APPROVED" && canFin}
            {#if panel === "disburse"}
              <div class="space-y-3">
                <label class="block"><span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Amount paid (₹) · ≤ {money(req.amount_approved)}</span>
                  <input type="number" bind:value={disburseForm.amount_paid} class="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm tabular-nums" /></label>
                <label class="block"><span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mode</span>
                  <select bind:value={disburseForm.payment_mode} class="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"><option>UPI</option><option>NEFT</option><option>CASH</option></select></label>
                <label class="block"><span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">{disburseForm.payment_mode === "CASH" ? "Acknowledgement ref" : "UTR / reference"}</span>
                  <input bind:value={disburseForm.reference_no} class="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" /></label>
                <label class="block"><span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Proof {disburseForm.payment_mode === "CASH" ? "(signed ack)" : ""}</span>
                  <input type="file" onchange={(e) => onFile(e, "proof")} class="mt-1 w-full text-xs" /></label>
                {#if disburseForm.proof_url}<p class="text-[10px] text-emerald-500 font-bold">✓ proof attached</p>{/if}
                <button onclick={() => call(`/api/petty-cash/${req.id}/disburse`, disburseForm)} disabled={busy || uploading} class="w-full py-3 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 disabled:opacity-50">{busy ? "…" : "Record Payment"}</button>
                <button onclick={() => (panel = "")} class="w-full py-2 text-gray-400 text-[10px] font-black uppercase tracking-widest">Cancel</button>
              </div>
            {:else}
              <div class="space-y-2">
                <button onclick={() => (panel = "disburse")} class="w-full py-3 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700">Disburse Money</button>
                <button onclick={() => call(`/api/petty-cash/${req.id}/approve`, { action: "cancel" })} disabled={busy} class="w-full py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-500 text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-gray-50">Cancel (before payment)</button>
              </div>
            {/if}

          <!-- DISBURSED / BILL_SUBMITTED: add bill (owner/finance) + settle hint -->
          {:else if ["DISBURSED", "BILL_SUBMITTED"].includes(req.status) && (isOwner || canFin)}
            {#if panel === "bill"}
              <div class="space-y-3">
                <div class="grid grid-cols-2 gap-2">
                  <input bind:value={billForm.bill_no} placeholder="Bill #" class="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
                  <input type="date" bind:value={billForm.bill_date} class="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
                </div>
                <input bind:value={billForm.vendor} placeholder="Vendor" class="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
                <input type="number" bind:value={billForm.bill_amount} placeholder="Bill amount ₹" class="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm tabular-nums" />
                <input type="file" onchange={(e) => onFile(e, "bill")} class="w-full text-xs" />
                {#if billForm.file_url}<p class="text-[10px] text-emerald-500 font-bold">✓ {billForm.file_name}</p>{/if}
                <button onclick={() => call(`/api/petty-cash/${req.id}/bills`, billForm)} disabled={busy || uploading || !billForm.bill_amount} class="w-full py-3 bg-blue-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-700 disabled:opacity-50">{busy ? "…" : "Attach Bill"}</button>
                <button onclick={() => (panel = "")} class="w-full py-2 text-gray-400 text-[10px] font-black uppercase tracking-widest">Cancel</button>
              </div>
            {:else}
              <button onclick={() => (panel = "bill")} class="w-full py-3 bg-blue-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-700">Attach Bill</button>
              {#if canFin && req.status === "BILL_SUBMITTED"}
                <p class="text-[11px] text-gray-400 mt-3">Verify the bills above, then settle.</p>
              {/if}
            {/if}

          <!-- BILL_VERIFIED: finance settles -->
          {:else if req.status === "BILL_VERIFIED" && canFin}
            {#if panel === "settle"}
              <div class="space-y-3">
                <div class="p-3 rounded-xl bg-gray-50 dark:bg-slate-800/40 text-sm">
                  <div class="flex justify-between"><span class="text-gray-400">Disbursed</span><span class="font-black tabular-nums">{money(req.total_paid)}</span></div>
                  <div class="flex justify-between mt-1"><span class="text-gray-400">Spent (bills)</span><span class="font-black tabular-nums">{money(settleForm.spent_amount)}</span></div>
                  <div class="flex justify-between mt-1 pt-1 border-t border-gray-200 dark:border-slate-700"><span class="text-gray-400">{settleBalance >= 0 ? "To return" : "Top-up owed"}</span><span class="font-black tabular-nums {settleBalance >= 0 ? 'text-emerald-600' : 'text-amber-600'}">{money(Math.abs(settleBalance))}</span></div>
                </div>
                <label class="block"><span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Actual spent (₹)</span>
                  <input type="number" bind:value={settleForm.spent_amount} class="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm tabular-nums" /></label>
                <input bind:value={settleForm.reference} placeholder="Return / top-up reference" class="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
                <button onclick={() => call(`/api/petty-cash/${req.id}/settle`, settleForm)} disabled={busy} class="w-full py-3 bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-700 disabled:opacity-50">{busy ? "…" : "Settle & Close"}</button>
                <button onclick={() => (panel = "")} class="w-full py-2 text-gray-400 text-[10px] font-black uppercase tracking-widest">Cancel</button>
              </div>
            {:else}
              <button onclick={() => (panel = "settle")} class="w-full py-3 bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-700">Settle</button>
            {/if}

          {:else}
            <p class="text-sm text-gray-400">Waiting on {canFin ? "the requester" : "finance"} for the next step.</p>
          {/if}

          {#if data.caps.isAdmin}
            <div class="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800">
              <button onclick={deleteRequest} disabled={busy} class="w-full py-2.5 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900/40 text-red-500 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50">
                Delete Request
              </button>
              <p class="text-[9px] text-gray-400 text-center mt-1.5 uppercase tracking-wider">Admin · removes it permanently</p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

{#if previewUrl}
  <div class="fixed inset-0 z-[100] flex flex-col bg-black/85 backdrop-blur-sm" role="dialog" aria-modal="true">
    <div class="flex items-center justify-between px-6 py-4 shrink-0">
      <span class="text-white/80 text-sm font-bold truncate">{previewName || "Bill"}</span>
      <div class="flex items-center gap-3">
        <a href={previewUrl} target="_blank" class="text-[11px] font-black text-white/80 uppercase tracking-widest hover:text-white">Open ↗</a>
        <button onclick={() => (previewUrl = null)} class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl font-black flex items-center justify-center">×</button>
      </div>
    </div>
    <div class="flex-1 min-h-0 px-6 pb-6 flex items-center justify-center">
      {#if previewPdf}
        <iframe src={previewUrl} title="Bill preview" class="w-full h-full max-w-4xl rounded-2xl bg-white shadow-2xl"></iframe>
      {:else}
        <img src={previewUrl} alt="Bill preview" class="max-w-full max-h-full rounded-2xl shadow-2xl object-contain" />
      {/if}
    </div>
  </div>
{/if}
