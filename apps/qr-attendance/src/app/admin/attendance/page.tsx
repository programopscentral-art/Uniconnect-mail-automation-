'use client';



import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface AttendanceRecord {
  id: string;
  attendanceDate: string;
  slot: string;
  scannedAt: string;
  deviceKey: string | null;
  student: {
    studentId: string;
    name: string;
    department: string | null;
  };
}

function getTodayIST(): string {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  return istNow.toISOString().split('T')[0];
}

export default function AttendancePage() {
  const [date, setDate] = useState(getTodayIST());
  const [slot, setSlot] = useState<string>('ALL');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ date });
    if (slot !== 'ALL') params.set('slot', slot);
    const res = await fetch(`/api/admin/attendance?${params}`);
    const data = await res.json();
    setRecords(data.records ?? []);
    setLoading(false);
  }, [date, slot]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  async function exportCSV() {
    setExporting(true);
    const params = new URLSearchParams({ dateFrom: date, dateTo: date });
    if (slot !== 'ALL') params.set('slot', slot);
    const res = await fetch(`/api/admin/attendance/export?${params}`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_${date}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setExporting(false);
  }

  const morningCount = records.filter((r) => r.slot === 'MORNING').length;
  const afternoonCount = records.filter((r) => r.slot === 'AFTERNOON').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Attendance</h1>
          <p className="text-gray-400 text-sm mt-1">Auto-refreshes every 30 seconds</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            disabled={exporting}
            className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <Link
            href="/admin/attendance/export"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Advanced Export
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        />
        <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1 gap-1">
          {['ALL', 'MORNING', 'AFTERNOON'].map((s) => (
            <button
              key={s}
              onClick={() => setSlot(s)}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                slot === s ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          className="text-gray-400 hover:text-white transition-colors p-2"
          title="Refresh"
        >
          <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-gray-400 text-sm">Total Present</span>
          <span className="text-white font-bold text-xl">{records.length}</span>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-blue-400 text-sm">Morning</span>
          <span className="text-blue-400 font-bold text-xl">{morningCount}</span>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-orange-400 text-sm">Afternoon</span>
          <span className="text-orange-400 font-bold text-xl">{afternoonCount}</span>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <svg className="animate-spin h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : records.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-500">No attendance records for this date/slot.</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Student ID</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Dept</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Slot</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Time</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Device</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-indigo-400">{r.student.studentId}</td>
                    <td className="px-4 py-3 text-white font-medium">{r.student.name}</td>
                    <td className="px-4 py-3 text-gray-400">{r.student.department ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex text-xs px-2 py-0.5 rounded font-medium ${
                        r.slot === 'MORNING' ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'
                      }`}>{r.slot}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {new Date(r.scannedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{r.deviceKey ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
