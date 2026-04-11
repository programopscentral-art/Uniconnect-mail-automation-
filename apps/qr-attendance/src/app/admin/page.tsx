export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { StatsCard } from '@/components/StatsCard';

async function getDashboardData() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const todayStr = istNow.toISOString().split('T')[0];
  const today = new Date(todayStr);

  const [
    totalStudents,
    qrGenerated,
    morningCount,
    afternoonCount,
    recentScans,
    slots
  ] = await Promise.all([
    prisma.student.count({ where: { isActive: true } }),
    prisma.student.count({ where: { isActive: true, qrToken: { not: null } } }),
    prisma.attendance.count({
      where: { attendanceDate: today, slot: 'MORNING' }
    }),
    prisma.attendance.count({
      where: { attendanceDate: today, slot: 'AFTERNOON' }
    }),
    prisma.scanLog.findMany({
      take: 10,
      orderBy: { scannedAt: 'desc' },
      include: { student: { select: { name: true, studentId: true } } }
    }),
    prisma.slotConfig.findMany({ where: { isActive: true } })
  ]);

  const hours = istNow.getUTCHours().toString().padStart(2, '0');
  const mins = istNow.getUTCMinutes().toString().padStart(2, '0');
  const timeStr = `${hours}:${mins}`;
  const activeSlot = slots.find((s) => s.startTime <= timeStr && s.endTime > timeStr);

  return { totalStudents, qrGenerated, morningCount, afternoonCount, recentScans, activeSlot, todayStr };
}

const resultColors: Record<string, string> = {
  ACCEPTED: 'text-green-400 bg-green-500/20',
  DUPLICATE: 'text-yellow-400 bg-yellow-500/20',
  INVALID_QR: 'text-red-400 bg-red-500/20',
  UNKNOWN_STUDENT: 'text-red-400 bg-red-500/20',
  OUTSIDE_SLOT: 'text-orange-400 bg-orange-500/20',
  INACTIVE_STUDENT: 'text-gray-400 bg-gray-700'
};

export default async function AdminDashboard() {
  const { totalStudents, qrGenerated, morningCount, afternoonCount, recentScans, activeSlot, todayStr } =
    await getDashboardData();

  const todayDisplay = new Date(todayStr + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">{todayDisplay}</p>
        </div>
        <div className="flex items-center gap-2">
          {activeSlot ? (
            <span className="inline-flex items-center gap-2 bg-green-500/20 border border-green-500/30 text-green-400 px-3 py-1.5 rounded-lg text-sm font-medium">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              {activeSlot.slot} Active ({activeSlot.startTime}–{activeSlot.endTime})
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 bg-gray-700 text-gray-400 px-3 py-1.5 rounded-lg text-sm">
              <span className="w-2 h-2 bg-gray-500 rounded-full" />
              No Active Slot
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          label="Total Students"
          value={totalStudents}
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
          iconBg="bg-blue-500/20"
        />
        <StatsCard
          label="Morning Present"
          value={morningCount}
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
          iconBg="bg-yellow-500/20"
        />
        <StatsCard
          label="Afternoon Present"
          value={afternoonCount}
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          }
          iconBg="bg-orange-500/20"
        />
        <StatsCard
          label="QR Generated"
          value={qrGenerated}
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 3h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          }
          iconBg="bg-indigo-500/20"
        />
      </div>

      {/* Quick links */}
      <div>
        <h2 className="text-sm font-medium text-gray-400 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/admin/students/upload"
            className="bg-gray-900 border border-gray-800 hover:border-indigo-500/50 rounded-xl p-4 flex items-center gap-3 transition-colors group"
          >
            <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-500/30 transition-colors">
              <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <p className="text-white text-sm font-medium">Upload Students</p>
              <p className="text-gray-500 text-xs">Import CSV or Excel</p>
            </div>
          </Link>
          <Link
            href="/admin/qr"
            className="bg-gray-900 border border-gray-800 hover:border-indigo-500/50 rounded-xl p-4 flex items-center gap-3 transition-colors group"
          >
            <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-green-500/30 transition-colors">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 3h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
            <div>
              <p className="text-white text-sm font-medium">Generate QR Codes</p>
              <p className="text-gray-500 text-xs">Create & download QRs</p>
            </div>
          </Link>
          <Link
            href="/admin/attendance"
            className="bg-gray-900 border border-gray-800 hover:border-indigo-500/50 rounded-xl p-4 flex items-center gap-3 transition-colors group"
          >
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/30 transition-colors">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <p className="text-white text-sm font-medium">View Attendance</p>
              <p className="text-gray-500 text-xs">Today&apos;s records</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent scans */}
      <div>
        <h2 className="text-sm font-medium text-gray-400 mb-3">Recent Scan Activity</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {recentScans.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No scans yet today.</div>
          ) : (
            <div className="divide-y divide-gray-800">
              {recentScans.map((log) => (
                <div key={log.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${resultColors[log.result] ?? 'text-gray-400 bg-gray-700'}`}>
                      {log.result}
                    </span>
                    <div>
                      {log.student ? (
                        <p className="text-white text-sm font-medium">{log.student.name}</p>
                      ) : (
                        <p className="text-gray-500 text-sm italic">Unknown</p>
                      )}
                      {log.slot && (
                        <p className="text-gray-500 text-xs">{log.slot}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-gray-500 text-xs">
                    {new Date(log.scannedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
