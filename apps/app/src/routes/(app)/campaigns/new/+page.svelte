<script lang="ts">
  import { goto } from '$app/navigation';
  // @ts-ignore
  let { data } = $props();

  let activeStep = $state(1);
  let name = $state('');
  let templateId = $state('');
  let mailboxId = $state('');
  let recipientEmailKey = $state('');
  let includeAck = $state(true); // Default Yes
  let isCreating = $state(false);

  async function createDraft() {
      if (!name || !templateId || !mailboxId) return alert('All fields required');
      isCreating = true;
      try {
          const res = await fetch('/api/campaigns', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  universityId: data.universityId,
                  name,
                  templateId,
                  mailboxId,
                  recipientEmailKey: recipientEmailKey || undefined,
                  includeAck
              })
          });
          
          if (res.ok) {
              const result = await res.json();
              goto(`/campaigns/${result.id}`);
          } else {
              alert('Failed to create draft');
          }
      } finally {
          isCreating = false;
      }
  }
</script>

<div class="max-w-3xl mx-auto">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">Create Campaign Wizard</h1>
    
    <div class="bg-white shadow sm:rounded-lg p-6">
        <!-- Steps -->
        <ol class="flex items-center w-full mb-8 space-x-4">
             <li class="flex items-center text-blue-600 dark:text-blue-500 space-x-2.5">
                <span class="flex items-center justify-center w-8 h-8 border border-blue-600 rounded-full shrink-0">1</span>
                <span>Details</span>
            </li>
             <li class="flex items-center text-gray-500 dark:text-gray-400 space-x-2.5">
                <span class="flex items-center justify-center w-8 h-8 border border-gray-500 rounded-full shrink-0">2</span>
                <span>Review</span>
            </li>
        </ol>

        <div class="space-y-6">
            <div>
                <label for="campaign-name" class="block text-sm font-medium text-gray-700">Campaign Name</label>
                <input id="campaign-name" type="text" bind:value={name} class="mt-1 block w-full border-gray-300 rounded-md shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500" placeholder="e.g. November Fees Reminder">
            </div>

            <div>
                <label for="template-select" class="block text-sm font-medium text-gray-700">Select Template</label>
                <select id="template-select" bind:value={templateId} class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                    <option value="">Choose a template...</option>
                    {#each data.templates as t}
                        <option value={t.id}>{t.name} ({t.subject})</option>
                    {/each}
                </select>
                {#if data.templates.length === 0}
                    <p class="text-sm text-red-500 mt-1">No templates found. Create one first.</p>
                {/if}
            </div>

            <div>
                <label for="mailbox-select" class="block text-sm font-medium text-gray-700">Select Sender Mailbox</label>
                <select id="mailbox-select" bind:value={mailboxId} class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                    <option value="">Choose a mailbox...</option>
                    {#each data.mailboxes as m}
                        <option value={m.id}>{m.email}</option>
                    {/each}
                </select>
                {#if data.mailboxes.length === 0}
                    <p class="text-sm text-red-500 mt-1">No mailboxes connected. Connect one first.</p>
                {/if}
            </div>

            <div class="border-t border-gray-200 pt-6">
                <div class="flex items-center justify-between mb-2">
                    <label for="recipient-select" class="block text-sm font-medium text-gray-700">Recipient Email Column</label>
                    {#if data.emailMetadataKeys.length > 0}
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                           <svg class="mr-1 h-2 w-2 text-green-400" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" /></svg>
                           {data.emailMetadataKeys.length} Email Fields Identified
                        </span>
                    {/if}
                </div>
                <p class="text-xs text-gray-500 mb-2">Choose which column contains the email addresses. The system automatically scanned your sheet for "Mail" or "Email" tags.</p>
                <select id="recipient-select" bind:value={recipientEmailKey} class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                    <option value="">Default Student Email (Primary)</option>
                    {#each data.emailMetadataKeys as key}
                        <option value={key}>{key} (Auto-Identified)</option>
                    {/each}
                </select>
                {#if data.emailMetadataKeys.length === 0}
                    <div class="mt-2 text-xs text-yellow-600 bg-yellow-50 p-2 rounded border border-yellow-200">
                        ⚠️ No secondary email columns (like Father/Mother Email) found. Please ensure you've uploaded the correct sheet in the <a href="/students" class="underline font-medium">Students</a> section.
                    </div>
                {/if}
            </div>
            
            <div class="flex items-center justify-between p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                <div>
                    <label for="include-ack" class="block text-sm font-bold text-gray-900">Include "I Acknowledge & Agree" Button</label>
                    <p class="text-xs text-blue-700/70 mt-0.5">Appends a confirmation button at the bottom of the email.</p>
                </div>
                <button 
                    type="button" 
                    id="include-ack"
                    class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none {includeAck ? 'bg-blue-600' : 'bg-gray-200'}"
                    onclick={() => includeAck = !includeAck}
                >
                    <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {includeAck ? 'translate-x-5' : 'translate-x-0'}"></span>
                </button>
            </div>

            <div class="bg-blue-50 p-4 rounded-md border border-blue-100">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <svg class="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    </div>
                    <div class="ml-3">
                        <h3 class="text-sm font-medium text-blue-800">NIAT Premium Branding</h3>
                        <div class="mt-2 text-sm text-blue-700 italic">
                            <p>This campaign will automatically include the <strong>NIAT Header & Logo</strong> and format any <strong>Fee Summary Tables</strong> as mandate for your university.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="mt-8 flex justify-end">
            <a href="/campaigns" class="mr-3 inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none">
                Cancel
            </a>
            <button 
                onclick={createDraft} 
                disabled={isCreating}
                class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none disabled:opacity-50">
                {isCreating ? 'Creating Draft...' : 'Create Draft'}
            </button>
        </div>
    </div>
</div>
