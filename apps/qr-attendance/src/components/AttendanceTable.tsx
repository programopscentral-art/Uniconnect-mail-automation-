import { ReactNode } from 'react';

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName: string;
  department?: string | null;
  slot: string;
  scannedAt: string | Date;
  deviceKey?: string | null;
  status: string;
}

interface AttendanceTableProps {
  records: AttendanceRecord[];
  actions?: (record: AttendanceRecord) => ReactNode;
  emptyMessage?: string;
}

function formatTime(dt: string | Date) {
  const d = typeof dt === 'string' ? new Date(dt) : dt;
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function AttendanceTable({ records, actions, emptyMessage = 'No attendance records found.' }: AttendanceTableProps) {
  if (records.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
        <svg className="w-12 h-12 text-gray-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Student ID</th>
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Name</th>
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Dept</th>
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Slot</th>
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Time</th>
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Device</th>
              {actions && <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {records.map((record) => (
              <tr key={record.id} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3 text-sm font-mono text-indigo-400">{record.studentId}</td>
                <td className="px-4 py-3 text-sm text-white font-medium">{record.studentName}</td>
                <td className="px-4 py-3 text-sm text-gray-400">{record.department ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    record.slot === 'MORNING'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-orange-500/20 text-orange-400'
                  }`}>
                    {record.slot}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">{formatTime(record.scannedAt)}</td>
                <td className="px-4 py-3 text-sm text-gray-500 font-mono text-xs">{record.deviceKey ?? '—'}</td>
                {actions && (
                  <td className="px-4 py-3 text-right">{actions(record)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
