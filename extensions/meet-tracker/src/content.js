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
    participants: new Map(), // email/name → { name, joinTime, leaveTime, durations[], isActive }
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
    // Look for signs that user has joined the meeting (not just the lobby)
    const checkInterval = setInterval(() => {
      // The meeting is active when we can see the end call button or participant count
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

    // Extract meeting title
    state.meetTitle = extractMeetingTitle();

    // Create status badge
    createStatusBadge();

    // Start participant polling
    state.pollInterval = setInterval(pollParticipants, CONFIG.PARTICIPANT_POLL_MS);
    pollParticipants(); // Initial poll

    // Start caption observation
    startCaptionObserver();

    // Listen for meeting end
    detectMeetingEnd();

    // Notify background
    chrome.runtime.sendMessage({
      type: 'MEETING_STARTED',
      data: {
        meetCode: state.meetCode,
        title: state.meetTitle,
        joinedAt: state.joinedAt.toISOString()
      }
    });

    updateBadge('Tracking');
  }

  // ─── Extract Meeting Title ───────────────────────────────────────────
  function extractMeetingTitle() {
    // Try various selectors for meeting title
    const titleEl = document.querySelector('[data-meeting-title]') ||
                    document.querySelector('.u6vdEc') ||  // Common class for title
                    document.querySelector('[data-tooltip*="meeting"]');

    if (titleEl) return titleEl.textContent?.trim() || '';

    // Fallback: use document title
    const docTitle = document.title.replace(' - Google Meet', '').trim();
    return docTitle || `Meeting ${state.meetCode}`;
  }

  // ─── Poll Participants ───────────────────────────────────────────────
  function pollParticipants() {
    const now = new Date();
    const currentNames = new Set();

    // Strategy 1: Participant panel (when open)
    const participantItems = document.querySelectorAll(
      '[data-participant-id], ' +
      '.zWGUib, ' +                    // Participant list items
      '[data-requested-participant-id]'
    );

    participantItems.forEach(el => {
      const name = extractParticipantName(el);
      if (name) currentNames.add(name);
    });

    // Strategy 2: Video tiles (always visible)
    const videoTiles = document.querySelectorAll(
      '[data-self-name], ' +
      '.KV1GEc, ' +                    // Name on video tile
      '.zs7s8d, ' +                    // Name overlay
      '.dwSJ2e, ' +                    // Participant name in grid
      '[data-participant-id] [class*="name"]'
    );

    videoTiles.forEach(el => {
      const name = el.getAttribute('data-self-name') || el.textContent?.trim();
      if (name && name.length > 1 && name.length < 80) {
        currentNames.add(cleanName(name));
      }
    });

    // Strategy 3: Participant count badge (to know if we're missing people)
    const countEl = document.querySelector('.uArJ5e, .rua5Nb, [data-attendees-count]');
    const displayedCount = countEl ? parseInt(countEl.textContent || '0') : 0;

    // Update participant state
    currentNames.forEach(name => {
      if (!name || name === 'You' || name === 'Presentation') return;

      if (!state.participants.has(name)) {
        // New participant
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
        console.log(`[UniConnect Meet Tracker] Participant joined: ${name}`);
      } else {
        const p = state.participants.get(name);
        if (!p.isActive) {
          // Re-joined
          p.isActive = true;
          p.joinEvents.push(now.toISOString());
          console.log(`[UniConnect Meet Tracker] Participant re-joined: ${name}`);
        }
        p.lastSeen = now.toISOString();
      }
    });

    // Detect leaves
    state.participants.forEach((p, name) => {
      if (p.isActive && !currentNames.has(name)) {
        p.isActive = false;
        p.leaveEvents.push(now.toISOString());
        // Calculate duration for this session
        const lastJoin = new Date(p.joinEvents[p.joinEvents.length - 1]);
        p.totalDurationMs += now.getTime() - lastJoin.getTime();
        console.log(`[UniConnect Meet Tracker] Participant left: ${name}`);
      }
    });

    // Update badge
    updateBadge(`${state.participants.size} tracked`);
  }

  function extractParticipantName(el) {
    // Try multiple approaches
    const nameEl = el.querySelector('.zs7s8d, .dwSJ2e, .KV1GEc, [class*="name"]');
    if (nameEl) return cleanName(nameEl.textContent);

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return cleanName(ariaLabel);

    return cleanName(el.textContent);
  }

  function cleanName(name) {
    if (!name) return '';
    return name
      .replace(/\(You\)/gi, '')
      .replace(/\(Host\)/gi, '')
      .replace(/\(Presenting\)/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ─── Caption Observer ────────────────────────────────────────────────
  function startCaptionObserver() {
    // Try to enable captions if not already on
    setTimeout(() => {
      const captionBtn = document.querySelector('[aria-label="Turn on captions"]') ||
                         document.querySelector('[data-tooltip="Turn on captions"]');
      if (captionBtn) {
        console.log('[UniConnect Meet Tracker] Enabling captions...');
        captionBtn.click();
      }
    }, 5000);

    // Observe caption container for changes
    const observeCaption = () => {
      const captionContainer = document.querySelector(
        '.a4cQT, ' +          // Caption container
        '[class*="caption"], ' +
        '.iOzk7'              // Another caption class
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

    // Retry caption observer setup (captions may take time to load)
    if (!observeCaption()) {
      const retryInterval = setInterval(() => {
        if (observeCaption()) clearInterval(retryInterval);
      }, 3000);

      // Stop retrying after 2 minutes
      setTimeout(() => clearInterval(retryInterval), 2 * 60 * 1000);
    }

    // Also set up a general body observer as fallback
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

    for (const mutation of mutations) {
      // Look for caption text updates
      const captionElements = document.querySelectorAll(
        '.a4cQT .TBMuR span, ' +    // Speaker + text
        '.iOzk7 span, ' +
        '[class*="caption"] span'
      );

      if (captionElements.length === 0) continue;

      // Extract speaker and text
      let speaker = '';
      let text = '';

      captionElements.forEach(el => {
        const content = el.textContent?.trim() || '';
        if (!content) return;

        // Check if this looks like a speaker name (shorter, often bold/styled differently)
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

      // Track speaker
      if (speaker && state.participants.has(speaker)) {
        const p = state.participants.get(speaker);
        if (!p.spokeInCaptions) {
          p.spokeInCaptions = true;
        }
        p.speakingSegments++;
      }

      // Buffer captions (group consecutive text from same speaker)
      if (speaker !== state.captionSpeaker || (now - state.lastCaptionTime > CONFIG.CAPTION_FLUSH_MS)) {
        // Flush previous buffer
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
    // Watch for navigation away or meeting end screen
    const checkEnd = setInterval(() => {
      const endScreen = document.querySelector('[data-call-ended]') ||
                        document.querySelector('.CRFCdf') ||  // "You left the meeting" screen
                        document.querySelector('[class*="meeting-ended"]');

      const returnHome = document.querySelector('[aria-label="Return to home screen"]');
      const rejoinBtn = document.querySelector('[aria-label="Rejoin"]');

      if (endScreen || returnHome || rejoinBtn) {
        clearInterval(checkEnd);
        endTracking();
      }

      // Also check if URL changed away from meet
      if (!window.location.href.includes('meet.google.com')) {
        clearInterval(checkEnd);
        endTracking();
      }
    }, 2000);

    // Also listen for page unload
    window.addEventListener('beforeunload', () => {
      endTracking();
    });
  }

  // ─── End Tracking & Send Data ────────────────────────────────────────
  function endTracking() {
    if (!state.isTracking) return;
    state.isTracking = false;

    const endTime = new Date();
    console.log('[UniConnect Meet Tracker] Meeting ended. Compiling report...');

    // Flush remaining caption buffer
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

    // Build report
    const report = {
      meetCode: state.meetCode,
      title: state.meetTitle,
      startTime: state.joinedAt?.toISOString(),
      endTime: endTime.toISOString(),
      durationMinutes: Math.round((endTime.getTime() - (state.joinedAt?.getTime() || 0)) / 60000),
      participants: Array.from(state.participants.values()).map(p => ({
        name: p.name,
        firstSeen: p.firstSeen,
        lastSeen: p.lastSeen,
        joinEvents: p.joinEvents,
        leaveEvents: p.leaveEvents,
        totalDurationMinutes: Math.round(p.totalDurationMs / 60000),
        spokeInCaptions: p.spokeInCaptions,
        speakingSegments: p.speakingSegments
      })),
      captions: state.captions,
      captionTranscript: state.captions.map(c =>
        `${c.speaker ? c.speaker + ': ' : ''}${c.text}`
      ).join('\n'),
      trackerVersion: '1.0.0',
      collectedBy: 'chrome-extension'
    };

    console.log('[UniConnect Meet Tracker] Report:', report);

    // Send to background for API submission
    chrome.runtime.sendMessage({
      type: 'MEETING_ENDED',
      data: report
    });

    // Store locally as backup
    chrome.storage.local.set({
      [`meeting_${state.meetCode}_${Date.now()}`]: report
    });

    // Cleanup
    clearInterval(state.pollInterval);
    state.captionObserver?.disconnect();
    updateBadge('Done');
  }

  // ─── Status Badge UI ────────────────────────────────────────────────
  function createStatusBadge() {
    if (state.statusBadge) return;

    const badge = document.createElement('div');
    badge.id = 'uniconnect-tracker-badge';
    badge.innerHTML = `
      <div class="uc-badge-inner">
        <div class="uc-badge-dot"></div>
        <span class="uc-badge-text">Tracking</span>
      </div>
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
  // Small delay to let Meet's SPA fully render
  setTimeout(init, 3000);

})();
