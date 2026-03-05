<script lang="ts">
  import { page } from "$app/stores";
  import { fade, fly } from "svelte/transition";
  import type { PageData } from "./$types";

  let { data } = $props<{ data: PageData }>();
  let proposals = $derived(data.proposals);
  let universities = $derived(data.universities);
  let user = $derived(data.user);

  let activeTab = $state("all");
  let searchQuery = $state("");
  let statusFilter = $state(data.filters.status || "");
  let universityFilter = $state(data.filters.university_id || "");

  const tabs = [
    { id: "all", label: "All Proposals" },
    { id: "pending", label: "Pending Approval" },
    { id: "my", label: "My Proposals" },
    { id: "reports", label: "Pending Reports" },
  ];

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

  let filteredProposals = $derived(
    proposals.filter((p: any) => {
      const matchesSearch =
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.proposer_name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesUniv =
        !universityFilter || p.university_id === universityFilter;
      const matchesStatus = !statusFilter || p.status === statusFilter;

      let matchesTab = true;
      if (activeTab === "pending")
        matchesTab = p.status === "SUBMITTED" || p.status === "UNDER_REVIEW";
      if (activeTab === "my") matchesTab = p.proposer_user_id === user.id;
      if (activeTab === "reports") matchesTab = p.status === "EVENT_COMPLETED";

      return matchesSearch && matchesUniv && matchesStatus && matchesTab;
    }),
  );

  const formatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  });
</script>

<div class="p-6 max-w-7xl mx-auto space-y-6">
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1
        class="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2"
      >
        <span class="text-emerald-500">💰</span> Budget Proposals
      </h1>
      <p class="text-gray-500 dark:text-gray-400 mt-1">
        Manage university event budgets and workflows
      </p>
    </div>
    <div class="flex items-center gap-3">
      <a
        href="/budget-proposals/create"
        class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-all shadow-sm flex items-center gap-2"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-5 h-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fill-rule="evenodd"
            d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
            clip-rule="evenodd"
          />
        </svg>
        New Proposal
      </a>
    </div>
  </div>

  <!-- Tabs & Filters -->
  <div
    class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden"
  >
    <div class="border-b border-gray-100 dark:border-gray-700 px-4 pt-4">
      <div class="flex items-center gap-6 overflow-x-auto no-scrollbar">
        {#each tabs as tab}
          <button
            class="pb-4 text-sm font-medium transition-all border-b-2 relative {activeTab ===
            tab.id
              ? 'text-emerald-600 border-emerald-600'
              : 'text-gray-500 border-transparent hover:text-gray-700 dark:hover:text-gray-300'}"
            onclick={() => (activeTab = tab.id)}
          >
            {tab.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="p-4 flex flex-wrap items-center gap-4">
      <div class="relative flex-1 min-w-[300px]">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
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
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </span>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search by title or proposer..."
          class="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white"
        />
      </div>

      <div class="flex items-center gap-3">
        <select
          bind:value={universityFilter}
          class="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20 dark:text-white"
        >
          <option value="">All Universities</option>
          {#each universities as univ}
            <option value={univ.id}>{univ.name}</option>
          {/each}
        </select>

        <select
          bind:value={statusFilter}
          class="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20 dark:text-white"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="EVENT_COMPLETED">Event Completed</option>
          <option value="REPORT_SUBMITTED">Report Submitted</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>
    </div>
  </div>

  <!-- List -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {#each filteredProposals as proposal (proposal.id)}
      <div
        in:fade={{ duration: 200 }}
        class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm hover:shadow-md transition-all group relative overflow-hidden"
      >
        <!-- Status Stripe -->
        <div
          class="absolute top-0 left-0 w-1.5 h-full {getStatusColor(
            proposal.status,
          ).split(' ')[0]}"
        ></div>

        <div class="space-y-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <span
                class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500"
                >{proposal.event_type}</span
              >
              <h3
                class="font-bold text-gray-900 dark:text-white line-clamp-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors"
              >
                {proposal.title}
              </h3>
            </div>
            <span
              class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase {getStatusColor(
                proposal.status,
              )}"
            >
              {proposal.status.replace("_", " ")}
            </span>
          </div>

          <div
            class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"
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
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            <span class="truncate font-medium">{proposal.university_name}</span>
          </div>

          <div class="space-y-1">
            <div
              class="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 font-medium"
            >
              <div
                class="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-[8px] text-indigo-600 font-bold uppercase"
              >
                {(proposal.proposer_name || proposal.proposer_email).slice(
                  0,
                  2,
                )}
              </div>
              <span class="truncate"
                >Proposed by {proposal.proposer_name ||
                  proposal.proposer_email}</span
              >
            </div>
            {#if proposal.proposer_name}
              <p class="text-[9px] text-gray-400 ml-7 -mt-1">
                {proposal.proposer_email}
              </p>
            {/if}
          </div>

          <div
            class="flex items-center justify-between pt-4 border-t border-gray-50 dark:border-gray-700/50"
          >
            <div class="flex flex-col">
              <span
                class="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold tracking-tight"
                >Est. Budget</span
              >
              <span class="font-bold text-gray-900 dark:text-white"
                >{formatter.format(proposal.estimated_total_budget)}</span
              >
            </div>

            <a
              href="/budget-proposals/{proposal.id}"
              class="px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:border-emerald-500 dark:hover:border-emerald-500 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
            >
              Details
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
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </a>
          </div>

          <div class="flex items-center gap-2 text-[10px] text-gray-400">
            <span>By {proposal.proposer_name || proposal.proposer_email}</span>
            <span>•</span>
            <span>{new Date(proposal.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    {:else}
      <div
        class="col-span-full py-12 text-center bg-gray-50 dark:bg-gray-900/50 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-800"
      >
        <div class="text-4xl mb-4">📭</div>
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">
          No proposals found
        </h3>
        <p class="text-gray-500 dark:text-gray-400">
          Try adjusting your filters or create a new one.
        </p>
      </div>
    {/each}
  </div>
</div>

<style>
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
</style>
