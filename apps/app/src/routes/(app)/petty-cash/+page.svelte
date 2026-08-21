<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  let { data } = $props();

  const money = (n: number | undefined) =>
    "₹" + Number(n || 0).toLocaleString("en-IN");

  // ── Status presentation ────────────────────────────────────────────────
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

  // ── Views ──────────────────────────────────────────────────────────────
  type View = { id: string; label: string; hint: string; adminOnly?: boolean };
  const VIEWS: View[] = [
    { id: "my", label: "My Requests", hint: "Where is my money?" },
    { id: "approvals", label: "Approvals", hint: "What needs me?" },
    { id: "disbursement", label: "Disbursement", hint: "What do I pay today?" },
    { id: "bills", label: "Bills Pending", hint: "Who owes paperwork?" },
    { id: "settlement", label: "Settlement", hint: "Who is holding money?" },
    { id: "all", label: "All / Ledger", hint: "What happened here?" },
    { id: "eligibility", label: "Eligibility", hint: "Trusted employees", adminOnly: true },
  ];
  let view = $state("my");
  const visibleViews = $derived(VIEWS.filter((v) => !v.adminOnly || data.caps.isAdmin));

  let search = $state("");

  const filtered = $derived.by(() => {
    let list = data.requests as any[];
    if (view === "my") list = list.filter((r) => r.requester_user_id === data.me.id);
    else if (view === "approvals") list = list.filter((r) => r.status === "SUBMITTED");
    else if (view === "disbursement") list = list.filter((r) => r.status === "APPROVED");
    else if (view === "bills") list = list.filter((r) => ["DISBURSED", "BILL_SUBMITTED"].includes(r.status));
    else if (view === "settlement")
      list = list.filter((r) => ["BILL_VERIFIED", "DISBURSED", "BILL_SUBMITTED"].includes(r.status));
    // "all" → everything
    const q = search.trim().toLowerCase();
    if (q)
      list = list.filter(
        (r) =>
          (r.purpose || "").toLowerCase().includes(q) ||
          (r.request_no || "").toLowerCase().includes(q) ||
          (r.payee_vendor || "").toLowerCase().includes(q) ||
          (r.requester_name || "").toLowerCase().includes(q),
      );
    return list;
  });

  function ageDays(due: string | null): number | null {
    if (!due) return null;
    return Math.floor((Date.now() - new Date(due).getTime()) / 86400000);
  }

  const tiles = $derived([
    { label: "Outstanding", sub: "Disbursed, not settled", value: money(data.stats.outstanding_amount), accent: "text-indigo-600 dark:text-indigo-400", ring: "ring-indigo-500/20" },
    { label: "Awaiting Approval", sub: "Needs a decision", value: String(data.stats.awaiting_approval), accent: "text-amber-600 dark:text-amber-400", ring: "ring-amber-500/20" },
    { label: "Bills Overdue", sub: "Past the deadline", value: String(data.stats.bills_overdue), accent: "text-red-600 dark:text-red-400", ring: "ring-red-500/20" },
    { label: "Median Approval", sub: "Submitted → approved", value: data.stats.median_turnaround_hours ? `${data.stats.median_turnaround_hours}h` : "—", accent: "text-teal-600 dark:text-teal-400", ring: "ring-teal-500/20" },
  ]);

  // ── Eligibility admin ──────────────────────────────────────────────────
  let eligList = $state(data.eligibility as any[]);
  let showEligForm = $state(false);
  let eligBusy = $state(false);
  let eligForm = $state({ user_id: "", university_id: "", max_per_request: 10000, max_open_advance: 15000 });
  let userQuery = $state("");
  let userResults = $state<any[]>([]);
  let allUsers = $state<any[]>([]);

  async function searchUsers() {
    const q = userQuery.trim().toLowerCase();
    if (q.length < 2) { userResults = []; return; }
    if (allUsers.length === 0) {
      const r = await fetch(`/api/users?minimal=true`).catch(() => null);
      if (r?.ok) allUsers = await r.json();
    }
    userResults = allUsers
      .filter((u) => `${u.name || ""} ${u.email || ""}`.toLowerCase().includes(q))
      .slice(0, 6);
  }
  async function saveElig() {
    if (!eligForm.user_id) { alert("Pick a user"); return; }
    eligBusy = true;
    const r = await fetch("/api/petty-cash/eligibility", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eligForm),
    });
    eligBusy = false;
    if (r.ok) { showEligForm = false; userQuery = ""; userResults = []; await invalidateAll(); eligList = data.eligibility; }
    else alert((await r.json().catch(() => ({}))).message || "Failed");
  }
  async function revokeElig(id: string) {
    if (!confirm("Revoke this eligibility?")) return;
    await fetch(`/api/petty-cash/eligibility?id=${id}`, { method: "DELETE" });
    await invalidateAll(); eligList = data.eligibility;
  }
  $effect(() => { eligList = data.eligibility; });
