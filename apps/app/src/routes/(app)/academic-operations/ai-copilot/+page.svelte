<script lang="ts">
  import { fade, fly } from "svelte/transition";

  let message = $state("");
  let chat = $state([
    { role: "assistant", content: "Hello! I am your Academic Operations Copilot. I can help you analyze schedules, detect conflicts, or generate operational summaries. What can I do for you today?" }
  ]);
  let isThinking = $state(false);

  async function sendMessage() {
    if (!message.trim()) return;
    
    const userMsg = message;
    chat = [...chat, { role: "user", content: userMsg }];
    message = "";
    isThinking = true;

    // Simulate AI response
    setTimeout(() => {
        isThinking = false;
        let response = "Based on current data, there are 3 potential conflicts in next week's schedule. Room A-101 has an overlap on Monday at 10 AM, and Prof. Verma is scheduled for two different departments simultaneously.";
        if (userMsg.toLowerCase().includes("classes")) {
            response = "You have 12 classes scheduled for today across 3 blocks. 8 are completed, 2 in progress, and 2 pending. No missed classes reported so far.";
        }
        chat = [...chat, { role: "assistant", content: response }];
    }, 1500);
  }

  const suggestions = [
    "Show all missed classes this week",
    "Which faculty are absent tomorrow?",
    "Generate syllabus completion report",
    "Check room availability for 2 PM"
  ];
</script>

<div class="h-[calc(100vh-280px)] flex flex-col max-w-5xl mx-auto bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm overflow-hidden" in:fade>
  <!-- Header -->
  <div class="px-8 py-6 border-b border-gray-50 dark:border-slate-800 flex items-center justify-between bg-gray-50/50 dark:bg-slate-800/50">
    <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-[1.25rem] bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        </div>
        <div>
            <h2 class="text-xl font-black text-gray-900 dark:text-white tracking-tight">AI Operations <span class="text-indigo-600">Copilot</span></h2>
            <div class="flex items-center gap-2 mt-0.5">
                <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Always Learning • Version 2.4</span>
            </div>
        </div>
    </div>
    <button aria-label="Delete chat" class="p-3 text-gray-400 hover:text-rose-500 transition-colors">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
    </button>
  </div>

  <!-- Chat Area -->
  <div class="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth no-scrollbar">
    {#each chat as entry}
        <div class="flex {entry.role === 'user' ? 'justify-end' : 'justify-start'}" in:fly={{ y: 20 }}>
            <div class="max-w-[80%] {entry.role === 'user' ? 'bg-indigo-600 text-white rounded-[2rem] rounded-tr-none shadow-xl shadow-indigo-600/10' : 'bg-gray-50 dark:bg-slate-800 text-gray-800 dark:text-gray-200 rounded-[2rem] rounded-tl-none'} p-6">
                <p class="text-sm font-medium leading-relaxed">{entry.content}</p>
            </div>
        </div>
    {/each}
    {#if isThinking}
        <div class="flex justify-start" in:fade>
            <div class="bg-gray-50 dark:bg-slate-800 p-6 rounded-[2rem] rounded-tl-none flex items-center gap-2">
                <div class="w-2 h-2 bg-indigo-600 rounded-full animate-bounce"></div>
                <div class="w-2 h-2 bg-indigo-600 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                <div class="w-2 h-2 bg-indigo-600 rounded-full animate-bounce [animation-delay:0.4s]"></div>
            </div>
        </div>
    {/if}
  </div>

  <!-- Input Area -->
  <div class="p-8 border-t border-gray-50 dark:border-slate-800 bg-gray-50/30 dark:bg-slate-800/20">
    <div class="flex flex-wrap gap-2 mb-6">
        {#each suggestions as suggest}
            <button 
                onclick={() => { message = suggest; sendMessage(); }}
                class="px-5 py-2.5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:border-indigo-500 hover:text-indigo-600 transition-all rounded-2xl shadow-sm"
            >
                {suggest}
            </button>
        {/each}
    </div>

    <div class="relative flex items-center">
        <input 
            type="text" 
            bind:value={message}
            onkeydown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Ask Copilot anything about campus operations..."
            class="w-full pl-8 pr-16 py-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700 rounded-3xl text-sm font-medium focus:ring-4 ring-indigo-500/10 outline-none transition-all"
        />
        <button 
            onclick={sendMessage}
            aria-label="Send message"
            class="absolute right-3 p-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all active:scale-90"
        >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
        </button>
    </div>
  </div>
</div>

<style>
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
</style>
