<script lang="ts">
  import { goto } from '$app/navigation';
  import { TemplateRenderer } from '@uniconnect/shared/src/template';
  
  // @ts-ignore
  let { data }: { data: any } = $props();

  let name = $state(data.template.name);
  let subject = $state(data.template.subject);
  let html = $state(data.template.html);
  let config = $state({
    showTable: data.template.config?.showTable ?? false,
    tableRows: data.template.config?.tableRows ?? [],
    showActionButton: data.template.config?.showActionButton ?? false,
    actionButtonText: data.template.config?.actionButtonText ?? 'Click Here',
    actionButtonUrl: data.template.config?.actionButtonUrl ?? ''
  });
  let isSaving = $state(false);
  let isSendingTest = $state(false);
  let testEmail = $state('');
  let textareaRef: HTMLTextAreaElement | undefined = $state();

  const coreVars = ['STUDENT_NAME', 'TERM_FEE', 'ACTION_BUTTON', 'COUPON_CODE', 'TABLE'];
  const allFields = $derived([...new Set([...coreVars, ...(data.metadataKeys || [])])]);

  // Svelte 5 reactivity for preview
  let previewHtml = $derived.by(() => {
    try {
      const renderConfig = {
          ...config,
          payButton: {
              text: config.actionButtonText,
              url: config.actionButtonUrl
          }
      };

      const baseVars: Record<string, any> = {
        STUDENT_NAME: data.sampleStudent?.name || data.sampleStudent?.full_name || '',
        ...(data.sampleStudent?.metadata || {})
      };

      // Ensure every field has a sample value for the preview
      allFields.forEach(field => {
          if (baseVars[field] === undefined) {
              baseVars[field] = `[${field}]`;
          }
      });

      return TemplateRenderer.render(html, baseVars, { config: renderConfig });
    } catch (e) {
      console.error('Preview render error:', e);
      return `<div class="p-4 text-red-500 bg-red-50 border border-red-200 rounded">
                <strong>Preview Error:</strong> ${e instanceof Error ? e.message : 'Unknown error during rendering'}
              </div>`;
    }
  });

  function insertVar(v: string) {
      const placeholder = `{{${v}}}`;
      if (!textareaRef) {
          html += (html ? ' ' : '') + placeholder;
          return;
      }

      const start = textareaRef.selectionStart;
      const end = textareaRef.selectionEnd;
      const text = textareaRef.value;
      const before = text.substring(0, start);
      const after = text.substring(end);
      
      html = before + placeholder + after;

      // Restore focus and move cursor
      setTimeout(() => {
          if (textareaRef) {
              textareaRef.focus();
              const newPos = start + placeholder.length;
              textareaRef.setSelectionRange(newPos, newPos);
          }
      }, 0);
  }

  function addTableRow() {
    config.tableRows = [...config.tableRows, { label: '', value: '' }];
  }

  function removeTableRow(index: number) {
    config.tableRows = config.tableRows.filter((_: any, i: number) => i !== index);
  }

  async function save() {
    isSaving = true;
    try {
      const res = await fetch(`/api/templates/${data.template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, subject, html, config })
      });
      if (res.ok) {
        goto('/templates');
      } else {
        const err = await res.json();
        alert('Failed to save: ' + (err.message || 'Unknown error'));
      }
    } catch (e: any) {
      alert('Error saving: ' + e.message);
    } finally {
      isSaving = false;
    }
  }

  async function sendTest() {
    if (!testEmail) return alert('Please enter a test email');
    isSendingTest = true;
    try {
      const res = await fetch('/api/campaigns/test-email-simple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testEmail,
          subject,
          html,
          universityId: data.template.university_id,
          config
        })
      });
      if (res.ok) {
        alert('Test email sent successfully!');
      } else {
        const err = await res.json();
        alert('Failed to send test: ' + (err.message || 'Check server logs'));
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      isSendingTest = false;
    }
  }
</script>

<div class="max-w-[1600px] mx-auto px-4 py-8 space-y-8">
  <div class="flex justify-between items-center">
    <div>
      <h1 class="text-3xl font-extrabold text-gray-900 tracking-tight">Edit Template</h1>
      <p class="mt-1 text-sm text-gray-500">Fine-tune your message and see changes instantly.</p>
    </div>
    <div class="flex items-center space-x-4">
      <button 
        onclick={() => goto('/templates')}
        class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        Cancel
      </button>
      <button 
        onclick={save} 
        disabled={isSaving}
        class="px-6 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 shadow-md hover:shadow-lg transition-all"
      >
        {isSaving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <!-- Editor Side -->
    <div class="space-y-6">
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div>
          <label for="template-name" class="block text-sm font-semibold text-gray-700 mb-1">Template Name</label>
          <input 
            id="template-name"
            type="text" 
            bind:value={name} 
            placeholder="e.g., Late Fee Reminder"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
          >
        </div>
        <div>
          <label for="subject" class="block text-sm font-semibold text-gray-700 mb-1">Email Subject</label>
          <input 
            id="subject"
            type="text" 
            bind:value={subject} 
            placeholder="Subject line with {'{{STUDENT_NAME}}'}"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
          >
        </div>
      </div>

      <!-- Advanced Editor Options -->
      <div class="bg-indigo-50 rounded-xl border border-indigo-100 p-6 space-y-6">
        <h3 class="text-lg font-bold text-indigo-900 flex items-center">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
          Interactive Components
        </h3>

        <!-- Table Builder -->
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <div class="flex items-center space-x-2">
              <span class="text-sm font-semibold text-gray-800">📊 Configure Summary Table</span>
              <button 
                onclick={() => insertVar('TABLE')}
                class="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 rounded hover:bg-indigo-100 transition-colors"
                title="Insert TABLE into content"
              >
                + Insert Table
              </button>
            </div>
            <button onclick={addTableRow} class="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 flex items-center shadow-sm">
                <svg class="h-3 w-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                Add Row
            </button>
          </div>
          
          <div class="bg-white rounded-lg border border-indigo-200 p-4 space-y-3 shadow-inner">
            {#each config.tableRows as row, i}
              <div class="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                <input type="text" bind:value={row.label} placeholder="Label" class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md">
                <input type="text" bind:value={row.value} placeholder="Value" class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md">
                <button onclick={() => removeTableRow(i)} class="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors" aria-label="Remove Row">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
              </div>
            {/each}
          </div>
        </div>

        <!-- Action Button -->
        <div class="space-y-3">
          <div class="flex items-center space-x-2">
            <span class="text-sm font-semibold text-gray-800">🖱️ Configure Action Button</span>
            <button 
              onclick={() => insertVar('ACTION_BUTTON')}
              class="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 rounded hover:bg-indigo-100 transition-colors"
              title="Insert ACTION_BUTTON into content"
            >
              + Insert Button
            </button>
          </div>
          <div class="bg-white rounded-lg border border-indigo-200 p-4 space-y-3 shadow-inner">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="btn-text" class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Button Text</label>
                <input id="btn-text" type="text" bind:value={config.actionButtonText} placeholder="Pay Now" class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md">
              </div>
              <div>
                <label for="btn-url" class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Button URL</label>
                <input id="btn-url" type="text" bind:value={config.actionButtonUrl} placeholder="{'{{PAY_LINK}}'}" class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md">
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Main HTML Editor -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div class="flex justify-between items-center mb-1">
          <label for="html-content" class="text-sm font-semibold text-gray-700">Email Content (HTML)</label>
          <div class="flex flex-wrap gap-1">
            {#each allFields as key}
              <button 
                onclick={() => insertVar(key)}
                class="px-2 py-1 text-[10px] font-bold bg-gray-50 text-gray-600 border border-gray-200 rounded-md hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all"
              >
                +{key}
              </button>
            {/each}
          </div>
        </div>
        <textarea 
          id="html-content"
          bind:this={textareaRef}
          bind:value={html} 
          rows="16" 
          placeholder="Write your email body here... use {'{{VARIABLE_NAME}}'} for dynamic data."
          class="w-full px-4 py-3 border border-gray-300 rounded-lg font-mono text-base focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
        ></textarea>
      </div>

      <!-- Test Send -->
      <div class="bg-amber-50 rounded-xl border border-amber-100 p-6 space-y-4">
        <h3 class="text-lg font-bold text-amber-900 flex items-center">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
          Test This Template
        </h3>
        <div class="flex space-x-2">
          <input 
            type="email" 
            bind:value={testEmail} 
            placeholder="your-email@example.com"
            class="flex-1 px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
          >
          <button 
            onclick={sendTest}
            disabled={isSendingTest}
            class="px-4 py-2 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {isSendingTest ? 'Sending...' : 'Send Test Mail'}
          </button>
        </div>
      </div>
    </div>

    <!-- Preview Side -->
    <div class="space-y-4 sticky top-8">
      <div class="flex items-center justify-between text-gray-500 px-2">
        <span class="text-sm font-bold uppercase tracking-widest">Live Preview</span>
        <span class="text-xs flex items-center">
          <span class="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
          Auto-updating
        </span>
      </div>
      <div class="bg-gray-100 rounded-2xl p-4 border-4 border-gray-200 shadow-2xl min-h-[800px] max-h-[calc(100vh-120px)] overflow-auto">
        {#if previewHtml}
          {@html previewHtml}
        {:else}
          <div class="h-full flex items-center justify-center text-gray-400 italic">
            Start typing to see the preview...
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
