'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Student {
  id: string;
  studentId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  batch?: string | null;
  section?: string | null;
  qrToken?: string | null;
  qrGeneratedAt?: string | null;
  isActive: boolean;
  createdAt: string;
}

interface AttendanceRecord {
  id: string;
  attendanceDate: string;
  slot: string;
  scannedAt: string;
  deviceKey?: string | null;
}

export default function StudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [student, setStudent] = useState<Student | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState<Partial<Student>>({});
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch(`/api/admin/students/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setStudent(data.student);
        setAttendance(data.attendance ?? []);
        setEditData(data.student);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    setSaving(true);
    setMsg('');
    const res = await fetch(`/api/admin/students/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editData.name,
        email: editData.email,
        phone: editData.phone,
        department: editData.department,
        batch: editData.batch,
        section: editData.section
      })
    });
    const data = await res.json();
    if (res.ok) {
      setStudent(data.student);
      setEditing(false);
      setMsg('Saved successfully');
    } else {
      setMsg(data.error ?? 'Save failed');
    }
    setSaving(false);
  }

  async function toggleActive() {
    const res = await fetch(`/api/admin/students/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !student?.isActive })
    });
    const data = await res.json();
    if (res.ok) setStudent(data.student);
  }

  async function generateQR() {
    await fetch('/api/admin/qr/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds: [id] })
    });
    window.location.reload();
  }

  async function deleteStudent() {
    if (!confirm('Are you sure you want to PERMANENTLY delete this student and all their attendance history? This cannot be undone.')) return;

    const res = await fetch(`/api/admin/students/${id}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/admin/students');
    } else {
      const data = await res.json();
      setMsg(data.error ?? 'Delete failed');
    }
  }

  async function deleteAttendance(recordId: string) {
    if (!confirm('Delete this attendance record?')) return;

    const res = await fetch(`/api/admin/attendance/${recordId}`, { method: 'DELETE' });
    if (res.ok) {
      setAttendance(attendance.filter(a => a.id !== recordId));
      setMsg('Record deleted');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="animate-spin h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400">Student not found.</p>
        <Link href="/admin/students" className="text-indigo-400 mt-4 inline-block">Back to Students</Link>
      </div>
    );
  }

  const field = (label: string, key: keyof Student) => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {editing ? (
        <input
          value={(editData[key] as string) ?? ''}
          onChange={(e) => setEditData((d) => ({ ...d, [key]: e.target.value }))}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      ) : (
        <p className="text-white text-sm">{(student[key] as string) ?? '—'}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/students" className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">{student.name}</h1>
            <p className="text-gray-400 text-sm font-mono">{student.studentId}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleActive}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${student.isActive
                ? 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20'
                : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
              }`}
          >
            {student.isActive ? 'Deactivate' : 'Reactivate'}
          </button>
          <button
            onClick={deleteStudent}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
          >
            Delete Student
          </button>
        </div>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm ${msg.includes('success') || msg.includes('deleted') ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Student Info */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">Student Information</h2>
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => { setEditing(false); setEditData(student); }}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field('Full Name', 'name')}
            {field('Email', 'email')}
            {field('Phone', 'phone')}
            {field('Department', 'department')}
            {field('Batch', 'batch')}
            {field('Section', 'section')}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <span className={`inline-block text-xs px-2 py-1 rounded-full ${student.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {student.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Joined</label>
              <p className="text-white text-sm">{new Date(student.createdAt).toLocaleDateString('en-IN')}</p>
            </div>
          </div>
        </div>

        {/* QR Code */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col items-center gap-4">
          <h2 className="text-white font-semibold self-start">QR Code</h2>
          {student.qrToken ? (
            <>
              <div className="bg-white p-3 rounded-xl">
                <img
                  src={`/api/admin/qr/student/${id}`}
                  alt={`QR for ${student.name}`}
                  width={160}
                  height={160}
                  className="block"
                />
              </div>
              <a
                href={`/api/admin/qr/student/${id}`}
                download={`qr_${student.studentId}.png`}
                className="w-full text-center bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Download QR
              </a>
              {student.qrGeneratedAt && (
                <p className="text-gray-500 text-xs text-center">
                  Generated {new Date(student.qrGeneratedAt).toLocaleDateString('en-IN')}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="bg-gray-800 rounded-xl w-40 h-40 flex items-center justify-center">
                <svg className="w-16 h-16 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 3h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </div>
              <button
                onClick={generateQR}
                className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Generate QR
              </button>
            </>
          )}
        </div>
      </div>

      {/* Attendance History */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">Attendance History (Last 30 days)</h2>
        </div>
        {attendance.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">No attendance records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Date</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Slot</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Time</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Device</th>
                  <th className="text-right text-xs font-medium text-gray-400 px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {attendance.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-800/50">
                    <td className="px-5 py-3 text-white">{new Date(a.attendanceDate).toLocaleDateString('en-IN')}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex text-xs px-2 py-0.5 rounded font-medium ${a.slot === 'MORNING' ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'
                        }`}>{a.slot}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-400">
                      {new Date(a.scannedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-5 py-3 text-gray-500 font-mono text-xs">{a.deviceKey ?? '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => deleteAttendance(a.id)}
                        className="text-gray-500 hover:text-red-400 transition-colors p-1"
                        title="Delete record"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
