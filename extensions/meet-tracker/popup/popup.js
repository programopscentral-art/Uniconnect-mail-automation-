// ═══════════════════════════════════════════════════════════════════════
// UniConnect Meet Tracker — Popup Script
// ═══════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  const config = await chrome.storage.sync.get(['enabled', 'apiEndpoint', 'authToken']);
  const local  = await chrome.storage.local.get(['activeMeeting', 'reportKeys', 'activeParticipants']);

  // ── Fields ────────────────────────────────────────────────────────────
  document.getElementById('apiEndpoint').value = config.apiEndpoint || '';
  document.getElementById('authToken').value   = config.authToken   || '';

  // ── Toggle ────────────────────────────────────────────────────────────
  const toggle    = document.getElementById('enableToggle');
  const isEnabled = config.enabled !== false;
  toggle.classList.toggle('on', isEnabled);
  toggle.addEventListener('click', async () => {
    const next = !toggle.classList.contains('on');
    toggle.classList.toggle('on', next);
    await chrome.storage.sync.set({ enabled: next });
  });

  // ── Status ────────────────────────────────────────────────────────────
  const statusDot  = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusSub  = document.getElementById('statusSub');

  if (local.activeMeeting) {
    statusDot.classList.replace('inactive', 'active');
    statusText.textContent = 'Tracking Active';
    statusSub.textContent  = `${local.activeMeeting.title || local.activeMeeting.meetCode} — since ${new Date(local.activeMeeting.joinedAt).toLocaleTimeString()}`;
  } else if (!config.apiEndpoint) {
    statusDot.classList.remove('inactive');
    statusDot.classList.add('error');
    statusText.textContent = 'Not Configured';
    statusSub.textContent  = 'Enter your UniConnect server URL below';
  }

  // ── Participants (activeParticipants is [{name, speaking}]) ───────────
  const participants = local.activeParticipants || [];
  renderParticipants(participants, !!local.activeMeeting);

  // People count stat
  document.getElementById('peopleCount').textContent = participants.length;

  // ── Stats ─────────────────────────────────────────────────────────────
  const reportKeys = local.reportKeys || [];
  document.getElementById('totalMeetings').textContent = reportKeys.length;

  let uploadedCount = 0;
  for (const key of reportKeys) {
    const stored = await chrome.storage.local.get(key);
    if (stored[key]?._uploaded) uploadedCount++;
  }
  document.getElementById('totalReports').textContent = uploadedCount;

  // ── Save ──────────────────────────────────────────────────────────────
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const apiEndpoint = document.getElementById('apiEndpoint').value.trim().replace(/\/$/, '');
    const authToken   = document.getElementById('authToken').value.trim();
    await chrome.storage.sync.set({ apiEndpoint, authToken });

    const msg = document.getElementById('savedMsg');
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2000);

    if (apiEndpoint) {
      statusDot.classList.remove('error');
      statusDot.classList.add('inactive');
      statusText.textContent = 'Ready';
      statusSub.textContent  = 'Open a Google Meet to start tracking';
    }
  });

  // ── Download last meeting CSV ─────────────────────────────────────────
  document.getElementById('downloadCsvBtn').addEventListener('click', async () => {
    const { reportKeys = [] } = await chrome.storage.local.get('reportKeys');
    if (!reportKeys.length) { alert('No meeting reports found.'); return; }

    const lastKey = reportKeys[reportKeys.length - 1];
    const stored  = await chrome.storage.local.get(lastKey);
    const report  = stored[lastKey];
    if (!report?.participants?.length) { alert('Last report has no participant data.'); return; }

    const headers = ['Name', 'First Seen', 'Last Seen', 'Join Time', 'Leave Time', 'Duration (min)', 'Spoke', 'Speaking Segments'];
    const rows = report.participants.map(p => [
      p.name,
      p.firstSeen  ? new Date(p.firstSeen).toLocaleString()  : '',
      p.lastSeen   ? new Date(p.lastSeen).toLocaleString()   : '',
      p.joinEvents?.[0]                  ? new Date(p.joinEvents[0]).toLocaleString()                                  : '',
      p.leaveEvents?.length              ? new Date(p.leaveEvents[p.leaveEvents.length - 1]).toLocaleString()          : '',
      p.totalDurationMinutes || 0,
      p.spokeInCaptions ? 'Yes' : 'No',
      p.speakingSegments || 0
    ]);

    const csv = [
      `Meeting: ${report.title || report.meetCode}`,
      `Meet Code: ${report.meetCode}`,
      `Date: ${new Date(report.startTime).toLocaleDateString()}`,
      `Start: ${new Date(report.startTime).toLocaleTimeString()}`,
      `End: ${new Date(report.endTime).toLocaleTimeString()}`,
      `Duration: ${report.durationMinutes} minutes`,
      `Total Participants: ${report.participants.length}`,
      '',
      headers.join(','),
      ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const url  = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: `attendance_${report.meetCode}_${new Date(report.startTime).toISOString().slice(0,10)}.csv`
    });
    a.click();
    URL.revokeObjectURL(url);
  });

  // ── Upload pending ─────────────────────────────────────────────────────
  document.getElementById('uploadBtn').addEventListener('click', async () => {
    const cfg = await chrome.storage.sync.get(['apiEndpoint', 'authToken']);
    if (!cfg.apiEndpoint || !cfg.authToken) {
      alert('Please configure the server URL and auth token first.');
      return;
    }

    const { reportKeys = [] } = await chrome.storage.local.get('reportKeys');
    let uploaded = 0, failed = 0;

    for (const key of reportKeys) {
      const stored = await chrome.storage.local.get(key);
      const report = stored[key];
      if (!report || report._uploaded) continue;

      try {
        const res = await fetch(`${cfg.apiEndpoint}/api/meetings/extension-report`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.authToken}` },
          body:    JSON.stringify(report)
        });
        if (res.ok) {
          report._uploaded   = true;
          report._uploadedAt = new Date().toISOString();
          await chrome.storage.local.set({ [key]: report });
          uploaded++;
        } else { failed++; }
      } catch { failed++; }
    }

    alert(`Uploaded: ${uploaded}, Failed: ${failed}`);
    document.getElementById('totalReports').textContent =
      parseInt(document.getElementById('totalReports').textContent) + uploaded;
  });
});

// ── Render participants ────────────────────────────────────────────────
// participants: [{name: string, speaking: boolean}]
function renderParticipants(participants, hasActiveMeeting) {
  const listEl  = document.getElementById('participantList');
  const emptyEl = document.getElementById('participantEmpty');

  // Clear old items (keep the empty placeholder)
  listEl.querySelectorAll('.participant-item').forEach(el => el.remove());

  if (!participants.length) {
    emptyEl.style.display = 'block';
    emptyEl.textContent   = hasActiveMeeting ? 'Detecting participants…' : 'No active meeting';
    return;
  }

  emptyEl.style.display = 'none';

  participants.forEach(({ name, speaking }) => {
    const initial = (name.trim()[0] || '?').toUpperCase();

    const item = document.createElement('div');
    item.className = 'participant-item';
    item.innerHTML = `
      <div class="participant-avatar">${initial}</div>
      <span class="participant-name">${escapeHtml(name)}</span>
      ${speaking ? '<span class="mic-icon" title="Spoke in meeting">🎙</span>' : ''}
    `;
    listEl.appendChild(item);
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
