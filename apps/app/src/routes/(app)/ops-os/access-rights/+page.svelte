<script lang="ts">
  import { invalidateAll } from '$app/navigation';

  type AssignmentRow = {
    user_id: string;
    user_name: string;
    user_email: string;
    role: string;
    assigned_at: string;
    non_response_count: number;
  };
  type CampusAccess = {
    campus_id: string;
    code: string;
    display_name: string;
    cluster_id: string;
    cluster_name: string;
    cos_user_id: string | null;
    cos_user_name: string | null;
    cos_user_email: string | null;
    boas: AssignmentRow[];
    pms: AssignmentRow[];
  };
  type UserOption = { id: string; name: string; email: string; role: string };
  type Cluster = {
    cluster_id: string;
    cluster_name: string;
    cos_user_id: string | null;
    cos_user_name: string | null;
    cos_user_email: string | null;
  };

  let { data } = $props<{ data: {
    campuses: CampusAccess[];
    users: UserOption[];
    clusters: Cluster[];
    role: string;
  } }>();

  let busy = $state<Record<string, boolean>>({});
  let errorMsg = $state<string | null>(null);
  let successMsg = $state<string | null>(null);

  // Manual reminder fire (testing aid)
  type ReminderKind = 'boa_submit_due_soon' | 'pm_review_open' | 'pm_review_final';
  type ReminderResult = {
    ok: boolean;
    kind: ReminderKind;
    period_start: string;
    sent: number;
    skipped_already_sent: number;
    email_attempts: number;
    recipients: Array<{
      user_name: string | null;
      user_email: string | null;
      campus_name: string;
      already_sent: boolean;
    }>;
    note?: string;
  };
  let reminderResult = $state<ReminderResult | null>(null);
  let reminderForce = $state(false);
  let reminderBroadcast = $state(true);  // Default ON since assignments aren't set up yet

  let autoSyncResult = $state<{ users_scanned: number; rows_inserted: number; skipped_revoked: number } | null>(null);
  async function autoSyncBoas() {
    busy[`autosync`] = true; errorMsg = null; autoSyncResult = null;
    try {
      const res = await fetch('/api/ops-os/assignments/auto-sync-boas', { method: 'POST' });
      if (!res.ok) { flash((await res.text()) || `HTTP ${res.status}`, 'err'); return; }
      autoSyncResult = await res.json();
      flash(`Auto-sync complete — ${autoSyncResult?.rows_inserted ?? 0} new assignments`, 'ok');
      await invalidateAll();
    } catch (e) { flash((e as Error).message, 'err'); }
    finally { delete busy[`autosync`]; }
  }

  async function fireReminder(kind: ReminderKind) {
    busy[`reminder:${kind}`] = true; errorMsg = null; reminderResult = null;
    try {
      const res = await fetch('/api/ops-os/reminders/fire', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, force: reminderForce, broadcast: reminderBroadcast }),
      });
      if (!res.ok) { flash((await res.text()) || `HTTP ${res.status}`, 'err'); return; }
      reminderResult = await res.json();
      flash(`Reminder fired: ${reminderResult?.sent ?? 0} sent, ${reminderResult?.skipped_already_sent ?? 0} skipped`, 'ok');
    } catch (e) { flash((e as Error).message, 'err'); }
    finally { delete busy[`reminder:${kind}`]; }
  }

  async function diagnoseReminder(kind: ReminderKind) {
    busy[`diagnose:${kind}`] = true; errorMsg = null; reminderResult = null;
    try {
      const params = new URLSearchParams({ kind });
      if (reminderBroadcast) params.set('broadcast', '1');
      const res = await fetch(`/api/ops-os/reminders/fire?${params.toString()}`);
      if (!res.ok) { flash((await res.text()) || `HTTP ${res.status}`, 'err'); return; }
      reminderResult = await res.json();
      flash(`Diagnose: ${reminderResult?.recipients?.length ?? 0} eligible recipients`, 'ok');
    } catch (e) { flash((e as Error).message, 'err'); }
    finally { delete busy[`diagnose:${kind}`]; }
  }

  // Per-campus add inputs
  let addInputs = $state<Record<string, { user_id: string; role: 'BOA' | 'PM' }>>(
    Object.fromEntries(data.campuses.map((c: CampusAccess) => [c.campus_id, { user_id: '', role: 'BOA' as const }])),
  );
  // Per-cluster COS reassign input
  let cosInputs = $state<Record<string, string>>(
    Object.fromEntries(data.clusters.map((c: Cluster) => [c.cluster_id, c.cos_user_id ?? ''])),
  );

  let search = $state('');
  let filteredCampuses = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.campuses;
    return data.campuses.filter((c: CampusAccess) =>
      c.display_name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.cluster_name.toLowerCase().includes(q) ||
      c.boas.some(b => b.user_name.toLowerCase().includes(q) || b.user_email.toLowerCase().includes(q)) ||
      c.pms.some(p => p.user_name.toLowerCase().includes(q) || p.user_email.toLowerCase().includes(q))
    );
  });

  function flash(msg: string, kind: 'ok' | 'err') {
    if (kind === 'ok') { successMsg = msg; errorMsg = null; setTimeout(() => successMsg = null, 4000); }
    else { errorMsg = msg; successMsg = null; }
  }

  async function addAssignment(campus_id: string) {
    const inp = addInputs[campus_id];
    if (!inp || !inp.user_id) { flash('Pick a user first', 'err'); return; }
    busy[`add:${campus_id}`] = true; errorMsg = null;
    try {
      const res = await fetch('/api/ops-os/assignments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: inp.user_id, campus_id, role: inp.role }),
      });
      if (!res.ok) { flash((await res.text()) || `HTTP ${res.status}`, 'err'); return; }
      addInputs[campus_id] = { user_id: '', role: inp.role };
      flash(`Assigned successfully`, 'ok');
      await invalidateAll();
    } catch (e) { flash((e as Error).message, 'err'); }
    finally { delete busy[`add:${campus_id}`]; }
  }

  async function revokeAssignment(campus_id: string, user_id: string, role: string) {
    if (!confirm(`Revoke ${role} access for this user?`)) return;
    busy[`rev:${user_id}:${campus_id}:${role}`] = true; errorMsg = null;
    try {
      const res = await fetch('/api/ops-os/assignments', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id, campus_id, role }),
      });
      if (!res.ok) { flash((await res.text()) || `HTTP ${res.status}`, 'err'); return; }
      flash('Access revoked', 'ok');
      await invalidateAll();
    } catch (e) { flash((e as Error).message, 'err'); }
    finally { delete busy[`rev:${user_id}:${campus_id}:${role}`]; }
  }

  async function updateCos(cluster_id: string) {
    const user_id = cosInputs[cluster_id];
    if (!user_id) { flash('Pick a user first', 'err'); return; }
    busy[`cos:${cluster_id}`] = true; errorMsg = null;
    try {
      const res = await fetch(`/api/ops-os/clusters/${cluster_id}/cos`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id }),
      });
      if (!res.ok) { flash((await res.text()) || `HTTP ${res.status}`, 'err'); return; }
      flash('COS updated', 'ok');
      await invalidateAll();
    } catch (e) { flash((e as Error).message, 'err'); }
    finally { delete busy[`cos:${cluster_id}`]; }
  }

  function userById(id: string): UserOption | undefined {
    return data.users.find((u: UserOption) => u.id === id);
  }
