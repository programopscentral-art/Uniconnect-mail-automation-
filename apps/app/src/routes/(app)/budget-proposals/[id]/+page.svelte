<script lang="ts">
  import { fade, fly, slide } from "svelte/transition";
  import type { PageData } from "./$types";
  import { invalidateAll } from "$app/navigation";

  let { data } = $props<{ data: PageData }>();
  let proposal = $derived(data.proposal);
  let auditLogs = $derived(data.auditLogs);
  let comments = $derived(data.comments);
  let user = $derived(data.user);

  let newComment = $state("");
  let commentVisibility = $state<"PUBLIC" | "INTERNAL">("PUBLIC");
  let isSubmittingComment = $state(false);

  let showActionModal = $state<
    "approve" | "reject" | "request-changes" | "close" | null
  >(null);
  let actionReason = $state("");
  let actionBudget = $state(0);
  let isActionLoading = $state(false);

  const formatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  });

  function getStatusColor(status: string) {
    switch (status) {
      case "DRAFT":
        return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
      case "SUBMITTED":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "UNDER_REVIEW":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      case "CHANGES_REQUESTED":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
      case "APPROVED":
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "REJECTED":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      case "EVENT_COMPLETED":
        return "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400";
      case "REPORT_SUBMITTED":
        return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400";
      case "CLOSED":
        return "bg-gray-800 text-white dark:bg-black dark:text-gray-300";
      default:
        return "bg-gray-100 text-gray-700";
    }
  }

  async function postComment() {
    if (!newComment.trim()) return;
    isSubmittingComment = true;
    try {
      const res = await fetch(`/api/budget-proposals/${proposal.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: newComment,
          visibility: commentVisibility,
        }),
      });
      if (res.ok) {
        newComment = "";
        await invalidateAll();
      }
    } finally {
      isSubmittingComment = false;
    }
  }

  async function handleAction(action: string) {
    isActionLoading = true;
    try {
      const body: any = { action, reason: actionReason };
      if (action === "approve") body.approvedBudget = actionBudget;

      const res = await fetch(`/api/budget-proposals/${proposal.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        showActionModal = null;
        actionReason = "";
        await invalidateAll();
      } else {
        const err = await res.json();
        alert(err.message || "Action failed");
      }
    } finally {
      isActionLoading = false;
    }
  }

  async function submitForReview() {
    isActionLoading = true;
    try {
      const res = await fetch(`/api/budget-proposals/${proposal.id}/submit`, {
        method: "POST",
      });
      if (res.ok) await invalidateAll();
    } finally {
      isActionLoading = false;
    }
  }

  const isGlobalAdmin = $derived(
    user.role === "ADMIN" || user.role === "PROGRAM_OPS",
  );
  const isSET = $derived(user.role === "SET_REVIEWER");
  const canReview = $derived(isGlobalAdmin || isSET);
  const isProposer = $derived(proposal.proposer_user_id === user.id);
</script>

<div class="p-6 max-w-7xl mx-auto space-y-8">
  <!-- Top Bar / Breadcrumb / Actions -->
  <div
    class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700"
  >
    <div class="space-y-1">
      <div class="flex items-center gap-3">
        <a
          href="/budget-proposals"
          class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
        </a>
        <div>
          <h1
            class="text-2xl font-black text-gray-900 dark:text-white line-clamp-1"
          >
            {proposal.title}
          </h1>
          <div class="flex items-center gap-2 text-sm text-gray-500">
            <span class="font-semibold text-emerald-600"
              >{proposal.university_name}</span
            >
            <span>•</span>
            <span>Ref: {proposal.id.slice(0, 8).toUpperCase()}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <div
        class="px-4 py-2 rounded-2xl {getStatusColor(
          proposal.status,
        )} font-black text-sm uppercase tracking-widest shadow-inner"
      >
        {proposal.status.replace("_", " ")}
      </div>

      <!-- Action Buttons context-aware -->
      {#if isProposer && (proposal.status === "DRAFT" || proposal.status === "CHANGES_REQUESTED")}
        <button
          onclick={submitForReview}
          disabled={isActionLoading}
          class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all shadow-md shadow-emerald-500/20 active:scale-95 flex items-center gap-2"
        >
          {isActionLoading ? "..." : "Submit Now"}
        </button>
      {/if}

      {#if canReview}
        {#if proposal.status === "SUBMITTED"}
          <button
            onclick={() => handleAction("start")}
            class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-md active:scale-95"
            >Start Review</button
          >
        {/if}
        {#if proposal.status === "UNDER_REVIEW"}
          <button
            onclick={() => {
              showActionModal = "approve";
              actionBudget = proposal.estimated_total_budget;
            }}
            class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md"
            >Approve</button
          >
          <button
            onclick={() => (showActionModal = "request-changes")}
            class="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-md"
            >Request Changes</button
          >
          <button
            onclick={() => (showActionModal = "reject")}
            class="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-md"
            >Reject</button
          >
        {/if}
        {#if proposal.status === "REPORT_SUBMITTED"}
          <button
            onclick={() => handleAction("close")}
            class="px-5 py-2.5 bg-gray-900 text-white rounded-xl font-bold shadow-md"
            >Close Proposal</button
          >
          <button
            onclick={() => (showActionModal = "request-changes")}
            class="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-md"
            >Query Report</button
          >
        {/if}
      {/if}

      {#if isProposer && proposal.status === "EVENT_COMPLETED"}
        <a
          href="/budget-proposals/{proposal.id}/report"
          class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md"
          >Submit Report</a
        >
      {/if}
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
    <!-- Left: Event Info & Budget -->
    <div class="lg:col-span-2 space-y-8">
      <!-- General Info -->
      <section
        class="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-6"
      >
        <h2
          class="text-xl font-black text-gray-900 dark:text-white flex items-center gap-3"
        >
          <div
            class="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center text-emerald-600"
          >
            📋
          </div>
          Event Particulars
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
          <div class="space-y-1">
            <p
              class="text-[10px] font-bold text-gray-400 uppercase tracking-widest"
            >
              Event Type
            </p>
            <p class="text-base font-bold text-gray-900 dark:text-white">
              {proposal.event_type}
            </p>
          </div>
          <div class="space-y-1">
            <p
              class="text-[10px] font-bold text-gray-400 uppercase tracking-widest"
            >
              Proposed Date
            </p>
            <p class="text-base font-bold text-gray-900 dark:text-white">
              {new Date(proposal.proposed_date).toLocaleString()}
            </p>
          </div>
          <div class="space-y-1">
            <p
              class="text-[10px] font-bold text-gray-400 uppercase tracking-widest"
            >
              Venue
            </p>
            <p class="text-base font-bold text-gray-900 dark:text-white">
              {proposal.venue || "N/A"}
            </p>
          </div>
          <div class="space-y-1">
            <p
              class="text-[10px] font-bold text-gray-400 uppercase tracking-widest"
            >
              Exp. Attendance
            </p>
            <p class="text-base font-bold text-gray-900 dark:text-white">
              {proposal.expected_attendance || "N/A"}
            </p>
          </div>
        </div>

        <div class="space-y-2 pt-4">
          <p
            class="text-[10px] font-bold text-gray-400 uppercase tracking-widest"
          >
            Description
          </p>
          <div
            class="text-gray-700 dark:text-gray-300 leading-relaxed bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl whitespace-pre-wrap"
          >
            {proposal.description || "No description provided."}
          </div>
        </div>
      </section>

      <!-- Budget Breakdown -->
      <section
        class="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-6 overflow-hidden"
      >
        <div class="flex items-center justify-between">
          <h2
            class="text-xl font-black text-gray-900 dark:text-white flex items-center gap-3"
          >
            <div
              class="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center text-blue-600"
            >
              📊
            </div>
            Budget Breakdown
          </h2>
          <div class="text-right">
            <p class="text-[10px] font-bold text-gray-400 uppercase">
              Estimated Total
            </p>
            <p class="text-xl font-black text-emerald-600">
              {formatter.format(proposal.estimated_total_budget)}
            </p>
          </div>
        </div>

        <div class="overflow-x-auto -mx-8">
          <table class="w-full text-left">
            <thead>
              <tr class="bg-gray-50 dark:bg-gray-900/50">
                <th
                  class="px-8 py-4 text-[10px] font-bold text-gray-400 uppercase"
                  >Category</th
                >
                <th
                  class="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase"
                  >Item Description</th
                >
                <th
                  class="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase text-center"
                  >Qty</th
                >
                <th
                  class="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase text-right"
                  >Unit Cost</th
                >
                <th
                  class="px-8 py-4 text-[10px] font-bold text-gray-400 uppercase text-right"
                  >Total</th
                >
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 dark:divide-gray-700/50">
              {#each proposal.items as item}
                <tr
                  class="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors"
                >
                  <td class="px-8 py-5">
                    <span
                      class="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-[10px] font-bold uppercase"
                      >{item.category}</span
                    >
                  </td>
                  <td
                    class="px-4 py-5 font-medium text-gray-900 dark:text-white"
                    >{item.description}</td
                  >
                  <td class="px-4 py-5 text-gray-500 text-center">{item.qty}</td
                  >
                  <td class="px-4 py-5 text-gray-500 text-right"
                    >{formatter.format(item.unit_cost)}</td
                  >
                  <td
                    class="px-8 py-5 font-bold text-gray-900 dark:text-white text-right"
                    >{formatter.format(item.amount)}</td
                  >
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>

      <!-- Attachments -->
      <section
        class="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-6"
      >
        <h2
          class="text-xl font-black text-gray-900 dark:text-white flex items-center gap-3"
        >
          <div
            class="w-8 h-8 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center text-amber-600"
          >
            📎
          </div>
          Supporting Documents
        </h2>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {#each proposal.attachments as file}
            <a
              href={file.file_url}
              target="_blank"
              class="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-emerald-500 transition-all group"
            >
              <div
                class="w-10 h-10 bg-gray-50 dark:bg-gray-900 rounded-xl flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-6 h-6 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-bold text-gray-900 dark:text-white truncate">
                  {file.file_name}
                </p>
                <p
                  class="text-[10px] text-gray-400 uppercase font-black tracking-widest"
                >
                  {file.file_type || "Unknown"}
                </p>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-5 h-5 text-gray-300 group-hover:text-emerald-500 transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </a>
          {:else}
            <p
              class="col-span-full py-6 text-center text-gray-400 border-2 border-dashed border-gray-50 dark:border-gray-700 rounded-2xl italic"
            >
              No attachments provided.
            </p>
          {/each}
        </div>
      </section>
    </div>

    <!-- Right: Comments & Timeline -->
    <div class="space-y-8">
      <!-- Status Box -->
      <div
        class="bg-gray-900 text-white p-8 rounded-3xl shadow-xl shadow-gray-200 dark:shadow-none space-y-4 overflow-hidden relative"
      >
        <div
          class="absolute -right-8 -bottom-8 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl"
        ></div>
        <p
          class="text-[10px] font-black uppercase tracking-widest text-gray-400"
        >
          Approved Budget
        </p>
        <p class="text-4xl font-black text-emerald-400">
          {proposal.approved_total_budget
            ? formatter.format(proposal.approved_total_budget)
            : "Pending"}
        </p>
        <div class="pt-4 flex items-center gap-3">
          <div
            class="w-3 h-3 rounded-full animate-pulse {proposal.status ===
            'APPROVED'
              ? 'bg-emerald-500'
              : 'bg-amber-500'}"
          ></div>
          <p class="font-bold text-gray-300 text-sm">
            Status: {proposal.status.replace("_", " ")}
          </p>
        </div>
      </div>

      <!-- Comments -->
      <section
        class="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col h-[500px]"
      >
        <h2
          class="text-lg font-black text-gray-900 dark:text-white flex items-center gap-3 mb-6"
        >
          <div
            class="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center text-purple-600"
          >
            💬
          </div>
          Discussions
        </h2>

        <div
          class="flex-1 overflow-y-auto pr-2 space-y-4 scroll-smooth no-scrollbar"
        >
          {#each comments as c}
            <div
              class="space-y-1 {c.visibility === 'INTERNAL'
                ? 'bg-amber-50 dark:bg-amber-900/10 p-3 rounded-2xl border border-amber-100 dark:border-amber-900/20'
                : ''}"
            >
              <div class="flex items-center justify-between">
                <p class="text-xs font-black text-gray-900 dark:text-white">
                  {c.user_name}
                </p>
                <p class="text-[10px] text-gray-400">
                  {new Date(c.created_at).toLocaleTimeString()}
                </p>
              </div>
              <p
                class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed uppercase tracking-tight font-medium"
                style="text-transform: none;"
              >
                {c.comment}
              </p>
              {#if c.visibility === "INTERNAL"}
                <span class="text-[9px] font-bold text-amber-600 uppercase"
                  >Internal Only</span
                >
              {/if}
            </div>
          {:else}
            <p class="text-center py-12 text-gray-400 italic text-sm">
              No comments yet.
            </p>
          {/each}
        </div>

        <div
          class="pt-6 border-t border-gray-50 dark:border-gray-700 mt-4 space-y-3"
        >
          <textarea
            bind:value={newComment}
            placeholder="Type a message..."
            class="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none text-sm dark:text-white"
            rows="3"
          ></textarea>

          <div class="flex items-center justify-between">
            {#if canReview}
              <div class="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="internal"
                  bind:checked={commentVisibility}
                  onchange={() =>
                    (commentVisibility =
                      commentVisibility === "PUBLIC" ? "INTERNAL" : "PUBLIC")}
                  class="rounded dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-emerald-600"
                />
                <label
                  for="internal"
                  class="text-xs font-bold text-gray-500 uppercase tracking-tighter"
                  >Internal</label
                >
              </div>
            {:else}
              <div></div>
            {/if}

            <button
              onclick={postComment}
              disabled={isSubmittingComment || !newComment.trim()}
              class="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase hover:bg-emerald-700 transition-all disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </section>

      <!-- Audit History -->
      <section
        class="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700"
      >
        <h2
          class="text-lg font-black text-gray-900 dark:text-white flex items-center gap-3 mb-6"
        >
          <div
            class="w-8 h-8 bg-gray-100 dark:bg-gray-900 rounded-lg flex items-center justify-center text-gray-500"
          >
            📜
          </div>
          Timeline
        </h2>

        <div class="space-y-6">
          {#each auditLogs as log}
            <div class="flex gap-4">
              <div class="flex flex-col items-center">
                <div
                  class="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20 mt-1.5"
                ></div>
                <div
                  class="flex-1 w-0.5 bg-gray-100 dark:bg-gray-700 my-1"
                ></div>
              </div>
              <div class="flex-1 pb-4">
                <p class="text-sm font-bold text-gray-900 dark:text-white">
                  {log.action.replace("_", " ")}
                </p>
                {#if log.to_status}
                  <p class="text-xs text-gray-500">
                    Changed status to <span class="text-emerald-600 font-bold"
                      >{log.to_status}</span
                    >
                  </p>
                {/if}
                <p
                  class="text-[10px] text-gray-400 mt-1 uppercase font-black uppercase"
                >
                  {log.actor_name} • {new Date(log.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          {/each}
        </div>
      </section>
    </div>
  </div>
</div>

<!-- Action Modals -->
{#if showActionModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    transition:fade
  >
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onclick={() => (showActionModal = null)}
    ></div>
    <div
      class="bg-white dark:bg-gray-800 rounded-[32px] w-full max-w-lg shadow-2xl relative overflow-hidden"
      transition:fly={{ y: 20 }}
    >
      <div class="p-8 space-y-6">
        <h3
          class="text-2xl font-black text-gray-900 dark:text-white capitalize"
        >
          {showActionModal.replace("-", " ")} Proposal
        </h3>

        {#if showActionModal === "approve"}
          <div class="space-y-2">
            <label
              class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
              >Approved Budget amount (INR)</label
            >
            <input
              type="number"
              bind:value={actionBudget}
              class="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 text-lg font-bold dark:text-white"
            />
          </div>
        {/if}

        <div class="space-y-2">
          <label
            class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
            >Reason / Comments</label
          >
          <textarea
            bind:value={actionReason}
            placeholder="Provide a justification for this decision..."
            class="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm dark:text-white"
            rows="4"
          ></textarea>
        </div>

        <div class="flex items-center gap-3 pt-4">
          <button
            onclick={() => (showActionModal = null)}
            class="flex-1 py-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-2xl font-bold hover:bg-gray-200 transition-all uppercase tracking-tighter"
          >
            Cancel
          </button>
          <button
            onclick={() => handleAction(showActionModal)}
            disabled={isActionLoading ||
              (showActionModal !== "approve" && !actionReason)}
            class="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all uppercase tracking-tighter disabled:opacity-50"
          >
            {isActionLoading ? "Processing..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
</style>
