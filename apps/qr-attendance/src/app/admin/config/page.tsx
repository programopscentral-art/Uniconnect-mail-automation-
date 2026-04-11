'use client';

import { useEffect, useState } from 'react';

interface SlotConfig {
  id: string;
  slot: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export default function ConfigPage() {
  const [slots, setSlots] = useState<SlotConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [edits, setEdits] = useState<Record<string, { startTime: string; endTime: string }>>({});

  useEffect(() => {
    fetch('/api/admin/config/slots')
      .then((r) => r.json())
      .then((data) => {
        setSlots(data.slots ?? []);
        const init: Record<string, { startTime: string; endTime: string }> = {};
        (data.slots ?? []).forEach((s: SlotConfig) => {
          init[s.slot] = { startTime: s.startTime, endTime: s.endTime };
        });
        setEdits(init);
        setLoading(false);
      });
  }, []);

  async function handleSave(slot: string) {
    setSaving(slot);
    setMsg('');
    const res = await fetch('/api/admin/config/slots', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slot,
        startTime: edits[slot]?.startTime,
        endTime: edits[slot]?.endTime
      })
    });
    const data = await res.json();
    if (res.ok) {
      setSlots((prev) => prev.map((s) => s.slot === slot ? data.slot : s));
      setMsg(`${slot} slot updated successfully.`);
    } else {
      setMsg(data.error ?? 'Failed to save.');
    }
    setSaving(null);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <svg className="animate-spin h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Configuration</h1>
        <p className="text-gray-400 text-sm mt-1">Manage slot timings and system settings</p>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-xl text-sm ${msg.includes('success') ? 'bg-green-500/20 border border-green-500/30 text-green-400' : 'bg-red-500/20 border border-red-500/30 text-red-400'}`}>
          {msg}
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-white font-semibold">Attendance Slots</h2>
        {slots.map((slot) => (
          <div key={slot.slot} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                  slot.slot === 'MORNING' ? 'text-blue-400' : 'text-orange-400'
                }`}>
                  {slot.slot === 'MORNING' ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  )}
                  {slot.slot}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ${slot.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-500'}`}>
                  {slot.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="text-gray-400 text-sm">
                Current: {slot.startTime} – {slot.endTime}
              </p>
            </div>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Start Time</label>
                <input
                  type="time"
                  value={edits[slot.slot]?.startTime ?? slot.startTime}
                  onChange={(e) => setEdits((prev) => ({
                    ...prev,
                    [slot.slot]: { ...prev[slot.slot], startTime: e.target.value }
                  }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">End Time</label>
                <input
                  type="time"
                  value={edits[slot.slot]?.endTime ?? slot.endTime}
                  onChange={(e) => setEdits((prev) => ({
                    ...prev,
                    [slot.slot]: { ...prev[slot.slot], endTime: e.target.value }
                  }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>
              <button
                onClick={() => handleSave(slot.slot)}
                disabled={saving === slot.slot}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
              >
                {saving === slot.slot ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-white text-sm font-medium">About Slot Detection</p>
            <p className="text-gray-400 text-xs mt-1">
              The system uses IST (UTC+5:30) to determine the active slot. Scans outside any configured slot window will be rejected with an OUTSIDE_SLOT result.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