</script>

<div class="min-h-screen bg-zinc-950 text-zinc-100">
  <div class="mx-auto max-w-6xl px-4 py-6">

    <!-- Header -->
    <div class="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Ops OS · Admin</div>
          <div class="mt-1 text-lg font-semibold">Access Rights</div>
          <div class="mt-0.5 text-xs text-zinc-400">
            Assign users to campuses. BOAs see the Daily Report for their campus; PMs see the PM Review Queue for their campus; the cluster COS sees the Operations Overview.
          </div>
        </div>
        <div class="flex items-center gap-2">
          <input
            type="search"
            placeholder="Search campus, cluster, user…"
            bind:value={search}
            class="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm w-64 focus:border-blue-600 focus:outline-none"
          />
        </div>
      </div>
      {#if errorMsg}
        <div class="mt-3 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">{errorMsg}</div>
      {/if}
      {#if successMsg}
        <div class="mt-3 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">{successMsg}</div>
      {/if}
    </div>

    <!-- Auto-sync BOAs (bulk grant from public.users → ops_os.user_campus_assignment) -->
    <section class="mb-6 overflow-hidden rounded-2xl border border-emerald-900 bg-emerald-950/20">
      <header class="border-b border-emerald-900/50 px-4 py-3">
        <div class="text-[10px] uppercase tracking-[0.18em] text-emerald-400">Bulk grant</div>
        <div class="text-sm font-semibold text-emerald-100">Auto-assign every BOA to their university's campuses</div>
        <div class="mt-0.5 text-xs text-emerald-200/70">
          Reads every user with role=BOA, looks up their university (primary + linked), and creates a
          campus assignment for every active campus in those universities.
          Runs automatically at app boot — click to run again any time. Idempotent; previously revoked rows stay revoked.
        </div>
      </header>
      <div class="px-4 py-3 flex flex-wrap items-center gap-3">
        <button
          class="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500"
          disabled={!!busy[`autosync`]}
          onclick={autoSyncBoas}
        >{busy[`autosync`] ? 'Syncing…' : 'Run auto-sync now'}</button>
        {#if autoSyncResult}
          <div class="text-xs text-emerald-200">
            Scanned <strong class="tabular-nums">{autoSyncResult.users_scanned}</strong> BOA/PM/PMA users ·
            Created <strong class="tabular-nums text-emerald-300">{autoSyncResult.rows_inserted}</strong> new assignments ·
            <span class="text-amber-300">{autoSyncResult.skipped_revoked}</span> previously revoked pairs preserved
          </div>
        {/if}
      </div>
    </section>

    <!-- Manual reminder fire (testing aid) -->
    <section class="mb-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <header class="border-b border-zinc-800 px-4 py-3">
        <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Testing aid</div>
        <div class="text-sm font-semibold">Fire reminder emails now</div>
        <div class="mt-0.5 text-xs text-zinc-500">
          Bypass the time-of-day window. Use <strong>Diagnose</strong> first to see who'd be reminded without sending anything.
        </div>
      </header>
      <div class="px-4 py-3 space-y-3">
        <label class="inline-flex items-center gap-2 text-xs text-zinc-200 cursor-pointer rounded-md border border-blue-800 bg-blue-950/30 px-3 py-2 hover:bg-blue-950/60">
          <input type="checkbox" bind:checked={reminderBroadcast} class="accent-blue-500" />
          <span><strong class="text-blue-200">Broadcast mode</strong> — send to every active user with the matching role (BOA / PM / PMA), ignoring campus assignments. Use when assignments aren't set up yet.</span>
        </label>
        <label class="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
          <input type="checkbox" bind:checked={reminderForce} class="accent-amber-500" />
          Force re-send (ignore dedupe — recipients pinged earlier today will get the email again)
        </label>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {#each ['boa_submit_due_soon', 'pm_review_open', 'pm_review_final'] as kind}
            {@const label = kind === 'boa_submit_due_soon' ? 'BOA · submit due soon (3:30 PM)'
                          : kind === 'pm_review_open' ? 'PM · review open (4:30 PM)'
                          : 'PM · final reminder (6:00 PM)'}
            <div class="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div class="text-xs font-medium text-zinc-200">{label}</div>
              <div class="mt-2 flex gap-2">
                <button
                  class="flex-1 rounded-md border border-zinc-700 px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                  disabled={!!busy[`diagnose:${kind}`]}
                  onclick={() => diagnoseReminder(kind as ReminderKind)}
                >{busy[`diagnose:${kind}`] ? '…' : 'Diagnose'}</button>
                <button
                  class="flex-1 rounded-md bg-blue-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500"
                  disabled={!!busy[`reminder:${kind}`]}
                  onclick={() => fireReminder(kind as ReminderKind)}
                >{busy[`reminder:${kind}`] ? '…' : 'Fire now'}</button>
              </div>
            </div>
          {/each}
        </div>

        {#if reminderResult}
          <div class="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs">
            <div class="flex flex-wrap items-center gap-3 mb-2">
              <span class="rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wider">{reminderResult.kind}</span>
              <span class="text-zinc-400">period <span class="text-zinc-200 tabular-nums">{reminderResult.period_start}</span></span>
              {#if reminderResult.sent !== undefined}
                <span class="text-emerald-400">sent: <strong class="tabular-nums">{reminderResult.sent}</strong></span>
                <span class="text-amber-400">already sent: <strong class="tabular-nums">{reminderResult.skipped_already_sent}</strong></span>
                <span class="text-blue-400">email attempts: <strong class="tabular-nums">{reminderResult.email_attempts}</strong></span>
              {/if}
            </div>
            {#if reminderResult.note}
              <div class="mb-2 text-zinc-400">{reminderResult.note}</div>
            {/if}
            {#if reminderResult.recipients.length === 0}
              <div class="text-zinc-500 italic">No eligible recipients. Check: BOA/PM assignments exist? Submission status correct for the kind?</div>
            {:else}
              <table class="w-full text-[11px]">
                <thead class="text-zinc-500">
                  <tr><th class="text-left py-1">User</th><th class="text-left py-1">Email</th><th class="text-left py-1">Campus</th><th class="text-right py-1">Status</th></tr>
                </thead>
                <tbody>
                  {#each reminderResult.recipients as r}
                    <tr class="border-t border-zinc-800">
                      <td class="py-1 text-zinc-200">{r.user_name ?? '—'}</td>
                      <td class="py-1 text-zinc-400">{r.user_email ?? '—'}</td>
                      <td class="py-1 text-zinc-300">{r.campus_name}</td>
                      <td class="py-1 text-right">
                        {#if r.already_sent}
                          <span class="text-amber-400">already sent</span>
                        {:else}
                          <span class="text-emerald-400">sent now</span>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </div>
        {/if}
      </div>
    </section>

    <!-- Cluster COS panel -->
    <section class="mb-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <header class="border-b border-zinc-800 px-4 py-3">
        <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Cluster ownership</div>
        <div class="text-sm font-semibold">COS per cluster (controls who sees Operations Overview)</div>
      </header>
      <div class="divide-y divide-zinc-800">
        {#each data.clusters as cl (cl.cluster_id)}
          <div class="px-4 py-3 grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-3 items-center">
            <div>
              <div class="font-medium">{cl.cluster_name}</div>
              <div class="text-[10px] uppercase tracking-wider text-zinc-500">cluster</div>
            </div>
            <div class="flex items-center gap-2">
              {#if cl.cos_user_id}
                <span class="rounded-md bg-emerald-900/30 border border-emerald-800 px-2 py-0.5 text-[11px] text-emerald-200">
                  Current: <strong>{cl.cos_user_name}</strong> · {cl.cos_user_email}
                </span>
              {:else}
                <span class="text-xs text-amber-300">No COS assigned</span>
              {/if}
            </div>
            <div class="flex items-center gap-2 justify-end">
              <select
                class="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs"
                bind:value={cosInputs[cl.cluster_id]}
              >
                <option value="">Choose new COS…</option>
                {#each data.users.filter((u: UserOption) => ['COS', 'PROGRAM_OPS', 'ADMIN'].includes(u.role)) as u (u.id)}
                  <option value={u.id}>{u.name} · {u.role}</option>
                {/each}
              </select>
              <button
                class="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500"
                disabled={!cosInputs[cl.cluster_id] || cosInputs[cl.cluster_id] === cl.cos_user_id || !!busy[`cos:${cl.cluster_id}`]}
                onclick={() => updateCos(cl.cluster_id)}
              >{busy[`cos:${cl.cluster_id}`] ? '…' : 'Update'}</button>
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- Per-campus assignments -->
    <div class="space-y-3">
      {#each filteredCampuses as c (c.campus_id)}
        <section class="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <header class="border-b border-zinc-800 px-4 py-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-base font-semibold">{c.display_name}</div>
                <div class="mt-0.5 text-[11px] text-zinc-500">
                  <span class="uppercase tracking-wider">{c.code}</span>
                  · cluster: <span class="text-zinc-400">{c.cluster_name}</span>
                  · COS: <span class="text-zinc-400">{c.cos_user_name ?? '—'}</span>
                </div>
              </div>
              <div class="flex items-center gap-1 text-xs text-zinc-400">
                <span class="rounded-md bg-zinc-800 px-2 py-0.5">{c.boas.length} BOA</span>
                <span class="rounded-md bg-zinc-800 px-2 py-0.5">{c.pms.length} PM</span>
              </div>
            </div>
          </header>

          <!-- BOAs -->
          <div class="px-4 py-3 border-b border-zinc-800">
            <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">BOAs · access to Daily Report</div>
            {#if c.boas.length === 0}
              <div class="text-xs text-zinc-500 italic">No BOA assigned — daily report is inaccessible to anyone except admins.</div>
            {:else}
              <div class="space-y-1">
                {#each c.boas as a (a.user_id)}
                  <div class="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm">
                    <div class="min-w-0">
                      <div class="font-medium truncate">{a.user_name}</div>
                      <div class="text-[11px] text-zinc-500 truncate">{a.user_email}</div>
                    </div>
                    <button
                      class="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                      disabled={!!busy[`rev:${a.user_id}:${c.campus_id}:${a.role}`]}
                      onclick={() => revokeAssignment(c.campus_id, a.user_id, a.role)}
                    >Revoke</button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- PMs -->
          <div class="px-4 py-3 border-b border-zinc-800">
            <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">PMs · access to PM Review Queue</div>
            {#if c.pms.length === 0}
              <div class="text-xs text-zinc-500 italic">No PM assigned — submissions for this campus will auto-sign-off after 6:30 PM IST with no reviewer.</div>
            {:else}
              <div class="space-y-1">
                {#each c.pms as a (a.user_id)}
                  <div class="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm">
                    <div class="min-w-0">
                      <div class="font-medium truncate">{a.user_name}</div>
                      <div class="text-[11px] text-zinc-500 truncate">
                        {a.user_email}
                        {#if a.non_response_count > 0}
                          <span class="ml-2 rounded-md bg-amber-900/40 px-1.5 py-0.5 text-[10px] uppercase text-amber-200">
                            {a.non_response_count} non-response{a.non_response_count === 1 ? '' : 's'}
                          </span>
                        {/if}
                      </div>
                    </div>
                    <button
                      class="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                      disabled={!!busy[`rev:${a.user_id}:${c.campus_id}:${a.role}`]}
                      onclick={() => revokeAssignment(c.campus_id, a.user_id, a.role)}
                    >Revoke</button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Add row -->
          <div class="px-4 py-3 bg-zinc-950/40 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-center">
            <select
              class="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              bind:value={addInputs[c.campus_id].user_id}
            >
              <option value="">Add user…</option>
              {#each data.users as u (u.id)}
                <option value={u.id}>{u.name} · {u.email} · {u.role}</option>
              {/each}
            </select>
            <select
              class="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              bind:value={addInputs[c.campus_id].role}
            >
              <option value="BOA">as BOA</option>
              <option value="PM">as PM</option>
            </select>
            <button
              class="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500"
              disabled={!addInputs[c.campus_id].user_id || !!busy[`add:${c.campus_id}`]}
              onclick={() => addAssignment(c.campus_id)}
            >{busy[`add:${c.campus_id}`] ? '…' : 'Grant access'}</button>
          </div>
        </section>
      {/each}
    </div>
  </div>
</div>
