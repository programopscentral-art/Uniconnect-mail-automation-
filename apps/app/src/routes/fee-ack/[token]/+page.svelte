<script lang="ts">
    let { data } = $props();
    let r = $derived(data.request);
    let acknowledging = $state(false);
    let acknowledged = $state(!!r.acknowledged_at);
    let error = $state('');

    const fmt = (n: any) => '₹' + (Number(n) || 0).toLocaleString('en-IN');

    async function acknowledge() {
        acknowledging = true;
        error = '';
        try {
            const res = await fetch(`/api/fees/doc-ack/${data.token}`, { method: 'POST' });
            if (!res.ok) throw new Error(`Failed (${res.status})`);
            acknowledged = true;
        } catch (e: any) {
            error = e.message || 'Failed to acknowledge';
        } finally {
            acknowledging = false;
        }
    }
</script>

<svelte:head>
    <title>Fee Document Request · UniConnect</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200">
        <!-- Header -->
        <div class="bg-gradient-to-br from-indigo-600 to-purple-600 p-8 text-white">
            <div class="text-[11px] font-bold uppercase tracking-widest opacity-90">UniConnect · Fee Documents</div>
            <h1 class="text-2xl font-extrabold mt-2">Action Required</h1>
            <p class="text-sm opacity-90 mt-1">Submit your billing receipts and acknowledge this message</p>
        </div>

        <div class="p-8 space-y-6">
            <!-- Student info -->
            <div>
                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Student</div>
                <div class="text-lg font-bold text-slate-900 mt-1">{r.student_name || '—'}</div>
                <div class="text-xs text-slate-500">{r.university_name} · {r.period_name}</div>
            </div>

            <!-- Fee status -->
            <div class="grid grid-cols-3 gap-3">
                <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div class="text-[9px] font-bold uppercase tracking-wider text-amber-700">Payable</div>
                    <div class="text-lg font-extrabold text-amber-900 mt-1">{fmt(r.payable)}</div>
                </div>
                <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div class="text-[9px] font-bold uppercase tracking-wider text-emerald-700">Paid</div>
                    <div class="text-lg font-extrabold text-emerald-900 mt-1">{fmt(r.paid)}</div>
                </div>
                <div class="bg-rose-50 border border-rose-200 rounded-xl p-4">
                    <div class="text-[9px] font-bold uppercase tracking-wider text-rose-700">Pending</div>
                    <div class="text-lg font-extrabold text-rose-900 mt-1">{fmt(r.pending)}</div>
                </div>
            </div>

            <!-- Message -->
            <div class="bg-slate-50 border-l-4 border-indigo-500 rounded-r-xl p-4">
                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Message from your university</div>
                <div class="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{r.message}</div>
            </div>

            <!-- Upload + Acknowledge buttons -->
            {#if r.upload_form_url}
                <a href={r.upload_form_url} target="_blank" rel="noopener" class="block w-full text-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl text-sm transition-colors">
                    📎 Upload Your Documents
                </a>
            {/if}

            {#if acknowledged}
                <div class="bg-emerald-50 border border-emerald-300 rounded-xl p-5 text-center">
                    <div class="text-3xl mb-2">✅</div>
                    <div class="font-bold text-emerald-900">Acknowledgment Recorded</div>
                    <div class="text-xs text-emerald-700 mt-1">Thank you. Your university has been notified.</div>
                </div>
            {:else}
                <button onclick={acknowledge} disabled={acknowledging}
                    class="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-sm transition-colors">
                    {acknowledging ? 'Recording...' : '✓ I Acknowledge This Message'}
                </button>
                {#if error}<div class="text-rose-600 text-xs text-center">{error}</div>{/if}
                <div class="text-[10px] text-slate-500 text-center">
                    Clicking the button confirms you've received this notice and will follow up.
                </div>
            {/if}
        </div>

        <div class="bg-slate-50 border-t border-slate-200 p-4 text-center text-[10px] text-slate-500">
            UniConnect · Sent {new Date(r.sent_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
    </div>
</div>