</script>

<div class="min-h-screen bg-gray-50 dark:bg-slate-950 p-4 sm:p-8">
  <div class="max-w-7xl mx-auto space-y-8">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="space-y-1">
        <div class="flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em]">
          <div class="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
          Budget &amp; Finance Ops
        </div>
        <h1 class="text-3xl font-black text-gray-900 dark:text-white tracking-tight uppercase">Petty Cash</h1>
      </div>
      <a href="/petty-cash/create"
        class="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 active:scale-95">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" /></svg>
        New Request
      </a>
    </div>

    <!-- Headline tiles -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {#each tiles as t}
        <div class="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 p-6 shadow-sm ring-1 {t.ring}">
          <p class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">{t.label}</p>
          <p class="text-3xl font-black mt-2 {t.accent} tabular-nums">{t.value}</p>
          <p class="text-[10px] font-bold text-gray-400 dark:text-slate-600 uppercase tracking-wider mt-1">{t.sub}</p>
        </div>
      {/each}
    </div>

    <!-- Tabs -->
    <div class="flex flex-wrap gap-2">
      {#each visibleViews as v}
        <button onclick={() => (view = v.id)}
          class="px-4 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all border
          {view === v.id
            ? 'bg-gray-900 dark:bg-white text-white dark:text-slate-900 border-transparent shadow'
            : 'bg-white dark:bg-slate-900 text-gray-500 dark:text-slate-400 border-gray-100 dark:border-slate-800 hover:border-indigo-200'}">
          {v.label}
        </button>
      {/each}
    </div>

    {#if view === "eligibility"}
      <!-- Eligibility register -->
      <div class="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div class="p-6 flex items-center justify-between border-b border-gray-100 dark:border-slate-800">
          <div>
            <h2 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">Trusted Employees</h2>
            <p class="text-[11px] font-bold text-gray-400 uppercase tracking-wider mt-1">Who may request, and up to how much</p>
          </div>
          <button onclick={() => (showEligForm = !showEligForm)}
            class="px-4 py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700">
            {showEligForm ? "Close" : "+ Add / Update"}
          </button>
        </div>

        {#if showEligForm}
          <div class="p-6 bg-gray-50/50 dark:bg-slate-800/30 border-b border-gray-100 dark:border-slate-800 space-y-4">
            <div class="relative">
              <input bind:value={userQuery} oninput={searchUsers} placeholder="Search a user by name or email…"
                class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
              {#if userResults.length}
                <div class="absolute z-20 mt-1 w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
                  {#each userResults as u}
                    <button onclick={() => { eligForm.user_id = u.id; userQuery = `${u.name} (${u.email})`; userResults = []; }}
                      class="w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 dark:hover:bg-slate-800 flex justify-between">
                      <span class="font-semibold">{u.name}</span><span class="text-gray-400 text-xs">{u.email}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
            <div class="grid grid-cols-2 gap-4">
              <label class="block">
                <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Per-request cap (₹)</span>
                <input type="number" bind:value={eligForm.max_per_request} class="mt-1 w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
              </label>
              <label class="block">
                <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Max open advance (₹)</span>
                <input type="number" bind:value={eligForm.max_open_advance} class="mt-1 w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
              </label>
            </div>
            <button onclick={saveElig} disabled={eligBusy}
              class="px-5 py-3 bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-700 disabled:opacity-50">
              {eligBusy ? "Saving…" : "Save Eligibility"}
            </button>
          </div>
        {/if}

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 dark:bg-slate-800/40 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <tr><th class="text-left px-6 py-3">Person</th><th class="text-left px-6 py-3">University</th><th class="text-right px-6 py-3">Per request</th><th class="text-right px-6 py-3">Max open</th><th class="px-6 py-3"></th></tr>
            </thead>
            <tbody>
              {#each eligList as e}
                <tr class="border-t border-gray-50 dark:border-slate-800/60 {e.is_active ? '' : 'opacity-40'}">
                  <td class="px-6 py-3"><div class="font-bold text-gray-900 dark:text-white">{e.user_name}</div><div class="text-xs text-gray-400">{e.user_email}</div></td>
                  <td class="px-6 py-3 text-gray-500">{e.university_name || "All universities"}</td>
                  <td class="px-6 py-3 text-right font-bold tabular-nums">{money(e.max_per_request)}</td>
                  <td class="px-6 py-3 text-right font-bold tabular-nums">{money(e.max_open_advance)}</td>
                  <td class="px-6 py-3 text-right">
                    {#if e.is_active}<button onclick={() => revokeElig(e.id)} class="text-[10px] font-black text-red-500 uppercase tracking-widest hover:underline">Revoke</button>{:else}<span class="text-[10px] font-black text-gray-400 uppercase">Revoked</span>{/if}
                  </td>
                </tr>
              {:else}
                <tr><td colspan="5" class="px-6 py-12 text-center text-gray-400 text-sm">No eligibility entries yet.</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {:else}
      <!-- Request list -->
      <div class="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div class="p-5 flex items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-800">
          <p class="text-[11px] font-black text-gray-400 uppercase tracking-widest">
            {visibleViews.find((v) => v.id === view)?.hint} · {filtered.length} request{filtered.length === 1 ? "" : "s"}
          </p>
          <input bind:value={search} placeholder="Search…"
            class="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm w-48" />
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 dark:bg-slate-800/40 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <tr>
                <th class="text-left px-6 py-3">Request</th>
                <th class="text-left px-6 py-3">Requester</th>
                <th class="text-right px-6 py-3">Amount</th>
                <th class="text-left px-6 py-3">Status</th>
                <th class="text-left px-6 py-3">Bill</th>
                <th class="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {#each filtered as r (r.id)}
                {@const overdue = ["DISBURSED", "BILL_SUBMITTED"].includes(r.status) && r.bill_overdue}
                <tr class="border-t border-gray-50 dark:border-slate-800/60 hover:bg-indigo-50/40 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                  onclick={() => goto(`/petty-cash/${r.id}`)}>
                  <td class="px-6 py-4">
                    <div class="font-mono text-[11px] font-bold text-indigo-500">{r.request_no || "—"}</div>
                    <div class="font-bold text-gray-900 dark:text-white line-clamp-1 max-w-xs">{r.purpose}</div>
                    <div class="text-[11px] text-gray-400">{r.university_name} · {r.category}</div>
                  </td>
                  <td class="px-6 py-4 text-gray-600 dark:text-slate-300">{r.requester_name || r.requester_email}</td>
                  <td class="px-6 py-4 text-right tabular-nums">
                    <div class="font-black text-gray-900 dark:text-white">{money(r.amount_approved ?? r.amount_requested)}</div>
                    {#if r.outstanding_amount > 0}<div class="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">{money(r.outstanding_amount)} out</div>{/if}
                  </td>
                  <td class="px-6 py-4">
                    <span class="inline-flex px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest {st(r.status).cls}">{st(r.status).label}</span>
                  </td>
                  <td class="px-6 py-4">
                    {#if overdue}
                      <span class="inline-flex items-center gap-1 text-[10px] font-black text-red-500 uppercase tracking-wider">● {ageDays(r.bill_due_on)}d overdue</span>
                    {:else if r.bill_due_on && ["DISBURSED", "BILL_SUBMITTED"].includes(r.status)}
                      <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">due {new Date(r.bill_due_on).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                    {:else if r.bill_count > 0}
                      <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{r.verified_count}/{r.bill_count} verified</span>
                    {:else}<span class="text-gray-300 dark:text-slate-700">—</span>{/if}
                  </td>
                  <td class="px-6 py-4 text-right">
                    <span class="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Open →</span>
                  </td>
                </tr>
              {:else}
                <tr><td colspan="6" class="px-6 py-16 text-center">
                  <p class="text-sm font-black text-gray-400 uppercase tracking-widest">Nothing here</p>
                  <p class="text-[11px] text-gray-400 mt-1">No requests in this view.</p>
                </td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  </div>
</div>
