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
  let isInternal = $state(false);
  let commentVisibility = $derived(isInternal ? "INTERNAL" : "PUBLIC");
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
      case "APPROVED_L1":
        return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400";
      case "APPROVED_L2":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
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
          visibility: isInternal ? "INTERNAL" : "PUBLIC",
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

  async function deleteProposal() {
    if (
      !confirm(
        "Are you sure you want to completely delete this budget proposal? This action cannot be undone.",
      )
    )
      return;

    isActionLoading = true;
    try {
      const res = await fetch(`/api/budget-proposals/${proposal.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        window.location.href = "/budget-proposals";
      } else {
        const err = await res.json();
        alert(err.message || "Failed to delete proposal");
      }
    } finally {
      isActionLoading = false;
    }
  }

  let fileInput = $state<HTMLInputElement>();
  let isUploading = $state(false);
  let uploadProgress = $state(0);

  async function uploadFile(e: Event, category: 'SUPPORTING' | 'BILL' = 'SUPPORTING') {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;

    isUploading = true;
    uploadProgress = 0;

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", category);

        const res = await fetch(
          `/api/budget-proposals/${proposal.id}/attachments`,
          {
            method: "POST",
            body: formData,
          },
        );

        if (!res.ok) {
          const err = await res.json();
          alert(`Failed to upload ${file.name}: ${err.message}`);
        }
      }
      await invalidateAll();
    } finally {
      isUploading = false;
      if (fileInput) fileInput.value = "";
      if (billInput) billInput.value = "";
    }
  }

  // Preview logic
  let previewUrl = $state<string | null>(null);
  let previewType = $state<string | null>(null);

  function openPreview(file: any) {
    let url = file.file_url;
    // Fallback to Base64 if available for cross-laptop visibility
    if (file.file_content && file.file_type?.startsWith('image')) {
        url = `data:${file.file_type};base64,${file.file_content}`;
    } else if (url.startsWith("/uploads/")) {
        url = url.replace("/uploads/", "/api/uploads/");
    }
    previewUrl = url;
    previewType = file.file_type || "";
  }

  async function deleteAttachment(id: string) {
    if (!confirm("Are you sure you want to delete this document?")) return;
    try {
      const res = await fetch(
        `/api/budget-proposals/${proposal.id}/attachments/${id}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) {
        await invalidateAll();
      } else {
        const error = await res.json();
        alert(error.message || "Failed to delete attachment");
      }
    } catch (e) {
      console.error(e);
      alert("Error deleting attachment");
    }
  }

  let billInput = $state<HTMLInputElement>();
  const supportingDocs = $derived(proposal.attachments.filter(a => a.category !== 'BILL'));
  const bills = $derived(proposal.attachments.filter(a => a.category === 'BILL'));

  const isGlobalAdmin = $derived(
    user.role === "ADMIN" || user.role === "PROGRAM_OPS",
  );
  const isSET = $derived(user.role === "SET_REVIEWER");
  const canReview = $derived(isGlobalAdmin || isSET);
  const isProposer = $derived(proposal.proposer_user_id === user.id);
  const eventPassed = $derived(new Date(proposal.proposed_date) < new Date());
</script>

