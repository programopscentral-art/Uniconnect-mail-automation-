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
  function getParticipantNames() {
    const names = new Set();

    // Strategy 1: Participant panel (when open)
    // Google Meet uses various selectors; try multiple
    const selectors = [
      '[data-participant-id] [data-self-name]',
      '[data-participant-id]',
      '.zWGUib',  // participant name in sidebar
      '.cS7aqe.NkoVdd', // participant list item
      '[jsname="r4nke"]', // participant name text
    ];

    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        const name = el.textContent?.trim() || el.getAttribute('data-self-name') || '';
        if (name && name.length > 1 && name.length < 60) {
          names.add(name);
        }
      });
      if (names.size > 0) break;
    }

    // Strategy 2: Video tiles (always visible)
    // Names shown on video feed tiles
    document.querySelectorAll('[data-self-name]').forEach(el => {
      const name = el.getAttribute('data-self-name');
      if (name && name.length > 1) names.add(name);
    });

    // Strategy 3: Name labels on video tiles
    document.querySelectorAll('.KV1GEc, .ZjFb7c, .EY8ABd-OWXEXe-TAWMXe').forEach(el => {
      const name = el.textContent?.trim();
      if (name && name.length > 1 && name.length < 60 && !name.includes(':')) {
        names.add(name);
      }
    });

    return names;
  }

  // ─── Get meeting title ────────────────────────────────────────────
  function getMeetTitle() {
    // Try different selectors for meeting title
    const selectors = [
      '[data-meeting-title]',
      '.u6vdEc',
      '.roSPhc',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const title = el.textContent?.trim() || el.getAttribute('data-meeting-title');
        if (title && title.length > 0) return title;
      }
    }
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
  function setupCaptionObserver() {
    // Observe caption container for new captions
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          // Captions typically have a speaker name and text
          const speakerEl = node.querySelector('.zs7s8d, .TBMuR, [jsname="tgaKEf"]');
          const textEl = node.querySelector('.iTTPOb, .bj4p3b, [jsname="YS0Rig"]');

          let speaker = speakerEl?.textContent?.trim();
          const text = textEl?.textContent?.trim() || node.textContent?.trim();

          if (text && text.length > 0) {
            if (speaker) {
              state.captionSpeakers.set(speaker, (state.captionSpeakers.get(speaker) || 0) + 1);
              // Update participant speaking data
              if (state.participants.has(speaker)) {
                const p = state.participants.get(speaker);
                p.spokeInCaptions = true;
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

    // Try to find the caption container
    const captionContainers = document.querySelectorAll('.a4cQT, .iOzk7, [jsname="dsyhDe"]');
    captionContainers.forEach(container => {
      observer.observe(container, { childList: true, subtree: true });
    });

    // Also observe body for caption container being added
    observer.observe(document.body, { childList: true, subtree: true });

    state.captionObserver = observer;
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

    state.isTracking = false;
    const report = buildReport();

    console.log('[UniConnect] Tracking stopped. Report:', report);
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

  // ─── Detect meeting end ───────────────────────────────────────────
  // When user leaves or meeting ends, auto-send report
  window.addEventListener('beforeunload', () => {
    if (state.isTracking) {
      const report = buildReport();
      // Send via beacon (survives page unload)
      chrome.storage.sync.get(['serverUrl', 'authToken'], (settings) => {
        if (settings.serverUrl && settings.authToken) {
          const url = `${settings.serverUrl}/api/meetings/extension-report`;
          navigator.sendBeacon(url, JSON.stringify(report));
        }
      });
      // Also save to storage for background script
      chrome.storage.local.set({ pendingReport: report });
      notifyBackground('meeting_ended', { report });
    }
  });

  // Start!
  waitForMeetingStart();
})();
