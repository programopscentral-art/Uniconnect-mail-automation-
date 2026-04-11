'use client';



import { useState } from 'react';
import { UploadZone } from '@/components/UploadZone';

interface UploadResult {
  inserted: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

interface PreviewRow {
  name: string;
  email?: string;
  department?: string;
  batch?: string;
  section?: string;
  studentId?: string;
}

function downloadTemplate() {
  const csv = 'name,email,phone,department,batch,section,student_id\nJohn Doe,john@example.com,9876543210,Computer Science,2024,A,B20240001\nJane Smith,jane@example.com,9876543211,Electronics,2024,B,\n';
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'students_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');

  async function handleFile(f: File) {
    setFile(f);
    setResult(null);
    setError('');

    // For CSV, show preview
    if (f.name.endsWith('.csv')) {
      const text = await f.text();
      const lines = text.split('\n').filter(Boolean);
      if (lines.length < 2) return;
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const rows = lines.slice(1, 6).map((line) => {
        const vals = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
        return {
          name: row.name ?? row.student_name ?? '',
          email: row.email,
          department: row.department ?? row.dept,
          batch: row.batch,
          section: row.section,
          studentId: row.student_id ?? row.studentid
        } as PreviewRow;
      });
      setPreview(rows);
    } else {
      setPreview([]);
    }
  }

  async function handleSubmit() {
    if (!file) return;
    setUploading(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/admin/students/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Upload failed');
      } else {
        setResult(data);
        setFile(null);
        setPreview([]);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Upload Students</h1>
        <p className="text-gray-400 text-sm mt-1">Import students from a CSV or Excel file</p>
      </div>

      {/* Template download */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-white text-sm font-medium">Download Template</p>
          <p className="text-gray-500 text-xs mt-0.5">CSV with required columns: name, email, phone, department, batch, section, student_id</p>
        </div>
        <button
          onClick={downloadTemplate}
          className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Template
        </button>
      </div>

      {/* Upload zone */}
      <UploadZone onFile={handleFile} />

      {/* Preview */}
      {preview.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-white text-sm font-medium">Preview (first 5 rows)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Name', 'Email', 'Dept', 'Batch', 'Section', 'Student ID'].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-gray-400 px-4 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {preview.map((row, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-white">{row.name || '—'}</td>
                    <td className="px-4 py-2 text-gray-400">{row.email || '—'}</td>
                    <td className="px-4 py-2 text-gray-400">{row.department || '—'}</td>
                    <td className="px-4 py-2 text-gray-400">{row.batch || '—'}</td>
                    <td className="px-4 py-2 text-gray-400">{row.section || '—'}</td>
                    <td className="px-4 py-2 text-gray-400 font-mono text-xs">{row.studentId || '(auto)'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* File selected indicator */}
      {file && (
        <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div>
              <p className="text-white text-sm font-medium">{file.name}</p>
              <p className="text-gray-500 text-xs">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={uploading}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {uploading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Uploading...
              </>
            ) : (
              'Upload & Import'
            )}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-xl px-4 py-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h3 className="text-white font-semibold">Import Results</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-400">{result.inserted}</p>
              <p className="text-xs text-green-400/70 mt-1">Inserted</p>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-yellow-400">{result.skipped}</p>
              <p className="text-xs text-yellow-400/70 mt-1">Skipped</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-red-400">{result.errors.length}</p>
              <p className="text-xs text-red-400/70 mt-1">Errors</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div>
              <p className="text-gray-400 text-sm font-medium mb-2">Errors:</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <div key={i} className="bg-red-500/10 border border-red-500/20 rounded px-3 py-1.5 text-xs text-red-400">
                    Row {e.row}: {e.reason}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
