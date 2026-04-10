// ═══════════════════════════════════════════════════════════════════════
// UniConnect Meet Tracker — Content Script
// Runs on meet.google.com/* and tracks participants, captions, timing
// ═══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ─── State ───────────────────────────────────────────────────────────
  const state = {
    meetingId: null,
    meetCode: null,
    meetTitle: '',
    isTracking: false,
    joinedAt: null,
    participants: new Map(), // name → { name, joinTime, leaveTime, durations[], isActive }
    captions: [],            // { speaker, text, timestamp }
    captionBuffer: '',
    captionSpeaker: '',
    lastCaptionTime: 0,
    pollInterval: null,
    captionObserver: null,
    participantObserver: null,
    statusBadge: null
  };

  // ─── Config ──────────────────────────────────────────────────────────
  const CONFIG = {
    PARTICIPANT_POLL_MS: 3000,      // Check participants every 3s
    CAPTION_FLUSH_MS: 2000,         // Flush caption buffer after 2s silence
    API_ENDPOINT: null,             // Set from storage
    AUTH_TOKEN: null                // Set from storage
  };

  // ─── UI Garbage Filter ───────────────────────────────────────────────
  // Strings that appear in Meet's UI buttons/tooltips that are NOT names
  // ── Name validation ──────────────────────────────────────────────────
  // A real human name: Title Case words (each word starts with a capital).
  // UI labels like "Side panel", "Getting items", "Chat with everyone"
  // always have at least one lowercase-starting word → fail this check.
  function isValidParticipantName(str) {
    if (!str || typeof str !== 'string') return false;
    const trimmed = str.trim();

    // 2–50 chars, no newlines/tabs/underscores
    if (trimmed.length < 2 || trimmed.length > 50) return false;
    if (/[\n\r\t_]/.test(trimmed)) return false;

    // Must contain at least one letter
    if (!/[a-zA-Z\u0900-\u097F\u0600-\u06FF]/.test(trimmed)) return false;

    // No sentence-ending punctuation (filters "Rate the meeting 1 star out of 5.")
    if (/[.!?]/.test(trimmed)) return false;

    // No digits (filters "1 star", timestamps, etc.)
    if (/\d/.test(trimmed)) return false;

    // ── Title Case check ──────────────────────────────────────────────
    // Every word must start with an uppercase letter (or be a single
    // uppercase letter like "A" in "Karthikeya A").
    // This eliminates UI phrases where helper words are lowercase.
    const words = trimmed.split(/\s+/);
    if (words.length > 5) return false; // Names have at most 5 parts
    const allTitleCase = words.every(w =>
      /^[A-Z\u0900-\u097F\u0600-\u06FF]/.test(w)
    );
    if (!allTitleCase) return false;

    return true;
  }

  function cleanName(name) {
    if (!name) return '';
    return name
      .replace(/\s*\(you\)\s*/gi, '')
      .replace(/\s*\(host\)\s*/gi, '')
      .replace(/\s*\(presenting\)\s*/gi, '')
      .replace(/\s*\(co-host\)\s*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ─── Initialize ──────────────────────────────────────────────────────
  async function init() {
    console.log('[UniConnect Meet Tracker] Initializing...');

    // Load config from storage
    const stored = await chrome.storage.sync.get(['apiEndpoint', 'authToken', 'enabled']);
    CONFIG.API_ENDPOINT = stored.apiEndpoint || '';
    CONFIG.AUTH_TOKEN = stored.authToken || '';

    if (stored.enabled === false) {
      console.log('[UniConnect Meet Tracker] Disabled by user.');
      return;
    }

    // Extract meet code from URL
    const urlMatch = window.location.pathname.match(/\/([a-z]{3}-[a-z]{4}-[a-z]{3})/);
    if (!urlMatch) {
      console.log('[UniConnect Meet Tracker] Not a meeting URL, skipping.');
      return;
    }

    state.meetCode = urlMatch[1];
    console.log(`[UniConnect Meet Tracker] Meet code: ${state.meetCode}`);

    // Wait for meeting UI to load
    waitForMeetingStart();
  }

  // ─── Wait for Meeting to Actually Start ──────────────────────────────
  function waitForMeetingStart() {
    const checkInterval = setInterval(() => {
      const endCallBtn = document.querySelector('[data-tooltip="Leave call"]') ||
                         document.querySelector('[aria-label="Leave call"]') ||
                         document.querySelector('button[data-call-ended]');

      const isInMeeting = !!endCallBtn || document.querySelector('[data-participant-id]');

      if (isInMeeting) {
        clearInterval(checkInterval);
        startTracking();
      }
    }, 2000);

    // Timeout after 5 minutes (user might be stuck in lobby)
    setTimeout(() => clearInterval(checkInterval), 5 * 60 * 1000);
  }

  // ─── Start Tracking ──────────────────────────────────────────────────
  function startTracking() {
    if (state.isTracking) return;
    state.isTracking = true;
    state.joinedAt = new Date();

    console.log('[UniConnect Meet Tracker] Meeting joined! Starting tracking...');

    state.meetTitle = extractMeetingTitle();

    createStatusBadge();

    // Open participants panel so [data-participant-id] elements exist in DOM
    setTimeout(openParticipantsPanel, 2000);

    state.pollInterval = setInterval(pollParticipants, CONFIG.PARTICIPANT_POLL_MS);
    // First poll after panel has had time to open
    setTimeout(pollParticipants, 3000);

    startJoinLeaveObserver(); // Watch "X joined" / "X left" toasts
    startCaptionObserver();
    detectMeetingEnd();

    chrome.runtime.sendMessage({
      type: 'MEETING_STARTED',
      data: {
        meetCode: state.meetCode,
        title: state.meetTitle,
        joinedAt: state.joinedAt.toISOString()
      }
    });

    updateBadge('Tracking');

    // ── Debug helper: run in Meet DevTools console to inspect ─────────
    // window._ucDebug = () => ({
    //   selfName: detectSelfName(),
    //   alerts: [...document.querySelectorAll('[role="alert"],[aria-live]')].map(e => e.textContent.trim()),
    //   selfNameAttr: document.querySelector('[data-self-name]')?.getAttribute('data-self-name'),
    //   ariaYou: document.querySelector('[aria-label*="you" i]')?.getAttribute('aria-label'),
    // });
    // console.log('[UniConnect] Run window._ucDebug() to inspect DOM state');
  }

  // ─── Extract Meeting Title ───────────────────────────────────────────
  function extractMeetingTitle() {
    // Prefer document title — cleanest and most reliable source
    const docTitle = document.title.replace(/\s*[-–]\s*Google Meet\s*$/i, '').trim();
    if (docTitle && docTitle.length > 0 && docTitle.length < 120) {
      return docTitle;
    }
    return `Meeting ${state.meetCode}`;
  }

  // ─── Open Participants Panel ──────────────────────────────────────────
  function openParticipantsPanel() {
    // Strategy 1: CSS attribute selector (fastest — handles "People", "People (3)", etc.)
    const directBtn =
      document.querySelector('button[aria-label*="People" i]:not([aria-label*="chat" i]):not([aria-label*="message" i])') ||
      document.querySelector('button[aria-label*="participant" i]:not([aria-label*="chat" i])') ||
      document.querySelector('[data-tooltip*="People" i]:not([data-tooltip*="chat" i])') ||
      document.querySelector('[data-tooltip*="participant" i]') ||
      document.querySelector('[title*="People" i]:not([title*="chat" i])');

    if (directBtn) {
      directBtn.click();
      console.log('[UniConnect Meet Tracker] Opened participants panel (css):', directBtn.getAttribute('aria-label') || directBtn.getAttribute('data-tooltip'));
      setTimeout(pollParticipants, 1500); // re-poll immediately after panel opens
      return;
    }

    // Strategy 2: Word-boundary scan across all buttons
    const allBtns = [...document.querySelectorAll('button[aria-label], [role="button"][aria-label]')];
    const btn = allBtns.find(b => {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      if (!/\bpeople\b|\bparticipant/.test(label)) return false;
      if (/message|chat|react|emoji|raise|hand|caption|record/.test(label)) return false;
      return true;
    });

    if (btn) {
      btn.click();
      console.log('[UniConnect Meet Tracker] Opened participants panel (scan):', btn.getAttribute('aria-label'));
      setTimeout(pollParticipants, 1500);
      return;
    }

    console.log('[UniConnect Meet Tracker] Participants button not found. Available:',
      allBtns.slice(0, 30).map(b => b.getAttribute('aria-label')).filter(Boolean).join(' | ')
    );
    setTimeout(openParticipantsPanel, 4000);
  }

  // ─── Detect Self ──────────────────────────────────────────────────────
  // Tries multiple attributes/patterns since Meet changes its DOM frequently.
  function detectSelfName() {
    // 1. data-self-name attribute
    const a = document.querySelector('[data-self-name]');
    if (a) {
      const n = cleanName(a.getAttribute('data-self-name') || '');
      if (isValidParticipantName(n)) return n;
    }

    // 2. aria-label containing "(you)" — local video tile label
    const b = document.querySelector('[aria-label*="(you)" i]');
    if (b) {
      const n = cleanName(b.getAttribute('aria-label') || '');
      if (isValidParticipantName(n)) return n;
    }

    // 3. Any leaf element whose text ends with "(You)" or "(you)"
    for (const el of document.querySelectorAll('div, span')) {
      if (el.children.length > 0) continue;
      const t = (el.textContent || '').trim();
      if (/\(you\)$/i.test(t)) {
        const n = cleanName(t);
        if (isValidParticipantName(n)) return n;
      }
    }

    // 4. Participants panel item with "(you)" in aria-label
    for (const el of document.querySelectorAll('[data-participant-id]')) {
      const label = el.getAttribute('aria-label') || '';
      if (/\(you\)/i.test(label)) {
        const n = cleanName(label);
        if (isValidParticipantName(n)) return n;
      }
    }

    return null;
  }

  // ─── Poll Participants ────────────────────────────────────────────────
  function pollParticipants() {
    const now = new Date();
    const currentNames = new Set();

    // ── Signal 1: [data-participant-id] elements ─────────────────────
    // Present in participant panel AND sometimes on video tiles.
    // Title Case filter handles garbage — safe to also check textContent.
    document.querySelectorAll('[data-participant-id]').forEach(el => {
      // Prefer aria-label (clean, already formatted as a name)
      const label = el.getAttribute('aria-label');
      if (label) {
        const name = cleanName(label);
        if (isValidParticipantName(name)) { currentNames.add(name); return; }
      }
      // Fallback: first leaf child whose text looks like a Title Case name
      const leaves = el.querySelectorAll('div, span');
      for (const leaf of leaves) {
        if (leaf.children.length > 0) continue;
        const t = (leaf.textContent || '').trim();
        if (t && isValidParticipantName(cleanName(t))) {
          currentNames.add(cleanName(t));
          break;
        }
      }
    });

    // ── Signal 2: self-name (your own tile) ───────────────────────────
    const selfName = detectSelfName();
    if (selfName) currentNames.add(selfName);

    // ── Signal 3: Poll aria-live/alert regions for join text ──────────
    document.querySelectorAll('[role="alert"], [aria-live="polite"], [aria-live="assertive"]').forEach(el => {
      tryParseJoinLeaveText((el.textContent || '').trim());
    });

    // ── Update state ──────────────────────────────────────────────────
    currentNames.forEach(name => {
      if (!name || name === 'You') return;
      if (!state.participants.has(name)) {
        state.participants.set(name, {
          name,
          firstSeen: now.toISOString(),
          lastSeen: now.toISOString(),
          isActive: true,
          joinEvents: [now.toISOString()],
          leaveEvents: [],
          totalDurationMs: 0,
          spokeInCaptions: false,
          speakingSegments: 0
        });
        console.log(`[UniConnect Meet Tracker] Detected: ${name}`);
      } else {
        const p = state.participants.get(name);
        if (!p.isActive) {
          p.isActive = true;
          p.joinEvents.push(now.toISOString());
        }
        p.lastSeen = now.toISOString();
      }
    });

    // ── Mark inactive anyone no longer seen ───────────────────────────
    state.participants.forEach((p, name) => {
      if (p.isActive && !currentNames.has(name)) {
        // Only mark inactive if they were detected via poll (not just toasts)
        // Give grace period — they disappear from panel momentarily sometimes
        if (!p._graceStart) {
          p._graceStart = now.getTime();
        } else if (now.getTime() - p._graceStart > 9000) {
          // 9 seconds missing → actually left
          p._graceStart = null;
          p.isActive = false;
          p.leaveEvents.push(now.toISOString());
          const lastJoin = new Date(p.joinEvents[p.joinEvents.length - 1]);
          p.totalDurationMs += now.getTime() - lastJoin.getTime();
          console.log(`[UniConnect Meet Tracker] Left (poll): ${name}`);
        }
      } else if (currentNames.has(name)) {
        p._graceStart = null; // reset grace period if seen again
      }
    });

    // ── Push live participant list to storage (for popup display) ─────
    const activeParticipants = Array.from(state.participants.values())
      .filter(p => p.isActive)
      .map(p => ({ name: p.name, speaking: p.spokeInCaptions }));

    try {
      chrome.storage.local.set({
        activeParticipants,
        activeMeetingParticipantCount: activeParticipants.length
      });
    } catch (e) { /* extension context invalidated — ignore */ }

    updateBadge(`${activeParticipants.length} in call`);

    console.log(`[UniConnect Meet Tracker] Active: ${activeParticipants.length} | Names: ${activeParticipants.map(p => p.name).join(', ')}`);
  }

  // ─── Join / Leave Text Parser ─────────────────────────────────────────
  // Called from both the observer and the poll (for aria-live polling).
  // Tracks which texts we've already processed to avoid double-counting.
  const _seenJoinTexts = new Set();

  function tryParseJoinLeaveText(text) {
    if (!text || _seenJoinTexts.has(text)) return;
    _seenJoinTexts.add(text);
    // Expire old entries so the set doesn't grow forever
    if (_seenJoinTexts.size > 200) _seenJoinTexts.clear();

    // "Priya joined" / "Priya joined the call" / "Priya has joined"
    const joinMatch = text.match(/^(.+?)\s+(?:has\s+)?joined(?:\s+the\s+call)?\s*\.?\s*$/i);
    if (joinMatch) {
      const name = cleanName(joinMatch[1]);
      if (isValidParticipantName(name)) { recordJoin(name); return; }
    }

    // "Priya left" / "Priya left the call" / "Priya has left"
    const leaveMatch = text.match(/^(.+?)\s+(?:has\s+)?left(?:\s+the\s+call)?\s*\.?\s*$/i);
    if (leaveMatch) {
      const name = cleanName(leaveMatch[1]);
      if (isValidParticipantName(name)) { recordLeave(name); return; }
    }
  }

  // ─── Join / Leave Toast Observer ────────────────────────────────────
  function startJoinLeaveObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // New element added — check its text
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            tryParseJoinLeaveText((node.textContent || '').trim());
          }
          if (node.nodeType === 3) {
            // Text node directly added
            tryParseJoinLeaveText((node.textContent || '').trim());
          }
        }
        // Existing element's text changed (aria-live pattern)
        if (mutation.type === 'characterData') {
          tryParseJoinLeaveText((mutation.target.textContent || '').trim());
        }
        if (mutation.type === 'childList' && mutation.target) {
          tryParseJoinLeaveText((mutation.target.textContent || '').trim());
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function recordJoin(name) {
    const now = new Date();
    if (!state.participants.has(name)) {
      state.participants.set(name, {
        name,
        firstSeen: now.toISOString(),
        lastSeen: now.toISOString(),
        isActive: true,
        joinEvents: [now.toISOString()],
        leaveEvents: [],
        totalDurationMs: 0,
        spokeInCaptions: false,
        speakingSegments: 0
      });
      console.log(`[UniConnect Meet Tracker] Joined (toast): ${name}`);
    } else {
      const p = state.participants.get(name);
      if (!p.isActive) {
        p.isActive = true;
        p.joinEvents.push(now.toISOString());
        console.log(`[UniConnect Meet Tracker] Re-joined (toast): ${name}`);
      }
      p.lastSeen = now.toISOString();
    }
  }

  function recordLeave(name) {
    const now = new Date();
    const p = state.participants.get(name);
    if (p && p.isActive) {
      p.isActive = false;
      p.leaveEvents.push(now.toISOString());
      const lastJoin = new Date(p.joinEvents[p.joinEvents.length - 1]);
      p.totalDurationMs += now.getTime() - lastJoin.getTime();
      console.log(`[UniConnect Meet Tracker] Left (toast): ${name}`);
    }
  }

  // ─── Caption Observer ────────────────────────────────────────────────
  function startCaptionObserver() {
    setTimeout(() => {
      const captionBtn = document.querySelector('[aria-label="Turn on captions"]') ||
                         document.querySelector('[data-tooltip="Turn on captions"]');
      if (captionBtn) {
        console.log('[UniConnect Meet Tracker] Enabling captions...');
        captionBtn.click();
      }
    }, 5000);

    const observeCaption = () => {
      const captionContainer = document.querySelector(
        '.a4cQT, ' +
        '[class*="caption"], ' +
        '.iOzk7'
      );

      if (captionContainer) {
        state.captionObserver = new MutationObserver(handleCaptionMutation);
        state.captionObserver.observe(captionContainer, {
          childList: true,
          subtree: true,
          characterData: true
        });
        console.log('[UniConnect Meet Tracker] Caption observer attached.');
        return true;
      }
      return false;
    };

    if (!observeCaption()) {
      const retryInterval = setInterval(() => {
        if (observeCaption()) clearInterval(retryInterval);
      }, 3000);
      setTimeout(() => clearInterval(retryInterval), 2 * 60 * 1000);
    }

    const bodyObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && node.textContent) {
            const el = node;
            if (el.classList?.contains('a4cQT') || el.querySelector?.('.a4cQT')) {
              if (!state.captionObserver) observeCaption();
            }
          }
        }
      }
    });

    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  function handleCaptionMutation(mutations) {
    const now = Date.now();

    for (const _mutation of mutations) {
      const captionElements = document.querySelectorAll(
        '.a4cQT .TBMuR span, ' +
        '.iOzk7 span, ' +
        '[class*="caption"] span'
      );

      if (captionElements.length === 0) continue;

      let speaker = '';
      let text = '';

      captionElements.forEach(el => {
        const content = el.textContent?.trim() || '';
        if (!content) return;

        const parent = el.parentElement;
        const isSpeakerEl = parent?.classList?.contains('zs7s8d') ||
                            el.classList?.contains('zs7s8d') ||
                            parent?.querySelector('[class*="name"]') === el;

        if (isSpeakerEl && content.length < 60) {
          speaker = content;
        } else {
          text += content + ' ';
        }
      });

      text = text.trim();
      if (!text) continue;

      if (speaker && state.participants.has(speaker)) {
        const p = state.participants.get(speaker);
        if (!p.spokeInCaptions) {
          p.spokeInCaptions = true;
        }
        p.speakingSegments++;
      }

      if (speaker !== state.captionSpeaker || (now - state.lastCaptionTime > CONFIG.CAPTION_FLUSH_MS)) {
        if (state.captionBuffer) {
          state.captions.push({
            speaker: state.captionSpeaker,
            text: state.captionBuffer.trim(),
            timestamp: new Date(state.lastCaptionTime).toISOString()
          });
        }
        state.captionSpeaker = speaker;
        state.captionBuffer = text;
      } else {
        state.captionBuffer += ' ' + text;
      }
      state.lastCaptionTime = now;
    }
  }

  // ─── Detect Meeting End ──────────────────────────────────────────────
  function detectMeetingEnd() {
    const checkEnd = setInterval(() => {
      try {
        const endScreen = document.querySelector('[data-call-ended]') ||
                          document.querySelector('.CRFCdf') ||
                          document.querySelector('[class*="meeting-ended"]');

        const returnHome = document.querySelector('[aria-label="Return to home screen"]');
        const rejoinBtn  = document.querySelector('[aria-label="Rejoin"]');

        if (endScreen || returnHome || rejoinBtn) {
          clearInterval(checkEnd);
          endTracking();
          return;
        }

        if (!window.location.href.includes('meet.google.com')) {
          clearInterval(checkEnd);
          endTracking();
        }
      } catch (e) {
        clearInterval(checkEnd); // extension context gone, stop polling
      }
    }, 2000);

    window.addEventListener('beforeunload', () => { endTracking(); });
  }

  // ─── End Tracking & Send Data ────────────────────────────────────────
  function endTracking() {
    if (!state.isTracking) return;
    state.isTracking = false;

    const endTime = new Date();
    console.log('[UniConnect Meet Tracker] Meeting ended. Compiling report...');

    if (state.captionBuffer) {
      state.captions.push({
        speaker: state.captionSpeaker,
        text: state.captionBuffer.trim(),
        timestamp: new Date(state.lastCaptionTime).toISOString()
      });
    }

    // Finalize participant durations
    state.participants.forEach((p) => {
      if (p.isActive) {
        p.isActive = false;
        p.leaveEvents.push(endTime.toISOString());
        const lastJoin = new Date(p.joinEvents[p.joinEvents.length - 1]);
        p.totalDurationMs += endTime.getTime() - lastJoin.getTime();
      }
    });

    // Build participant list (only real participants with valid names)
    const participantList = Array.from(state.participants.values())
      .filter(p => isValidParticipantName(p.name))
      .map(p => ({
        name: p.name,
        firstSeen: p.firstSeen,
        lastSeen: p.lastSeen,
        joinEvents: p.joinEvents,
        leaveEvents: p.leaveEvents,
        totalDurationMinutes: Math.round(p.totalDurationMs / 60000),
        spokeInCaptions: p.spokeInCaptions,
        speakingSegments: p.speakingSegments
      }));

    const report = {
      meetCode: state.meetCode,
      title: state.meetTitle,
      startTime: state.joinedAt?.toISOString(),
      endTime: endTime.toISOString(),
      durationMinutes: Math.round((endTime.getTime() - (state.joinedAt?.getTime() || 0)) / 60000),
      participants: participantList,
      captions: state.captions,
      captionTranscript: state.captions.map(c =>
        `${c.speaker ? c.speaker + ': ' : ''}${c.text}`
      ).join('\n'),
      trackerVersion: '1.2.0',
      collectedBy: 'chrome-extension'
    };

    console.log('[UniConnect Meet Tracker] Report:', report);
    console.log(`[UniConnect Meet Tracker] Final participants (${participantList.length}):`, participantList.map(p => p.name));

    // Auto-download CSV
    downloadAttendanceCSV(participantList, report);

    // Send to background
    chrome.runtime.sendMessage({
      type: 'MEETING_ENDED',
      data: report
    });

    // Store locally as backup
    const reportKey = `meeting_${state.meetCode}_${Date.now()}`;
    chrome.storage.local.get('reportKeys', ({ reportKeys = [] }) => {
      reportKeys.push(reportKey);
      chrome.storage.local.set({
        [reportKey]: report,
        reportKeys,
        activeParticipants: []
      });
    });

    // Cleanup
    clearInterval(state.pollInterval);
    state.captionObserver?.disconnect();
    updateBadge('Done');

    showEndToast(participantList.length, participantList.map(p => p.name));
  }

  // ─── Auto-Download Attendance CSV ──────────────────────────────────
  function downloadAttendanceCSV(participants, report) {
    if (!participants || participants.length === 0) return;

    try {
      const headers = ['Name', 'First Seen', 'Last Seen', 'Join Time', 'Leave Time', 'Duration (min)', 'Spoke', 'Speaking Segments'];
      const rows = participants.map(p => [
        p.name,
        p.firstSeen ? new Date(p.firstSeen).toLocaleString() : '',
        p.lastSeen ? new Date(p.lastSeen).toLocaleString() : '',
        p.joinEvents?.[0] ? new Date(p.joinEvents[0]).toLocaleString() : '',
        p.leaveEvents?.length > 0 ? new Date(p.leaveEvents[p.leaveEvents.length - 1]).toLocaleString() : '',
        p.totalDurationMinutes || 0,
        p.spokeInCaptions ? 'Yes' : 'No',
        p.speakingSegments || 0
      ]);

      const csvContent = [
        `Meeting: ${report.title || report.meetCode}`,
        `Meet Code: ${report.meetCode}`,
        `Date: ${new Date(report.startTime).toLocaleDateString()}`,
        `Start: ${new Date(report.startTime).toLocaleTimeString()}`,
        `End: ${new Date(report.endTime).toLocaleTimeString()}`,
        `Duration: ${report.durationMinutes} minutes`,
        `Total Participants: ${participants.length}`,
        '',
        headers.join(','),
        ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `attendance_${report.meetCode}_${dateStr}.csv`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log(`[UniConnect Meet Tracker] CSV downloaded: ${participants.length} participants`);
    } catch (err) {
      console.error('[UniConnect Meet Tracker] CSV download failed:', err);
    }
  }

  // ─── End-of-Meeting Toast ──────────────────────────────────────────
  function showEndToast(count, names) {
    const nameList = names.slice(0, 5).join(', ') + (names.length > 5 ? ` +${names.length - 5} more` : '');
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; bottom: 80px; right: 24px; z-index: 99999;
      background: #1a1a2e; color: #e0e0e0; border: 1px solid #4f46e5;
      border-radius: 12px; padding: 16px 20px; max-width: 320px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4); font-family: 'Segoe UI', sans-serif;
      animation: uc-slide-in 0.3s ease-out;
    `;
    toast.innerHTML = `
      <div style="font-weight:700; font-size:14px; margin-bottom:6px; color:#818cf8;">
        Meeting Report Saved
      </div>
      <div style="font-size:12px; color:#94a3b8; line-height:1.4;">
        ${count} participant${count !== 1 ? 's' : ''} tracked.
        ${count > 0 ? `<br><span style="color:#e0e0e0;">${nameList}</span>` : ''}
        <br>Attendance CSV downloaded.
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `@keyframes uc-slide-in { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }`;
    document.head.appendChild(style);

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s';
      toast.style.opacity = '0';
      setTimeout(() => { toast.remove(); style.remove(); }, 300);
    }, 8000);
  }

  // ─── Status Badge UI ────────────────────────────────────────────────
  function createStatusBadge() {
    if (state.statusBadge) return;

    const badge = document.createElement('div');
    badge.id = 'uniconnect-tracker-badge';
    badge.style.cssText = `
      position: fixed; bottom: 16px; right: 16px; z-index: 99998;
      background: #1a1a2e; border: 1px solid #4f46e5; border-radius: 8px;
      padding: 6px 12px; font-family: 'Segoe UI', sans-serif; font-size: 12px;
      color: #e0e0e0; display: flex; align-items: center; gap: 8px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.3); cursor: default;
    `;
    badge.innerHTML = `
      <div style="width:8px;height:8px;border-radius:50%;background:#22c55e;animation:uc-pulse 2s infinite;"></div>
      <span class="uc-badge-text">Tracking</span>
      <style>@keyframes uc-pulse{0%,100%{opacity:1}50%{opacity:.4}}</style>
    `;
    document.body.appendChild(badge);
    state.statusBadge = badge;
  }

  function updateBadge(text) {
    if (!state.statusBadge) return;
    const textEl = state.statusBadge.querySelector('.uc-badge-text');
    if (textEl) textEl.textContent = text;
  }

  // ─── Start ───────────────────────────────────────────────────────────
  setTimeout(init, 3000);

})();
