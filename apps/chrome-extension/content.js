// UniConnect Meeting Tracker — Content Script for Google Meet
// Runs on meet.google.com/*-*-* pages

(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────
  const state = {
    meetCode: null,
    meetTitle: null,
    startTime: null,
    participants: new Map(), // name → { name, email, joinEvents, leaveEvents, lastSeen }
    previousNames: new Set(),
    captions: [],
    captionSpeakers: new Map(), // name → segment count
    isTracking: false,
    pollInterval: null,
    captionObserver: null,
  };

  // ─── Extract meet code from URL ───────────────────────────────────
  function getMeetCode() {
    const match = window.location.pathname.match(/\/([a-z]{3}-[a-z]{4}-[a-z]{3})/);
    return match ? match[1] : null;
  }

  // ─── Find participant list in the DOM ─────────────────────────────
  // Known Google Meet UI strings that are NOT participant names
  const MEET_UI_STRINGS = new Set([
    'reframe', 'backgrounds and effects', 'background and effects',
    'you', 'presentation', 'pin', 'mute', 'remove', 'more options',
    'turn on captions', 'turn off captions', 'raise hand', 'lower hand',
    'present now', 'recording', 'screen sharing', 'chat', 'people',
    'activities', 'host controls', 'meeting details', 'apply visual effects',
    'blur your background', 'settings', 'report a problem', 'help',
    'leave call', 'end call', 'admit', 'deny', 'cancel',
    'send a message to everyone', 'meeting is ready',
    'ready to join?', 'ready to join', 'joining...', 'asking to join',
    'microphone not found', 'camera not found', 'check your audio and video',
    'this call is open to anyone', 'no one else is here',
    'got it', 'learn more', 'dismiss', 'close',
  ]);

  function isValidParticipantName(name) {
    if (!name || name.length < 2 || name.length > 50) return false;

    const lower = name.toLowerCase();

    // Reject known UI strings
    if (MEET_UI_STRINGS.has(lower)) return false;

    // Reject if it looks like a meet code (xxx-xxxx-xxx)
    if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(lower)) return false;

    // Reject strings with too many spaces (UI labels tend to be long phrases)
    if (name.split(' ').length > 4) return false;

    // Reject if it contains common UI keywords
    const uiKeywords = /\b(effect|background|reframe|caption|recording|screen|share|setting|option|control|detail|activity|layout|report|problem|shortcut|noise|cancel|apply|visual|blur|admit|deny|host)\b/i;
    if (uiKeywords.test(name)) return false;

    // Reject timestamps like "17:56"
    if (/^\d{1,2}:\d{2}/.test(name)) return false;

    // Reject strings ending with ? or ! (UI prompts, not names)
    if (/[?!]$/.test(name)) return false;

    // Reject strings that look like sentences (contain common verbs/articles)
    if (/\b(is |are |the |this |your |not |can |to |for |in |has |have |make |sure |found|plugged)\b/i.test(name)) return false;

    // Reject if it's all lowercase single word (UI labels) — real names have capitals
    if (name.split(' ').length === 1 && name === name.toLowerCase() && name.length > 3) return false;

    return true;
  }

  function getParticipantNames() {
    const names = new Set();

    // Strategy 1: data-self-name attribute (most reliable when available)
    document.querySelectorAll('[data-self-name]').forEach(el => {
      const name = el.getAttribute('data-self-name');
      if (isValidParticipantName(name)) names.add(name);
    });
    if (names.size > 0) return names;

    // Strategy 2: Video tile name labels
    // Google Meet shows participant names as small text overlays on video tiles.
    // These are typically short, leaf-level DOM elements with just the name text.
    // We look for elements whose DIRECT text is short and name-like.
    const candidateSelectors = [
      '.KV1GEc',    // name label on video tile
      '.ZjFb7c',    // another name label variant
      '.cS7aqe',    // participant list name
      '.zWGUib',    // sidebar participant name
      '.XEazBc',    // bottom bar name
      '.EY8ABd-OWXEXe-TAWMXe', // name overlay
    ];

    for (const sel of candidateSelectors) {
      document.querySelectorAll(sel).forEach(el => {
        // Only use the element's OWN direct text, not all descendant text
        // This prevents grabbing "NameButtonsMenuItems" concatenated junk
        let name = '';
        for (const child of el.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            name += child.textContent;
          }
        }
        name = name.trim();

        // If no direct text, try textContent but ONLY if element has no child elements
        // (i.e., it's a pure text leaf node)
        if (!name && el.children.length === 0) {
          name = el.textContent?.trim() || '';
        }

        if (isValidParticipantName(name)) names.add(name);
      });
    }
    if (names.size > 0) return names;

    // Strategy 3: Broadest fallback — scan all elements with short, name-like text
    // Only use leaf elements (no children) to avoid container text concatenation
    document.querySelectorAll('[data-participant-id]').forEach(el => {
      // Walk through child elements to find the one that contains just the name
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT, {
        acceptNode: (node) => {
          // Accept leaf elements (no element children) with short text
          if (node.children.length === 0) {
            const text = node.textContent?.trim();
            if (text && text.length >= 2 && text.length <= 40) {
              return NodeFilter.FILTER_ACCEPT;
            }
          }
          return NodeFilter.FILTER_SKIP;
        }
      });

      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent?.trim();
        if (isValidParticipantName(text)) {
          names.add(text);
          break; // First valid name in this participant element is the actual name
        }
      }
    });

    return names;
  }

  // ─── Get meeting title ────────────────────────────────────────────
  function getMeetTitle() {
    // Try data attribute first (clean, no child text issues)
    const titleAttr = document.querySelector('[data-meeting-title]');
    if (titleAttr) {
      const title = titleAttr.getAttribute('data-meeting-title');
      if (title && title.length > 0 && title.length < 100) return title;
    }

    // Try specific title selectors — use only DIRECT text content
    const selectors = ['.u6vdEc', '.roSPhc'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        // Get only direct text nodes, not all descendant text
        let title = '';
        for (const child of el.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            title += child.textContent;
          }
        }
        title = title.trim();
        if (title && title.length > 0 && title.length < 100) return title;
      }
    }

    // Fallback: just use the meet code as title
    return null;
  }

  // ─── Poll participants ────────────────────────────────────────────
  function pollParticipants() {
    const now = new Date().toISOString();
    const currentNames = getParticipantNames();

    // Detect new joins
    currentNames.forEach(name => {
      if (!state.participants.has(name)) {
        // New participant
        state.participants.set(name, {
          name,
          email: null,
          joinEvents: [now],
          leaveEvents: [],
          lastSeen: now,
        });
        console.log(`[UniConnect] Participant joined: ${name}`);
        notifyBackground('participant_joined', { name, time: now });
      } else {
        // Already known — update last seen
        const p = state.participants.get(name);
        p.lastSeen = now;

        // If they were previously gone (leave event recorded) and now back, record re-join
        if (p.leaveEvents.length > p.joinEvents.length - 1) {
          // They had left but are back
        }
        if (!state.previousNames.has(name) && p.leaveEvents.length > 0) {
          // They re-joined after leaving
          p.joinEvents.push(now);
          console.log(`[UniConnect] Participant re-joined: ${name}`);
        }
      }
    });

    // Detect leaves (was in previous poll but not in current)
    state.previousNames.forEach(name => {
      if (!currentNames.has(name) && state.participants.has(name)) {
        const p = state.participants.get(name);
        // Only record leave if they haven't already been marked as left
        if (p.leaveEvents.length < p.joinEvents.length) {
          p.leaveEvents.push(now);
          console.log(`[UniConnect] Participant left: ${name}`);
          notifyBackground('participant_left', { name, time: now });
        }
      }
    });

    state.previousNames = currentNames;

    // Update title if not set
    if (!state.meetTitle) {
      state.meetTitle = getMeetTitle();
    }

    // Send periodic status to background
    notifyBackground('status_update', {
      participantCount: state.participants.size,
      currentCount: currentNames.size,
    });
  }

  // ─── Caption tracking ─────────────────────────────────────────────
  // Known caption container selectors in Google Meet
  const CAPTION_CONTAINER_SELECTORS = '.a4cQT, .iOzk7, [jsname="dsyhDe"], [jsname="YPqjbf"]';
  // Known caption text selectors
  const CAPTION_TEXT_SELECTORS = '.iTTPOb, .bj4p3b, [jsname="YS0Rig"], [jsname="tgaKEf"]';
  // Known speaker name selectors in captions
  const CAPTION_SPEAKER_SELECTORS = '.zs7s8d, .TBMuR, [jsname="tgaKEf"]';

  function isCaptionElement(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    // Check if the node or its parent is inside a caption container
    let el = node;
    for (let i = 0; i < 5; i++) {
      if (!el) break;
      if (el.matches && el.matches(CAPTION_CONTAINER_SELECTORS)) return true;
      el = el.parentElement;
    }
    return false;
  }

  function extractCaptionData(node) {
    // Look for speaker and text within this node
    const speakerEl = node.querySelector?.(CAPTION_SPEAKER_SELECTORS);
    const textEl = node.querySelector?.(CAPTION_TEXT_SELECTORS);

    const speaker = speakerEl?.textContent?.trim() || null;
    // Only use text from caption-specific elements, NOT generic textContent
    const text = textEl?.textContent?.trim() || null;

    return { speaker, text };
  }

  function setupCaptionObserver() {
    let captionContainerFound = false;

    // The main caption observer — only processes nodes inside caption containers
    const captionObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          const { speaker, text } = extractCaptionData(node);

          // Only record if we found actual caption text (not random DOM updates)
          if (text && text.length > 1) {
            if (speaker) {
              state.captionSpeakers.set(speaker, (state.captionSpeakers.get(speaker) || 0) + 1);
              if (state.participants.has(speaker)) {
                state.participants.get(speaker).spokeInCaptions = true;
              }
            }
            state.captions.push({
              speaker: speaker || 'Unknown',
              text,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    });

    // Try to find existing caption containers and observe them directly
    function findAndObserveCaptions() {
      const containers = document.querySelectorAll(CAPTION_CONTAINER_SELECTORS);
      if (containers.length > 0) {
        containers.forEach(container => {
          captionObserver.observe(container, { childList: true, subtree: true });
        });
        captionContainerFound = true;
        console.log(`[UniConnect] Found ${containers.length} caption container(s)`);
        return true;
      }
      return false;
    }

    // If caption containers exist already, observe them
    if (!findAndObserveCaptions()) {
      // Otherwise, use a lightweight body observer that ONLY watches for caption containers appearing
      const bodyWatcher = new MutationObserver((mutations) => {
        if (captionContainerFound) return;
        // Check if any caption containers were added
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            // Check if this node IS a caption container or CONTAINS one
            if (node.matches?.(CAPTION_CONTAINER_SELECTORS) ||
                node.querySelector?.(CAPTION_CONTAINER_SELECTORS)) {
              if (findAndObserveCaptions()) {
                bodyWatcher.disconnect(); // Stop watching body once we found captions
                console.log('[UniConnect] Caption container detected, switched to targeted observer');
                return;
              }
            }
          }
        }
      });

      bodyWatcher.observe(document.body, { childList: true, subtree: true });

      // Also periodically check (captions might be enabled later)
      const captionCheckInterval = setInterval(() => {
        if (findAndObserveCaptions()) {
          bodyWatcher.disconnect();
          clearInterval(captionCheckInterval);
        }
      }, 10000);

      // Store for cleanup
      state._bodyWatcher = bodyWatcher;
      state._captionCheckInterval = captionCheckInterval;
    }

    state.captionObserver = captionObserver;
  }

  // ─── Send data to background script ───────────────────────────────
  function notifyBackground(type, data) {
    try {
      chrome.runtime.sendMessage({ type, meetCode: state.meetCode, ...data });
    } catch (e) {
      // Extension context invalidated
    }
  }

  // ─── Build final report ───────────────────────────────────────────
  function buildReport() {
    const endTime = new Date().toISOString();
    const participants = [];

    state.participants.forEach((p) => {
      const firstJoin = p.joinEvents[0] ? new Date(p.joinEvents[0]) : null;
      const lastLeave = p.leaveEvents.length > 0
        ? new Date(p.leaveEvents[p.leaveEvents.length - 1])
        : new Date();

      let totalMs = 0;
      for (let i = 0; i < p.joinEvents.length; i++) {
        const join = new Date(p.joinEvents[i]);
        const leave = i < p.leaveEvents.length ? new Date(p.leaveEvents[i]) : new Date();
        totalMs += leave.getTime() - join.getTime();
      }

      participants.push({
        name: p.name,
        email: p.email,
        joinEvents: p.joinEvents,
        leaveEvents: p.leaveEvents,
        totalDurationMinutes: Math.round(totalMs / 60000),
        spokeInCaptions: state.captionSpeakers.has(p.name),
        speakingSegments: state.captionSpeakers.get(p.name) || 0,
      });
    });

    // Build caption transcript
    let captionTranscript = '';
    if (state.captions.length > 0) {
      captionTranscript = state.captions
        .map(c => `[${c.speaker}]: ${c.text}`)
        .join('\n');
    }

    const startMs = state.startTime ? new Date(state.startTime).getTime() : Date.now();
    const durationMinutes = Math.round((Date.now() - startMs) / 60000);

    return {
      meetCode: state.meetCode,
      title: state.meetTitle || `Meeting ${state.meetCode}`,
      startTime: state.startTime,
      endTime,
      durationMinutes,
      participants,
      captionTranscript: captionTranscript || undefined,
    };
  }

  // ─── Start tracking ───────────────────────────────────────────────
  function startTracking() {
    if (state.isTracking) return;

    state.meetCode = getMeetCode();
    if (!state.meetCode) {
      console.log('[UniConnect] No meet code found, not tracking');
      return;
    }

    state.startTime = new Date().toISOString();
    state.isTracking = true;

    console.log(`[UniConnect] Started tracking meeting: ${state.meetCode}`);
    notifyBackground('tracking_started', { meetCode: state.meetCode });

    // Poll participants every 5 seconds
    state.pollInterval = setInterval(pollParticipants, 5000);
    pollParticipants(); // Initial poll

    // Set up caption tracking
    setupCaptionObserver();

    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'get_status') {
        sendResponse({
          isTracking: state.isTracking,
          meetCode: state.meetCode,
          meetTitle: state.meetTitle,
          participantCount: state.participants.size,
          captionCount: state.captions.length,
          startTime: state.startTime,
        });
      } else if (msg.type === 'stop_and_send') {
        const report = stopTracking();
        sendResponse({ report });
      } else if (msg.type === 'get_report') {
        sendResponse({ report: buildReport() });
      }
      return true; // async response
    });
  }

  // ─── Stop tracking ────────────────────────────────────────────────
  function stopTracking() {
    if (!state.isTracking) return null;

    if (state.pollInterval) {
      clearInterval(state.pollInterval);
      state.pollInterval = null;
    }
    if (state.captionObserver) {
      state.captionObserver.disconnect();
      state.captionObserver = null;
    }
    if (state._bodyWatcher) {
      state._bodyWatcher.disconnect();
      state._bodyWatcher = null;
    }
    if (state._captionCheckInterval) {
      clearInterval(state._captionCheckInterval);
      state._captionCheckInterval = null;
    }

    state.isTracking = false;
    const report = buildReport();

    console.log('[UniConnect] Tracking stopped. Report:', report);

    // Auto-download attendance CSV
    if (report && report.participants && report.participants.length > 0) {
      try {
        const headers = ['Name', 'Join Time', 'Leave Time', 'Duration (min)', 'Spoke', 'Speaking Segments'];
        const rows = report.participants.map(p => [
          p.name,
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
          `Total Participants: ${report.participants.length}`,
          '',
          headers.join(','),
          ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `attendance_${report.meetCode}_${new Date().toISOString().slice(0,10)}.csv`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        console.log('[UniConnect] Attendance CSV auto-downloaded');
      } catch (e) {
        console.error('[UniConnect] CSV download failed:', e);
      }
    }

    notifyBackground('tracking_stopped', { report });

    return report;
  }

  // ─── Auto-start when meeting page loads ───────────────────────────
  // Wait for the meeting to actually start (video/audio elements appear)
  function waitForMeetingStart() {
    const check = () => {
      // Check if we're in an active meeting (not lobby)
      const inMeeting = document.querySelector('[data-self-name]') ||
                        document.querySelector('[data-participant-id]') ||
                        document.querySelector('.p2hjYe'); // "You" indicator

      if (inMeeting) {
        startTracking();
      } else {
        setTimeout(check, 2000);
      }
    };
    check();
  }

  // ─── Cache settings for use during page unload ───────────────────
  // Pre-load settings so we don't need async chrome.storage during beforeunload
  let cachedSettings = { serverUrl: null, authToken: null };
  try {
    chrome.storage.sync.get(['serverUrl', 'authToken'], (settings) => {
      if (settings) cachedSettings = settings;
    });
  } catch (e) {}

  // ─── Detect meeting end ───────────────────────────────────────────
  // When user leaves or meeting ends, auto-send report
  window.addEventListener('beforeunload', () => {
    if (state.isTracking) {
      try {
        const report = buildReport();
        // Send via beacon using cached settings (no async needed)
        if (cachedSettings.serverUrl && cachedSettings.authToken) {
          const url = `${cachedSettings.serverUrl}/api/meetings/extension-report`;
          navigator.sendBeacon(url, JSON.stringify(report));
        }
        // Also save to storage for background script retry
        try {
          chrome.storage.local.set({ pendingReport: report });
        } catch (e) {}
        notifyBackground('meeting_ended', { report });
      } catch (e) {
        // Extension context may be invalidated during unload
      }
    }
  });

  // Start!
  waitForMeetingStart();
})();