<div class="p-6 max-w-7xl mx-auto space-y-8">
  <!-- Banner for pending report -->
  {#if proposal.status === "EVENT_COMPLETED" || (proposal.status === "APPROVED" && eventPassed)}
    <div
      in:fly={{ y: -20 }}
      class="bg-indigo-600 text-white p-4 rounded-3xl flex items-center justify-between shadow-lg shadow-indigo-500/20"
    >
      <div class="flex items-center gap-4">
        <div
          class="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl"
        >
          ⏳
        </div>
        <div>
          <h4 class="font-black uppercase tracking-widest text-sm">
            Action Required: Report Pending
          </h4>
          <p class="text-indigo-100 text-xs">
            This event has concluded. Please submit the post-event report to
            close the proposal.
          </p>
        </div>
      </div>
      {#if isProposer || isGlobalAdmin}
        <a
          href="/budget-proposals/{proposal.id}/report"
          class="px-6 py-2 bg-white text-indigo-600 rounded-xl font-black text-xs uppercase hover:bg-indigo-50 transition-all"
          >Submit Now</a
        >
      {/if}
    </div>
  {/if}

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
          <div
            class="flex items-center gap-2 text-[11px] text-gray-500 uppercase font-black tracking-tighter"
          >
            <span class="text-emerald-600">{proposal.university_name}</span>
            <span class="text-gray-300">|</span>
            <span>Ref: {proposal.id.slice(0, 8).toUpperCase()}</span>
            <span class="text-gray-300">|</span>
            <span
              >Created {new Date(
                proposal.created_at,
              ).toLocaleDateString()}</span
            >
            <span class="text-gray-300">|</span>
            <span class="text-indigo-600"
              >Proposed by {proposal.proposer_name ||
                proposal.proposer_email}</span
            >
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
      {#if isGlobalAdmin}
        <button
          onclick={deleteProposal}
          disabled={isActionLoading}
          class="px-4 py-2.5 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl font-bold transition-all shadow-sm active:scale-95 flex items-center gap-2 text-xs uppercase cursor-pointer"
        >
          {isActionLoading ? "..." : "Delete"}
        </button>
      {/if}
      {#if isProposer && (proposal.status === "DRAFT" || proposal.status === "CHANGES_REQUESTED")}
        <a
          href="/budget-proposals/{proposal.id}/edit"
          class="px-5 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 text-gray-600 dark:text-gray-300 rounded-xl font-bold transition-all shadow-sm active:scale-95 flex items-center gap-2"
        >
          Edit Proposal
        </a>
        <button
          onclick={submitForReview}
          disabled={isActionLoading}
          class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all shadow-md shadow-emerald-500/20 active:scale-95 flex items-center gap-2"
        >
          {isActionLoading ? "..." : "Submit for Review"}
        </button>
        <button
          onclick={deleteProposal}
          disabled={isActionLoading}
          class="px-5 py-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-xl font-bold transition-all active:scale-95"
        >
          {isActionLoading ? "..." : "Delete"}
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
            class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md"
            >Approve (L1)</button
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
        {#if proposal.status === "APPROVED_L1" && isGlobalAdmin}
          <button
            onclick={() => {
              showActionModal = "approve";
              actionBudget = proposal.approved_total_budget || proposal.estimated_total_budget;
            }}
            class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md"
            >Final Approve</button
          >
          <button
            onclick={() => (showActionModal = "request-changes")}
            class="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-md"
            >Request Changes</button
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
        {#if (proposal.status === "APPROVED" && eventPassed) || proposal.status === "EVENT_COMPLETED"}
           {#if isProposer || isGlobalAdmin}
            <a
              href="/budget-proposals/{proposal.id}/report"
              class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition-all active:scale-95 flex items-center gap-2"
            >
              📊 Submit Final Report
            </a>
          {/if}
        {/if}
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
        <div class="flex items-center justify-between">
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
          <div
            class="flex items-center gap-3 bg-gray-50 dark:bg-gray-900/50 px-4 py-2 rounded-2xl border border-gray-100 dark:border-gray-700"
          >
            <div
              class="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] text-white font-black"
            >
              {(proposal.proposer_name || proposal.proposer_email)
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div>
              <p
                class="text-[10px] font-black text-gray-400 uppercase leading-none"
              >
                Proposed By
              </p>
              <p
                class="text-xs font-bold text-gray-900 dark:text-white line-clamp-1"
              >
                {proposal.proposer_name || proposal.proposer_email}
              </p>
            </div>
          </div>
        </div>

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
          <table class="w-full text-left border-collapse">
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
        <div class="flex items-center justify-between">
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

          {#if isProposer || canReview}
            <div class="relative">
              <input
                type="file"
                multiple
                class="hidden"
                bind:this={fileInput}
                onchange={(e) => uploadFile(e, 'SUPPORTING')}
                accept=".jpg,.jpeg,.png,.webp,.pdf"
              />
              <button
                onclick={() => fileInput?.click()}
                aria-label="Upload supporting documents"
                disabled={isUploading}
                class="px-5 py-2.5 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                {#if isUploading}
                  <div
                    class="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"
                  ></div>
                {:else}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                {/if}
                Upload
              </button>
            </div>
          {/if}
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {#each supportingDocs as file}
            <div
              class="group relative bg-gray-50 dark:bg-gray-900/50 p-4 rounded-3xl border border-gray-100 dark:border-gray-700 hover:border-emerald-500 transition-all shadow-sm"
            >
              <!-- Thumbnail / Icon -->
              <div
                class="aspect-[4/3] rounded-2xl bg-gray-100 dark:bg-gray-800 mb-4 overflow-hidden flex items-center justify-center cursor-pointer relative"
                onclick={() => openPreview(file)}
              >
                {#if file.file_type?.includes("image") || ["JPG", "PNG", "WEBP", "JPEG"].includes(file.file_type?.toUpperCase())}
                  <img
                    src={file.file_content ? `data:${file.file_type};base64,${file.file_content}` : (file.file_url.startsWith("/uploads/") ? file.file_url.replace("/uploads/", "/api/uploads/") : file.file_url)}
                    alt={file.file_name}
                    class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  {#if file.file_content}
                    <div class="absolute bottom-2 right-2 px-1.5 py-0.5 bg-emerald-500/80 backdrop-blur rounded text-[8px] text-white font-bold">☁️ PERMANENT</div>
                  {/if}
                {:else if file.file_type?.toUpperCase() === "PDF"}
                  <div class="flex flex-col items-center gap-2">
                    <div
                      class="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center text-red-600 font-black text-xs"
                    >
                      PDF
                    </div>
                    <p class="text-[10px] font-bold text-gray-400">
                      Preview Available
                    </p>
                  </div>
                {:else}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-10 h-10 text-gray-300"
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
                {/if}
              </div>

              <!-- Delete Button overlay -->
              {#if isProposer || canReview}
                <button
                  type="button"
                  aria-label="Delete document"
                  onclick={(e) => {
                    e.stopPropagation();
                    deleteAttachment(file.id);
                  }}
                  class="absolute top-4 right-4 w-8 h-8 bg-black/40 hover:bg-red-600 text-white rounded-xl shadow-lg flex items-center justify-center transition-all z-10 hover:scale-110"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              {/if}

              <div class="space-y-1">
                <p
                  class="font-bold text-gray-900 dark:text-white truncate text-xs"
                >
                  {file.file_name}
                </p>
                <p
                  class="text-[9px] text-gray-400 uppercase font-black tracking-widest"
                >
                  {file.file_type || "Unknown"}
                </p>
              </div>

              <div
                class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <a
                  href={file.file_url}
                  download={file.file_name}
                  class="p-2 bg-white/90 backdrop-blur rounded-xl shadow-lg hover:bg-white text-gray-600 transition-all"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-4 h-4"
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
              </div>
            </div>
          {:else}
            <p
              class="col-span-full py-12 text-center text-gray-400 border-2 border-dashed border-gray-50 dark:border-gray-700 rounded-[32px] italic text-sm"
            >
              No attachments provided yet.
            </p>
          {/each}
        </div>
      </section>

      <!-- Bills Section -->
      <section
        class="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-6"
      >
        <div class="flex items-center justify-between">
          <h2
            class="text-xl font-black text-gray-900 dark:text-white flex items-center gap-3"
          >
            <div
              class="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center text-blue-600"
            >
              🧾
            </div>
            Event Bills & Receipts
          </h2>

          {#if isProposer || canReview}
            <div class="relative">
              <input
                type="file"
                multiple
                class="hidden"
                bind:this={billInput}
                onchange={(e) => uploadFile(e, 'BILL')}
                accept=".jpg,.jpeg,.png,.webp,.pdf"
              />
              <button
                onclick={() => billInput?.click()}
                aria-label="Upload event bills"
                disabled={isUploading}
                class="px-5 py-2.5 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                {#if isUploading}
                  <div
                    class="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"
                  ></div>
                {:else}
                   🏷️
                {/if}
                Upload Bills
              </button>
            </div>
          {/if}
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {#each bills as file}
            <div
              class="group relative bg-gray-50 dark:bg-gray-900/50 p-4 rounded-3xl border border-gray-100 dark:border-gray-700 hover:border-blue-500 transition-all shadow-sm"
            >
              <div
                class="aspect-[4/3] rounded-2xl bg-gray-100 dark:bg-gray-800 mb-4 overflow-hidden flex items-center justify-center cursor-pointer relative"
                onclick={() => openPreview(file)}
              >
                {#if file.file_type?.includes("image") || ["JPG", "PNG", "WEBP", "JPEG"].includes(file.file_type?.toUpperCase())}
                   <img
                    src={file.file_content ? `data:${file.file_type};base64,${file.file_content}` : (file.file_url.startsWith("/uploads/") ? file.file_url.replace("/uploads/", "/api/uploads/") : file.file_url)}
                    alt={file.file_name}
                    class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                   {#if file.file_content}
                    <div class="absolute bottom-2 right-2 px-1.5 py-0.5 bg-blue-500/80 backdrop-blur rounded text-[8px] text-white font-bold">☁️ PERMANENT</div>
                  {/if}
                {:else if file.file_type?.toUpperCase() === "PDF"}
                  <div class="flex flex-col items-center gap-2">
                    <div class="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-600 font-black text-xs">PDF</div>
                  </div>
                {:else}
                  📁
                {/if}
              </div>

               <div class="space-y-1">
                <p class="font-bold text-gray-900 dark:text-white truncate text-xs">{file.file_name}</p>
                <p class="text-[9px] text-gray-400 uppercase font-black tracking-widest">{file.file_type || "Unknown"}</p>
              </div>

               <!-- Delete Button -->
               {#if isProposer || canReview}
                <button
                  type="button"
                  aria-label="Delete bill"
                  onclick={(e) => { e.stopPropagation(); deleteAttachment(file.id); }}
                  class="absolute top-4 right-4 w-8 h-8 bg-black/40 hover:bg-red-600 text-white rounded-xl shadow-lg flex items-center justify-center transition-all z-10 hover:scale-110"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              {/if}
            </div>
          {:else}
            <p
              class="col-span-full py-12 text-center text-gray-400 border-2 border-dashed border-gray-50 dark:border-gray-700 rounded-[32px] italic text-sm"
            >
              No bills uploaded yet.
            </p>
          {/each}
        </div>
      </section>

      <!-- Post-Event Report -->
      {#if proposal.report}
        <section
          class="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-8 animate-premium-fade"
        >
          <div class="flex items-center justify-between">
            <h2
              class="text-xl font-black text-gray-900 dark:text-white flex items-center gap-3"
            >
              <div
                class="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center text-indigo-600"
              >
                📊
              </div>
              Post-Event Impact Report
            </h2>
            <div
              class="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-2xl text-[10px] font-black uppercase tracking-widest"
            >
              Reported on {new Date(
                proposal.report.submitted_at,
              ).toLocaleDateString()}
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div
              class="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700"
            >
              <p class="text-[9px] font-black text-gray-400 uppercase">
                Actual Attendance
              </p>
              <p class="text-xl font-black text-gray-900 dark:text-white">
                {proposal.report.actual_attendance || "N/A"}
              </p>
            </div>
            <div
              class="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700"
            >
              <p class="text-[9px] font-black text-gray-400 uppercase">
                Actual Budget Used
              </p>
              <p class="text-xl font-black text-gray-900 dark:text-white">
                {formatter.format(proposal.report.actual_budget_used || 0)}
              </p>
            </div>
            <div
              class="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700"
            >
              <p class="text-[9px] font-black text-gray-400 uppercase">
                Funds Remaining
              </p>
              <p
                class="text-xl font-black {proposal.report.remaining_budget &&
                proposal.report.remaining_budget < 0
                  ? 'text-red-500'
                  : 'text-emerald-600'}"
              >
                {formatter.format(proposal.report.remaining_budget || 0)}
              </p>
            </div>
          </div>

          <div class="space-y-4">
            <div class="space-y-1">
              <p
                class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
              >
                Outcomes & Success Points
              </p>
              <div
                class="p-4 bg-emerald-50/30 dark:bg-emerald-900/5 rounded-2xl border border-emerald-100/50 dark:border-emerald-900/20 text-sm italic text-gray-700 dark:text-gray-300"
              >
                {proposal.report.outcomes || "No outcomes reported."}
              </div>
            </div>

            {#if proposal.report.feedback_summary}
              <div class="space-y-1">
                <p
                  class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
                >
                  Feedback Highlights
                </p>
                <div class="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl text-sm italic text-gray-700 dark:text-gray-300">
                  {proposal.report.feedback_summary}
                </div>
              </div>
            {/if}

            {#if proposal.report.photos_urls && proposal.report.photos_urls.length > 0}
              <div class="space-y-3 pt-2">
                <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Event Gallery</p>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {#each proposal.report.photos_urls as photo}
                    <div 
                      class="aspect-square rounded-2xl overflow-hidden cursor-pointer hover:ring-4 ring-indigo-500/20 transition-all group"
                      onclick={() => openPreview({ file_url: photo, file_type: 'image/jpeg' })}
                    >
                      <img src={photo.startsWith('/uploads/') ? photo.replace('/uploads/', '/api/uploads/') : photo} alt="Event" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </section>
      {/if}
    </div>

    <!-- Right: Comments & Timeline -->
    <div class="space-y-8">
      <!-- Status Box -->
      <div
        class="bg-gray-900 text-white p-8 rounded-[40px] shadow-2xl shadow-indigo-500/10 space-y-4 overflow-hidden relative"
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
          <p
            class="font-black text-gray-300 text-[10px] uppercase tracking-wider"
          >
            Status: {proposal.status.replace("_", " ")}
          </p>
        </div>
      </div>

      <!-- Comments -->
      <section
        class="bg-white dark:bg-gray-800 p-6 rounded-[32px] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col h-[500px]"
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
              class="group space-y-1 {c.visibility === 'INTERNAL'
                ? 'bg-amber-50 dark:bg-amber-900/10 p-3 rounded-2xl border border-amber-100 dark:border-amber-900/20'
                : ''}"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <p
                    class="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-tighter"
                  >
                    {c.user_name}
                  </p>
                  {#if c.visibility === "INTERNAL"}
                    <span
                      class="text-[8px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-black uppercase"
                      >Internal</span
                    >
                  {/if}
                </div>
                <p class="text-[9px] text-gray-400 font-medium">
                  {new Date(c.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <p
                class="text-xs text-gray-600 dark:text-gray-400 leading-relaxed font-medium"
              >
                {c.comment}
              </p>
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
            placeholder="Type your message..."
            class="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-[20px] outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none text-xs font-medium dark:text-white"
            rows="3"
          ></textarea>

          <div class="flex items-center justify-between">
            {#if canReview}
              <div
                class="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 p-2 rounded-xl border border-gray-100 dark:border-gray-700"
              >
                <input
                  type="checkbox"
                  id="internal"
                  bind:checked={isInternal}
                  class="w-4 h-4 rounded-md dark:bg-black border-gray-200 dark:border-gray-700 text-indigo-600 focus:ring-0"
                />
                <label
                  for="internal"
                  class="text-[9px] font-black text-gray-400 uppercase tracking-widest cursor-pointer"
                  >Internal Only</label
                >
              </div>
            {:else}
              <div></div>
            {/if}

            <button
              onclick={postComment}
              disabled={isSubmittingComment || !newComment.trim()}
              class="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-md shadow-indigo-500/10"
            >
              Post Message
            </button>
          </div>
        </div>
      </section>

      <!-- Audit History -->
      <section
        class="bg-white dark:bg-gray-800 p-6 rounded-[32px] shadow-sm border border-gray-100 dark:border-gray-700"
      >
        <h2
          class="text-lg font-black text-gray-900 dark:text-white flex items-center gap-3 mb-6"
        >
          <div
            class="w-8 h-8 bg-gray-100 dark:bg-gray-900 rounded-lg flex items-center justify-center text-gray-500"
          >
            📜
          </div>
          Evolution
        </h2>

        <div class="space-y-6">
          {#each auditLogs as log}
            <div class="flex gap-4 relative">
              <div class="flex flex-col items-center">
                <div
                  class="w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-indigo-500/10 mt-1.5 z-10"
                ></div>
                <div
                  class="flex-1 w-0.5 bg-gray-100 dark:bg-gray-700 my-1"
                ></div>
              </div>
              <div class="flex-1 pb-4">
                <p
                  class="text-xs font-black text-gray-900 dark:text-white uppercase tracking-tighter"
                >
                  {log.action.replace("_", " ")}
                </p>
                {#if log.to_status}
                  <p class="text-[10px] text-gray-500">
                    Changed to <span
                      class="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-indigo-600 font-black"
                      >{log.to_status}</span
                    >
                  </p>
                {/if}
                {#if log.payload_json?.reason}
                  <div
                    class="mt-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700"
                  >
                    <p
                      class="text-[10px] text-gray-600 dark:text-gray-400 italic"
                    >
                      “{log.payload_json.reason}”
                    </p>
                  </div>
                {/if}
                <p
                  class="text-[9px] text-gray-400 mt-1 uppercase font-bold tracking-widest"
                >
                  {log.actor_name} • {new Date(log.created_at).toLocaleString(
                    [],
                    { dateStyle: "short", timeStyle: "short" },
                  )}
                </p>
              </div>
            </div>
          {/each}
        </div>
      </section>
    </div>
  </div>
</div>

<!-- Preview Modal -->
{#if previewUrl}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
    transition:fade
  >
    <button
      class="absolute top-8 right-8 text-white/50 hover:text-white p-4 transition-colors"
      onclick={() => (previewUrl = null)}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="w-8 h-8"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>

    <div
      class="max-w-4xl w-full h-[80vh] flex items-center justify-center"
      transition:fly={{ y: 20 }}
    >
      {#if (previewType || "").includes("image") || ["JPG", "PNG", "WEBP", "JPEG"].includes((previewType || "").toUpperCase())}
        <img
          src={previewUrl || ""}
          class="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
          alt="Preview"
        />
      {:else if (previewType || "").toUpperCase() === "PDF"}
        <iframe
          src={previewUrl || ""}
          class="w-full h-full rounded-2xl bg-white"
          title="PDF Preview"
        ></iframe>
      {:else}
        <div class="bg-white p-12 rounded-3xl text-center">
          <p class="text-xl font-black mb-4">No Preview Available</p>
          <a
            href={previewUrl}
            download
            class="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold uppercase text-xs tracking-widest"
            >Download File</a
          >
        </div>
      {/if}
    </div>
  </div>
{/if}

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
              class="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1"
              >Approved Budget amount (INR)</label
            >
            <input
              type="number"
              bind:value={actionBudget}
              class="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 text-lg font-black dark:text-white"
            />
          </div>
        {/if}

        <div class="space-y-2">
          <label
            class="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1"
            >Reason / Comments</label
          >
          <div class="relative">
            <textarea
              bind:value={actionReason}
              placeholder="Provide a justification for this decision..."
              class="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium dark:text-white"
              rows="4"
              maxlength="1000"
            ></textarea>
            <div
              class="absolute bottom-3 right-3 text-[10px] font-bold text-gray-400 bg-white/50 dark:bg-black/50 px-2 py-1 rounded-lg"
            >
              {actionReason.length} / 1000
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3 pt-4">
          <button
            onclick={() => (showActionModal = null)}
            class="flex-1 py-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all"
          >
            Cancel
          </button>
          <button
            onclick={() => showActionModal && handleAction(showActionModal)}
            disabled={isActionLoading ||
              (showActionModal !== "approve" && !actionReason)}
            class="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-500/20 transition-all disabled:opacity-50"
          >
            {isActionLoading ? "Processing..." : "Confirm Action"}
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
