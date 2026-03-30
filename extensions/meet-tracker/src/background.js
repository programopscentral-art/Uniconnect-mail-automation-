// ═══════════════════════════════════════════════════════════════════════
// UniConnect Meet Tracker — Background Service Worker
// Handles API communication and data persistence
// ═══════════════════════════════════════════════════════════════════════

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MEETING_STARTED') {
    handleMeetingStarted(message.data);
  } else if (message.type === 'MEETING_ENDED') {
    handleMeetingEnded(message.data);
  }
  return true;
});

async function handleMeetingStarted(data) {
  console.log('[UniConnect BG] Meeting started:', data.meetCode);

  // Update badge
  chrome.action.setBadgeText({ text: 'REC' });
  chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });

  // Store active meeting
  await chrome.storage.local.set({
    activeMeeting: {
      meetCode: data.meetCode,
      title: data.title,
      joinedAt: data.joinedAt
    }
  });
}

async function handleMeetingEnded(report) {
  console.log('[UniConnect BG] Meeting ended. Participants:', report.participants?.length);

  // Clear active meeting
  await chrome.storage.local.remove('activeMeeting');
  chrome.action.setBadgeText({ text: '' });

  // Get API config
  const config = await chrome.storage.sync.get(['apiEndpoint', 'authToken']);

  if (!config.apiEndpoint || !config.authToken) {
    console.warn('[UniConnect BG] API not configured. Report saved locally only.');
    await saveReportLocally(report);
    return;
  }

  // Send to UniConnect API
  try {
    const response = await fetch(`${config.apiEndpoint}/api/meetings/extension-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.authToken}`
      },
      body: JSON.stringify(report)
    });

    if (response.ok) {
      const result = await response.json();
      console.log('[UniConnect BG] Report sent successfully:', result);

      // Mark as uploaded
      report._uploaded = true;
      report._uploadedAt = new Date().toISOString();
      await saveReportLocally(report);
    } else {
      const errorText = await response.text();
      console.error('[UniConnect BG] API error:', response.status, errorText);
      await saveReportLocally(report);
      scheduleRetry(report);
    }
  } catch (err) {
    console.error('[UniConnect BG] Failed to send report:', err);
    await saveReportLocally(report);
    scheduleRetry(report);
  }
}

async function saveReportLocally(report) {
  const key = `report_${report.meetCode}_${Date.now()}`;
  await chrome.storage.local.set({ [key]: report });

  // Keep track of all report keys
  const { reportKeys = [] } = await chrome.storage.local.get('reportKeys');
  reportKeys.push(key);

  // Keep only last 50 reports
  if (reportKeys.length > 50) {
    const toRemove = reportKeys.splice(0, reportKeys.length - 50);
    await chrome.storage.local.remove(toRemove);
  }

  await chrome.storage.local.set({ reportKeys });
}

function scheduleRetry(report) {
  // Retry sending after 5 minutes
  chrome.alarms.create('retryUpload', { delayInMinutes: 5 });
}

// Retry failed uploads
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'retryUpload') {
    const config = await chrome.storage.sync.get(['apiEndpoint', 'authToken']);
    if (!config.apiEndpoint || !config.authToken) return;

    const { reportKeys = [] } = await chrome.storage.local.get('reportKeys');

    for (const key of reportKeys) {
      const stored = await chrome.storage.local.get(key);
      const report = stored[key];
      if (!report || report._uploaded) continue;

      try {
        const response = await fetch(`${config.apiEndpoint}/api/meetings/extension-report`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.authToken}`
          },
          body: JSON.stringify(report)
        });

        if (response.ok) {
          report._uploaded = true;
          report._uploadedAt = new Date().toISOString();
          await chrome.storage.local.set({ [key]: report });
          console.log(`[UniConnect BG] Retry succeeded for ${key}`);
        }
      } catch (err) {
        console.error(`[UniConnect BG] Retry failed for ${key}:`, err);
      }
    }
  }
});

// Extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[UniConnect Meet Tracker] Extension installed!');
    // Set defaults
    chrome.storage.sync.set({
      enabled: true,
      apiEndpoint: '',
      authToken: ''
    });
  }
});
