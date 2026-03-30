// UniConnect Meeting Tracker — Background Service Worker

// Listen for messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'tracking_started') {
    console.log(`[UniConnect BG] Tracking started for ${msg.meetCode}`);
    updateBadge('ON', '#4CAF50');
  }

  if (msg.type === 'tracking_stopped' || msg.type === 'meeting_ended') {
    console.log('[UniConnect BG] Meeting ended, sending report...');
    updateBadge('', '#666');

    if (msg.report) {
      sendReportToServer(msg.report);
    }
  }

  if (msg.type === 'status_update') {
    updateBadge(String(msg.currentCount || ''), '#4CAF50');
  }

  if (msg.type === 'participant_joined') {
    console.log(`[UniConnect BG] ${msg.name} joined at ${msg.time}`);
  }

  if (msg.type === 'participant_left') {
    console.log(`[UniConnect BG] ${msg.name} left at ${msg.time}`);
  }
});

// Send report to UniConnect server
async function sendReportToServer(report) {
  try {
    const settings = await chrome.storage.sync.get(['serverUrl', 'authToken']);

    if (!settings.serverUrl || !settings.authToken) {
      console.error('[UniConnect BG] Server URL or auth token not configured');
      // Save as pending for later
      await chrome.storage.local.set({ pendingReport: report });
      return;
    }

    const url = `${settings.serverUrl}/api/meetings/extension-report`;
    console.log(`[UniConnect BG] Sending report to ${url}...`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.authToken}`
      },
      body: JSON.stringify(report)
    });

    if (res.ok) {
      const data = await res.json();
      console.log('[UniConnect BG] Report sent successfully:', data.message);
      // Clear pending report
      await chrome.storage.local.remove('pendingReport');

      // Show notification
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
      setTimeout(() => updateBadge('', '#666'), 3000);
    } else {
      const errText = await res.text();
      console.error(`[UniConnect BG] Server returned ${res.status}: ${errText}`);
      await chrome.storage.local.set({ pendingReport: report, lastError: errText });
    }
  } catch (e) {
    console.error('[UniConnect BG] Failed to send report:', e);
    await chrome.storage.local.set({ pendingReport: report, lastError: e.message });
  }
}

// Retry pending reports
async function retryPending() {
  const { pendingReport } = await chrome.storage.local.get('pendingReport');
  if (pendingReport) {
    console.log('[UniConnect BG] Retrying pending report...');
    await sendReportToServer(pendingReport);
  }
}

// Update badge
function updateBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

// Retry pending on startup
chrome.runtime.onStartup.addListener(retryPending);
chrome.runtime.onInstalled.addListener(retryPending);
