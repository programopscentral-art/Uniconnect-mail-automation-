'use client';



import { useEffect, useState } from 'react';

interface QRStats {
  withQR: number;
  withoutQR: number;
  total: number;
}

interface StudentQRRow {
  id: string;
  studentId: string;
  name: string;
  department: string | null;
  qrToken: string | null;
  qrGeneratedAt: string | null;
}

export default function QRPage() {
  const [stats, setStats] = useState<QRStats | null>(null);
  const [students, setStudents] = useState<StudentQRRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [msg, setMsg] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  async function loadData() {
    setLoading(true);
    const res = await fetch('/api/admin/students?limit=200');
    const data = await res.json();
    const all: StudentQRRow[] = data.students ?? [];
    setStudents(all);
    setStats({
      total: data.total ?? all.length,
      withQR: all.filter((s) => s.qrToken).length,
      withoutQR: all.filter((s) => !s.qrToken).length
    });
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function generateAll() {
    setGenerating(true);
    setMsg('');
    const res = await fetch('/api/admin/qr/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    setMsg(`Generated ${data.generated} QR codes.`);
    setGenerating(false);
    loadData();
  }

  async function regenerateSelected() {
    if (selectedIds.size === 0) return;
    setGenerating(true);
    const res = await fetch('/api/admin/qr/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds: [...selectedIds] })
    });
    const data = await res.json();
    setMsg(`Regenerated ${data.generated} QR codes.`);
    setGenerating(false);
    setSelectedIds(new Set());
    loadData();
  }

  async function downloadZip() {
    setDownloading(true);
    const res = await fetch('/api/admin/qr/download/zip');
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr_codes_${new Date().toISOString().split('T')[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setDownloading(false);
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">QR Codes</h1>
        <p className="text-gray-400 text-sm mt-1">Generate and manage student QR codes</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-white">{stats.total}</p>
            <p className="text-gray-400 text-sm mt-1">Total Students</p>
          </div>
          <div className="bg-gray-900 border border-green-800/50 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-green-400">{stats.withQR}</p>
            <p className="text-gray-400 text-sm mt-1">With QR</p>
          </div>
          <div className="bg-gray-900 border border-yellow-800/50 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-yellow-400">{stats.withoutQR}</p>
            <p className="text-gray-400 text-sm mt-1">Without QR</p>
          </div>
        </div>
      )}

      {/* Actions */}
      {msg && (
        <div className="bg-green-500/20 border border-green-500/30 rounded-xl px-4 py-3">
          <p className="text-green-400 text-sm">{msg}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={generateAll}
          disabled={generating || stats?.withoutQR === 0}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          {generating ? (
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : null}
          Generate for All (Without QR)
        </button>
        <button
          onClick={downloadZip}
          disabled={downloading || stats?.withQR === 0}
          className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          {downloading ? (
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
          Download All as ZIP
        </button>
        {selectedIds.size > 0 && (
          <button
            onClick={regenerateSelected}
            disabled={generating}
            className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Regenerate Selected ({selectedIds.size})
          </button>
        )}
      </div>

      {/* Student Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <svg className="animate-spin h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      className="rounded border-gray-600 bg-gray-800 text-indigo-500"
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(new Set(students.map(s => s.id)));
                        else setSelectedIds(new Set());
                      }}
                      checked={selectedIds.size === students.length && students.length > 0}
                    />
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Student ID</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Dept</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">QR Status</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="rounded border-gray-600 bg-gray-800 text-indigo-500"
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggleSelect(s.id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-indigo-400">{s.studentId}</td>
                    <td className="px-4 py-3 text-white font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-gray-400">{s.department ?? '—'}</td>
                    <td className="px-4 py-3">
                      {s.qrToken ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-500/20 px-2 py-0.5 rounded">
                          <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                          Generated
                        </span>
                      ) : (
                        <span className="text-xs text-yellow-400 bg-yellow-500/20 px-2 py-0.5 rounded">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {s.qrToken && (
                          <a
                            href={`/api/admin/qr/student/${s.id}`}
                            download={`qr_${s.studentId}.png`}
                            className="text-xs text-gray-400 hover:text-white transition-colors"
                          >
                            Download
                          </a>
                        )}
                      </div>
                    </td>
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
