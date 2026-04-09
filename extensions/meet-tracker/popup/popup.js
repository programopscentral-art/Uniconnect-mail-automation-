// ═══════════════════════════════════════════════════════════════════════
// UniConnect Meet Tracker — Popup Script
// ═══════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  // Load saved settings
  const config = await chrome.storage.sync.get(['enabled', 'apiEndpoint', 'authToken']);
  const local = await chrome.storage.local.get(['activeMeeting', 'reportKeys']);

  // Populate fields
  document.getElementById('apiEndpoint').value = config.apiEndpoint || '';
  document.getElementById('authToken').value = config.authToken || '';

  // Toggle state
  const toggle = document.getElementById('enableToggle');
  const isEnabled = config.enabled !== false;
  toggle.classList.toggle('on', isEnabled);

  toggle.addEventListener('click', async () => {
    const newState = !toggle.classList.contains('on');
    toggle.classList.toggle('on', newState);
    await chrome.storage.sync.set({ enabled: newState });
  });

  // Status
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusSub = document.getElementById('statusSub');

  if (local.activeMeeting) {
    statusDot.classList.remove('inactive');
    statusDot.classList.add('active');
    statusText.textContent = 'Tracking Active';
    statusSub.textContent = `${local.activeMeeting.title || local.activeMeeting.meetCode} — since ${new Date(local.activeMeeting.joinedAt).toLocaleTimeString()}`;
  } else if (!config.apiEndpoint) {
    statusDot.classList.remove('inactive');
    statusDot.classList.add('error');
    statusText.textContent = 'Not Configured';
    statusSub.textContent = 'Enter your UniConnect server URL below';
  }

  // Stats
  const reportKeys = local.reportKeys || [];
  document.getElementById('totalMeetings').textContent = reportKeys.length;

  let uploadedCount = 0;
  for (const key of reportKeys) {
    const stored = await chrome.storage.local.get(key);
    if (stored[key]?._uploaded) uploadedCount++;
  }
  document.getElementById('totalReports').textContent = uploadedCount;

  // Save button
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const apiEndpoint = document.getElementById('apiEndpoint').value.trim().replace(/\/$/, '');
    const authToken = document.getElementById('authToken').value.trim();

    await chrome.storage.sync.set({ apiEndpoint, authToken });

    const msg = document.getElementById('savedMsg');
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2000);

    // Update status
    if (apiEndpoint) {
      statusDot.classList.remove('error');
      statusDot.classList.add('inactive');
      statusText.textContent = 'Ready';
      statusSub.textContent = 'Open a Google Meet to start tracking';
    }
  });

  // Download last meeting CSV
  document.getElementById('downloadCsvBtn').addEventListener('click', async () => {
    const { reportKeys = [] } = await chrome.storage.local.get('reportKeys');
    if (reportKeys.length === 0) {
      alert('No meeting reports found.');
      return;
    }

    // Get the most recent report
    const lastKey = reportKeys[reportKeys.length - 1];
    const stored = await chrome.storage.local.get(lastKey);
    const report = stored[lastKey];
    if (!report || !report.participants?.length) {
      alert('Last report has no participant data.');
      return;
    }

    // Build CSV
    const headers = ['Name', 'First Seen', 'Last Seen', 'Join Time', 'Leave Time', 'Duration (min)', 'Spoke', 'Speaking Segments'];
    const rows = report.participants.map(p => [
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
      `Total Participants: ${report.participants.length}`,
      '',
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date(report.startTime).toISOString().slice(0, 10);
    a.href = url;
    a.download = `attendance_${report.meetCode}_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Upload pending reports
  document.getElementById('uploadBtn').addEventListener('click', async () => {
    const config = await chrome.storage.sync.get(['apiEndpoint', 'authToken']);
    if (!config.apiEndpoint || !config.authToken) {
      alert('Please configure the server URL and auth token first.');
      return;
    }

    const { reportKeys = [] } = await chrome.storage.local.get('reportKeys');
    let uploaded = 0;
    let failed = 0;

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
          uploaded++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    alert(`Uploaded: ${uploaded}, Failed: ${failed}`);

    // Refresh stats
    document.getElementById('totalReports').textContent = parseInt(document.getElementById('totalReports').textContent) + uploaded;
  });
});
