'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

interface Student {
  id: string;
  studentId: string;
  name: string;
  email?: string | null;
  department?: string | null;
  batch?: string | null;
  section?: string | null;
  qrToken?: string | null;
  isActive: boolean;
}

export default function StudentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState('');

  const search = searchParams.get('search') ?? '';
  const dept = searchParams.get('dept') ?? '';
  const page = parseInt(searchParams.get('page') ?? '1');

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      search,
      dept,
      page: String(page),
      limit: '100' // Show more for bulk actions
    });

    try {
      const res = await fetch(`/api/admin/students?${params}`);
      const data = await res.json();
      setStudents(data.students ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error('Fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [search, dept, page]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function toggleSelectAll() {
    if (selectedIds.size === students.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(students.map(s => s.id)));
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${selectedIds.size} selected students? This will remove all their records from the database.`)) return;

    setDeleting(true);
    try {
      const res = await fetch('/api/admin/students/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: Array.from(selectedIds) })
      });

      const data = await res.json();
      if (res.ok) {
        setMsg(`Successfully deleted ${selectedIds.size} students`);
        setSelectedIds(new Set());
        fetchStudents();
      } else {
        setMsg(data.error ?? 'Bulk delete failed');
      }
    } catch {
      setMsg('Network error while deleting');
    } finally {
      setDeleting(false);
    }
  }

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const s = formData.get('search') as string;
    const d = formData.get('dept') as string;

    const params = new URLSearchParams();
    if (s) params.set('search', s);
    if (d) params.set('dept', d);
    params.set('page', '1');

    router.push(`/admin/students?${params.toString()}`);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Students</h1>
          <p className="text-gray-400 text-sm mt-1">{total} total students</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-red-500/20 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : `Delete Selected (${selectedIds.size})`}
            </button>
          )}
          <Link
            href="/admin/students/upload"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload CSV
          </Link>
        </div>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-xl text-sm ${msg.includes('Successfully') ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          {msg}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form className="flex flex-col sm:flex-row gap-3 flex-1" onSubmit={handleSearchSubmit}>
          <input
            name="search"
            defaultValue={search}
            placeholder="Search name, ID, or email..."
            className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <button
            type="submit"
            className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all"
          >
            Filter
          </button>
          {(search || dept) && (
            <Link
              href="/admin/students"
              className="bg-gray-900 border border-gray-800 hover:bg-gray-800 text-gray-500 px-4 py-2 rounded-xl text-sm transition-colors text-center flex items-center justify-center font-medium"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-950/50">
                <th className="px-5 py-4 w-10">
                  <input
                    type="checkbox"
                    checked={students.length > 0 && selectedIds.size === students.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th className="px-5 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Student ID</th>
                <th className="px-5 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-5 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Dept/Batch</th>
                <th className="px-5 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">QR</th>
                <th className="px-5 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-500 animate-pulse">Loading students...</td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-400">No students found matches your filters.</td>
                </tr>
              ) : (
                students.map((s) => (
                  <tr key={s.id} className={`hover:bg-gray-800/40 transition-all ${selectedIds.has(s.id) ? 'bg-indigo-500/5' : ''}`}>
                    <td className="px-5 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggleSelect(s.id)}
                        className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-5 py-4 font-mono text-sm text-indigo-400 font-bold">{s.studentId}</td>
                    <td className="px-5 py-4">
                      <div className="text-sm font-bold text-white truncate max-w-[150px]">{s.name}</div>
                      <div className="text-xs text-gray-600 truncate max-w-[150px]">{s.email}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-sm text-gray-300 font-medium">{s.department || '—'}</div>
                      <div className="text-xs text-gray-600">{s.batch} {s.section}</div>
                    </td>
                    <td className="px-5 py-4">
                      {s.qrToken ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                          LIVE
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full">EMPTY</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/admin/students/${s.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 rounded-lg transition-all"
                      >
                        Details
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
