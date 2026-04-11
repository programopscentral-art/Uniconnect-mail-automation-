'use client';

import { useRef, useState, DragEvent, ChangeEvent } from 'react';

interface UploadZoneProps {
  onFile: (file: File) => void;
  accept?: string;
  label?: string;
}

const ALLOWED_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain'
];

export function UploadZone({ onFile, accept = '.csv,.xlsx,.xls', label = 'Drop CSV or Excel file here' }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  function validateFile(file: File): boolean {
    const isValid =
      ALLOWED_TYPES.includes(file.type) ||
      file.name.endsWith('.csv') ||
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls');

    if (!isValid) {
      setError('Only CSV and Excel files are supported.');
      return false;
    }
    setError('');
    return true;
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && validateFile(file)) {
      onFile(file);
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      onFile(file);
    }
    e.target.value = '';
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/50'
        }`}
      >
        <svg className={`w-12 h-12 mx-auto mb-4 ${dragging ? 'text-indigo-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-gray-300 font-medium">{label}</p>
        <p className="text-gray-500 text-sm mt-1">or click to browse</p>
        <p className="text-gray-600 text-xs mt-2">Supports: CSV, XLSX, XLS</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
        />
      </div>
      {error && (
        <p className="mt-2 text-red-400 text-sm">{error}</p>
      )}
    </div>
  );
}
