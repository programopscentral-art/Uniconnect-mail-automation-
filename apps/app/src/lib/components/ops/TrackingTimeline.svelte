<script lang="ts">
    import { onMount } from 'svelte';
    import { CheckCircle, Circle, Clock, Truck, Package, Star, AlertTriangle, User, Shield, Loader2 } from 'lucide-svelte';

    let {
        proposalId = '',
        proposalStatus = ''
    }: {
        proposalId?: string;
        proposalStatus?: string;
    } = $props();

    let timeline = $state<any[]>([]);
    let loading = $state(true);
    let error = $state('');

    const statusIcons: Record<string, any> = {
        submitted: User,
        under_review: Clock,
        cm_approved: Shield,
        approved_l1: Shield,
        admin_approved: Shield,
        approved: CheckCircle,
        vendor_assigned: Package,
        vendor_confirmed: Package,
        sample_ready: Star,
        in_production: Clock,
        in_transit: Truck,
        delivered: Package,
        completed: CheckCircle,
        rejected: AlertTriangle,
        changes_requested: AlertTriangle
    };

    const statusColors: Record<string, { bg: string; ring: string; text: string }> = {
        submitted: { bg: 'bg-sky-100 dark:bg-sky-950/40', ring: 'ring-sky-500', text: 'text-sky-700 dark:text-sky-300' },
        under_review: { bg: 'bg-amber-100 dark:bg-amber-950/40', ring: 'ring-amber-500', text: 'text-amber-700 dark:text-amber-300' },
        cm_approved: { bg: 'bg-emerald-100 dark:bg-emerald-950/40', ring: 'ring-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
        approved_l1: { bg: 'bg-emerald-100 dark:bg-emerald-950/40', ring: 'ring-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
        admin_approved: { bg: 'bg-emerald-100 dark:bg-emerald-950/40', ring: 'ring-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
        approved: { bg: 'bg-emerald-100 dark:bg-emerald-950/40', ring: 'ring-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
        vendor_assigned: { bg: 'bg-violet-100 dark:bg-violet-950/40', ring: 'ring-violet-500', text: 'text-violet-700 dark:text-violet-300' },
        vendor_confirmed: { bg: 'bg-violet-100 dark:bg-violet-950/40', ring: 'ring-violet-500', text: 'text-violet-700 dark:text-violet-300' },
        sample_ready: { bg: 'bg-fuchsia-100 dark:bg-fuchsia-950/40', ring: 'ring-fuchsia-500', text: 'text-fuchsia-700 dark:text-fuchsia-300' },
        in_production: { bg: 'bg-orange-100 dark:bg-orange-950/40', ring: 'ring-orange-500', text: 'text-orange-700 dark:text-orange-300' },
        in_transit: { bg: 'bg-sky-100 dark:bg-sky-950/40', ring: 'ring-sky-500', text: 'text-sky-700 dark:text-sky-300' },
        delivered: { bg: 'bg-emerald-100 dark:bg-emerald-950/40', ring: 'ring-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
        completed: { bg: 'bg-emerald-100 dark:bg-emerald-950/40', ring: 'ring-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
        rejected: { bg: 'bg-rose-100 dark:bg-rose-950/40', ring: 'ring-rose-500', text: 'text-rose-700 dark:text-rose-300' },
        changes_requested: { bg: 'bg-amber-100 dark:bg-amber-950/40', ring: 'ring-amber-500', text: 'text-amber-700 dark:text-amber-300' }
    };

    const defaultColor = { bg: 'bg-zinc-100 dark:bg-zinc-800', ring: 'ring-zinc-400', text: 'text-zinc-600 dark:text-zinc-400' };

    // Possible future steps to show as pending
    const futureSteps: Record<string, Array<{ status: string; title: string }>> = {
        submitted: [
            { status: 'cm_approved', title: 'CM Approval' },
            { status: 'approved', title: 'Admin Approval' },
            { status: 'vendor_assigned', title: 'Vendor Assignment' },
            { status: 'delivered', title: 'Delivery' }
        ],
        approved_l1: [
            { status: 'approved', title: 'Admin Approval' },
            { status: 'vendor_assigned', title: 'Vendor Assignment' },
            { status: 'delivered', title: 'Delivery' }
        ],
        approved: [
            { status: 'vendor_assigned', title: 'Vendor Assignment' },
            { status: 'in_production', title: 'Production' },
            { status: 'delivered', title: 'Delivery' }
        ],
        vendor_assigned: [
            { status: 'vendor_confirmed', title: 'Vendor Confirmation' },
            { status: 'in_production', title: 'Production' },
            { status: 'delivered', title: 'Delivery' }
        ],
        vendor_confirmed: [
            { status: 'in_production', title: 'Production' },
            { status: 'delivered', title: 'Delivery' }
        ],
        in_production: [
            { status: 'in_transit', title: 'In Transit' },
            { status: 'delivered', title: 'Delivery' }
        ],
        in_transit: [
            { status: 'delivered', title: 'Delivery' }
        ]
    };

    async function loadTimeline() {
        if (!proposalId) return;
        loading = true;
        try {
            const res = await fetch(`/api/budget-proposals/${proposalId}/tracking`);
            if (res.ok) {
                const j = await res.json();
                timeline = j.timeline || [];
            }
        } catch (e: any) {
            error = e?.message || 'Failed to load timeline';
        } finally {
            loading = false;
        }
    }

    onMount(loadTimeline);

    const lastStatus = $derived(timeline.length > 0 ? timeline[timeline.length - 1]?.status : proposalStatus?.toLowerCase() || '');
    const pending = $derived.by(() => {
        const key = lastStatus;
        const existing = new Set(timeline.map((t: any) => t.status));
        return (futureSteps[key] || []).filter(s => !existing.has(s.status));
    });
</script>

<section class="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
    <div class="flex items-center justify-between mb-6">
        <div>
            <h3 class="text-sm font-black uppercase tracking-widest text-gray-900 dark:text-gray-100">Order Tracking</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Live status updates from submission to delivery</p>
        </div>
        <button
            onclick={loadTimeline}
            disabled={loading}
            class="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
            {#if loading}<Loader2 size={14} class="animate-spin" />{:else}Refresh{/if}
        </button>
    </div>

    {#if loading && timeline.length === 0}
        <div class="flex flex-col gap-4">
            {#each Array(4) as _}
                <div class="flex gap-4">
                    <div class="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 animate-pulse shrink-0"></div>
                    <div class="flex-1 space-y-2">
                        <div class="h-3 w-1/3 rounded bg-gray-100 dark:bg-gray-700 animate-pulse"></div>
                        <div class="h-2 w-2/3 rounded bg-gray-100 dark:bg-gray-700 animate-pulse"></div>
                    </div>
                </div>
            {/each}
        </div>
    {:else if timeline.length === 0 && !loading}
        <p class="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No tracking data yet.</p>
    {:else}
        <div class="relative">
            <!-- Completed steps -->
            {#each timeline as entry, i}
                {@const colors = statusColors[entry.status] || defaultColor}
                {@const IconComp = statusIcons[entry.status] || Circle}
                {@const isLast = i === timeline.length - 1 && pending.length === 0}
                {@const date = entry.created_at ? new Date(entry.created_at) : null}
                {@const meta = entry.metadata ? (typeof entry.metadata === 'string' ? JSON.parse(entry.metadata) : entry.metadata) : null}
                <div class="flex gap-4 pb-6 last:pb-0 relative">
                    <!-- Vertical line -->
                    {#if !isLast || pending.length > 0}
                        <div class="absolute left-5 top-10 bottom-0 w-0.5 bg-gradient-to-b {i < timeline.length - 1 ? 'from-emerald-300 to-emerald-300 dark:from-emerald-700 dark:to-emerald-700' : 'from-emerald-300 to-gray-200 dark:from-emerald-700 dark:to-gray-700'}"></div>
                    {/if}

                    <!-- Icon -->
                    <div class="relative z-10 w-10 h-10 rounded-full {colors.bg} ring-2 {colors.ring} flex items-center justify-center shrink-0 shadow-sm">
                        <svelte:component this={IconComp} size={16} class={colors.text} />
                    </div>

                    <!-- Content -->
                    <div class="flex-1 min-w-0 pt-1">
                        <div class="flex items-baseline justify-between gap-2 flex-wrap">
                            <h4 class="text-sm font-bold text-gray-900 dark:text-gray-100">{entry.title}</h4>
                            {#if date}
                                <span class="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
                                    {date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            {/if}
                        </div>
                        {#if entry.description}
                            <p class="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">{entry.description}</p>
                        {/if}
                        {#if entry.updated_by_name}
                            <p class="text-[10px] text-gray-400 mt-0.5">by {entry.updated_by_name}{entry.source === 'facilities' ? ' · via Facilities' : ''}</p>
                        {/if}
                        <!-- Vendor metadata -->
                        {#if meta?.vendor_name}
                            <div class="mt-2 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-xs">
                                <div class="font-semibold text-gray-900 dark:text-gray-100">{meta.vendor_name}</div>
                                {#if meta.quoted_price || meta.confirmed_price}
                                    <div class="text-gray-600 dark:text-gray-400 mt-0.5">Quote: ₹{(meta.confirmed_price || meta.quoted_price || 0).toLocaleString('en-IN')}</div>
                                {/if}
                                {#if meta.delivery_date}
                                    <div class="text-gray-600 dark:text-gray-400">Delivery: {new Date(meta.delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                                {/if}
                            </div>
                        {/if}
                        <!-- Attachments (sample photos etc.) -->
                        {#if entry.attachment_urls && entry.attachment_urls.length > 0}
                            <div class="flex gap-2 mt-2 flex-wrap">
                                {#each entry.attachment_urls as url}
                                    <a href={url} target="_blank" rel="noreferrer" class="text-xs text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-1">
                                        📎 View attachment
                                    </a>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            {/each}

            <!-- Pending future steps -->
            {#each pending as step, i}
                <div class="flex gap-4 pb-6 last:pb-0 relative">
                    {#if i < pending.length - 1}
                        <div class="absolute left-5 top-10 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700 border-dashed"></div>
                    {/if}
                    <div class="relative z-10 w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 ring-2 ring-gray-300 dark:ring-gray-600 flex items-center justify-center shrink-0">
                        <Circle size={16} class="text-gray-400 dark:text-gray-500" />
                    </div>
                    <div class="flex-1 min-w-0 pt-2">
                        <h4 class="text-sm font-semibold text-gray-400 dark:text-gray-500">{step.title}</h4>
                        <p class="text-[10px] text-gray-300 dark:text-gray-600">Pending</p>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</section>
