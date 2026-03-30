// UniConnect Meeting Tracker — Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusSub = document.getElementById('statusSub');
  const statsSection = document.getElementById('statsSection');
  const participantsSection = document.getElementById('participantsSection');
  const participantsList = document.getElementById('participantsList');
  const actionsSection = document.getElementById('actionsSection');
  const participantCount = document.getElementById('participantCount');
  const captionCount = document.getElementById('captionCount');
  const serverUrlInput = document.getElementById('serverUrl');
  const authTokenInput = document.getElementById('authToken');
  const saveBtn = document.getElementById('saveBtn');
  const sendNowBtn = document.getElementById('sendNowBtn');
  const stopBtn = document.getElementById('stopBtn');
  const settingsMsg = document.getElementById('settingsMsg');

  // Load saved settings
  const settings = await chrome.storage.sync.get(['serverUrl', 'authToken']);
  if (settings.serverUrl) serverUrlInput.value = settings.serverUrl;
  if (settings.authToken) authTokenInput.value = settings.authToken;

  // Save settings
  saveBtn.addEventListener('click', async () => {
    const serverUrl = serverUrlInput.value.trim().replace(/\/$/, '');
    const authToken = authTokenInput.value.trim();

    if (!serverUrl) {
      showMsg('error', 'Server URL is required');
      return;
    }

    await chrome.storage.sync.set({ serverUrl, authToken });
    showMsg('success', 'Settings saved!');

    // Test connection
    try {
      const res = await fetch(`${serverUrl}/api/health`);
      if (res.ok) {
        showMsg('success', 'Settings saved! Server connection verified.');
      } else {
        showMsg('error', `Settings saved but server returned ${res.status}`);
      }
    } catch (e) {
      showMsg('error', 'Settings saved but could not reach server');
    }
  });

  // Check if currently in a meeting tab
  async function checkStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url?.includes('meet.google.com/')) {
        setInactive();
        return;
      }

      // Ask content script for status
      chrome.tabs.sendMessage(tab.id, { type: 'get_status' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          setInactive();
          return;
        }

        if (response.isTracking) {
          setActive(response);
        } else {
          statusDot.className = 'status-dot inactive';
          statusText.textContent = 'On Google Meet page';
          statusSub.textContent = 'Waiting for meeting to start...';
        }
      });
    } catch (e) {
      setInactive();
    }
  }

  function setInactive() {
    statusDot.className = 'status-dot inactive';
    statusText.textContent = 'Not in a meeting';
    statusSub.textContent = 'Open a Google Meet to start tracking';
    statsSection.style.display = 'none';
    participantsSection.style.display = 'none';
    actionsSection.style.display = 'none';
  }

  function setActive(data) {
    statusDot.className = 'status-dot active';
    statusText.textContent = data.meetTitle || `Meeting: ${data.meetCode}`;

    const elapsed = data.startTime ? Math.round((Date.now() - new Date(data.startTime).getTime()) / 60000) : 0;
    statusSub.textContent = `Tracking for ${elapsed} min`;

    statsSection.style.display = '';
    actionsSection.style.display = '';
    participantCount.textContent = data.participantCount || 0;
    captionCount.textContent = data.captionCount || 0;

    // Load participant list
    loadParticipants();
  }

  async function loadParticipants() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      chrome.tabs.sendMessage(tab.id, { type: 'get_report' }, (response) => {
        if (!response?.report?.participants) return;

        participantsSection.style.display = '';
        participantsList.innerHTML = '';

        response.report.participants.forEach(p => {
          const div = document.createElement('div');
          div.className = 'participant';
          const initial = p.name.charAt(0).toUpperCase();
          div.innerHTML = `
            <div class="avatar">${initial}</div>
            <div>
              <div class="name">${escapeHtml(p.name)}</div>
              <div class="meta">${p.totalDurationMinutes || 0}m${p.spokeInCaptions ? ' • Spoke' : ''}</div>
            </div>
          `;
          participantsList.appendChild(div);
        });
      });
    } catch (e) {}
  }

  // Send report now
  sendNowBtn.addEventListener('click', async () => {
    const settings = await chrome.storage.sync.get(['serverUrl', 'authToken']);
    if (!settings.serverUrl || !settings.authToken) {
      showMsg('error', 'Configure server URL and auth token first');
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      sendNowBtn.textContent = 'Sending...';
      sendNowBtn.disabled = true;

      chrome.tabs.sendMessage(tab.id, { type: 'get_report' }, async (response) => {
        if (!response?.report) {
          showMsg('error', 'No report data available');
          sendNowBtn.textContent = 'Send Report Now';
          sendNowBtn.disabled = false;
          return;
        }

        try {
          const res = await fetch(`${settings.serverUrl}/api/meetings/extension-report`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${settings.authToken}`
            },
            body: JSON.stringify(response.report)
          });

          if (res.ok) {
            const data = await res.json();
            showMsg('success', `Report sent! ${data.message}`);
          } else {
            const err = await res.text();
            showMsg('error', `Failed: ${err}`);
          }
        } catch (e) {
          showMsg('error', `Network error: ${e.message}`);
        }

        sendNowBtn.textContent = 'Send Report Now';
        sendNowBtn.disabled = false;
      });
    } catch (e) {
      showMsg('error', e.message);
    }
  });

  // Stop tracking
  stopBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      chrome.tabs.sendMessage(tab.id, { type: 'stop_and_send' }, () => {
        setInactive();
        showMsg('success', 'Tracking stopped. Report saved.');
      });
    } catch (e) {}
  });

  function showMsg(type, text) {
    settingsMsg.className = type;
    settingsMsg.textContent = text;
    setTimeout(() => { settingsMsg.textContent = ''; settingsMsg.className = ''; }, 5000);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Check status immediately and every 3 seconds
  checkStatus();
  setInterval(checkStatus, 3000);
});
