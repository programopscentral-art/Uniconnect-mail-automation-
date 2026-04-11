'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

type ScanResult = 'ACCEPTED' | 'DUPLICATE' | 'INVALID_QR' | 'UNKNOWN_STUDENT' | 'OUTSIDE_SLOT' | 'INACTIVE_STUDENT' | 'ERROR';

interface ScanResponse {
  result: ScanResult;
  message?: string;
  student?: { studentId: string; name: string; department: string | null };
  slot?: string;
  date?: string;
  scannedAt?: string;
  firstMarkedAt?: string;
  error?: string;
}

interface SlotStatus {
  activeSlot: { slot: string; startTime: string; endTime: string } | null;
  morningCount: number;
  afternoonCount: number;
}

const RESULT_CONFIG: Record<ScanResult, { bg: string; border: string; text: string; label: string }> = {
  ACCEPTED: { bg: 'bg-green-500/20', border: 'border-green-500', text: 'text-green-300', label: 'PRESENT' },
  DUPLICATE: { bg: 'bg-yellow-500/20', border: 'border-yellow-500', text: 'text-yellow-300', label: 'ALREADY MARKED' },
  INVALID_QR: { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-300', label: 'INVALID QR' },
  UNKNOWN_STUDENT: { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-300', label: 'UNKNOWN' },
  OUTSIDE_SLOT: { bg: 'bg-orange-500/20', border: 'border-orange-500', text: 'text-orange-300', label: 'OUTSIDE SLOT' },
  INACTIVE_STUDENT: { bg: 'bg-gray-600/40', border: 'border-gray-500', text: 'text-gray-300', label: 'INACTIVE' },
  ERROR: { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-300', label: 'ERROR' }
};

export default function ScanPage() {
  const [deviceKey, setDeviceKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [deviceKeyInput, setDeviceKeyInput] = useState('');
  const [lastResult, setLastResult] = useState<ScanResponse | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [slotStatus, setSlotStatus] = useState<SlotStatus | null>(null);
  const [currentTime, setCurrentTime] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [processing, setProcessing] = useState(false);

  const scannerRef = useRef<any>(null);
  const processingRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hidBufferRef = useRef('');
  const hidTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const processQR = useCallback(async (payload: string) => {
    if (processingRef.current || !payload.trim()) return;
    if (!deviceKey) {
      setShowSettings(true);
      return;
    }

    processingRef.current = true;
    setProcessing(true);

    try {
      const res = await fetch('/api/scan/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_payload: payload.trim(), device_key: deviceKey })
      });
      const data: ScanResponse = await res.json();
      setLastResult(res.ok ? data : { result: 'ERROR', message: data.error ?? 'Server error' });
      setShowResult(true);

      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => {
        setShowResult(false);
        setLastResult(null);
        processingRef.current = false;
        setProcessing(false);
      }, 2500);
    } catch {
      setLastResult({ result: 'ERROR', message: 'Network error. Check connection.' });
      setShowResult(true);
      resetTimerRef.current = setTimeout(() => {
        setShowResult(false);
        setLastResult(null);
        processingRef.current = false;
        setProcessing(false);
      }, 2500);
    }
  }, [deviceKey]);

  // Load device key from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('qr_device_key');
    if (stored) {
      setDeviceKey(stored);
      setDeviceKeyInput(stored);
    } else {
      setDeviceKey('default-scanner');
      setDeviceKeyInput('default-scanner');
    }
  }, []);

  // Auto-scan if token is in URL (e.g. from phone camera scan redirected to here)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token && deviceKey && !processingRef.current) {
      processQR(token);
      // Clean up URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [deviceKey, processQR]);

  // Clock
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch slot status
  const fetchSlotStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/scan/status');
      const data = await res.json();
      setSlotStatus(data);
    } catch { }
  }, []);

  useEffect(() => {
    fetchSlotStatus();
    const t = setInterval(fetchSlotStatus, 30000);
    return () => clearInterval(t);
  }, [fetchSlotStatus]);

  // Camera scanner
  useEffect(() => {
    if (!deviceKey) return;

    let mounted = true;
    let scanner: any = null;

    import('html5-qrcode').then(({ Html5QrcodeScanner }) => {
      if (!mounted) return;

      const onScanSuccess = (decodedText: string) => {
        if (!processingRef.current) {
          processQR(decodedText);
        }
      };

      try {
        const s = new Html5QrcodeScanner(
          'qr-reader',
          { fps: 15, qrbox: { width: 280, height: 280 }, rememberLastUsedCamera: true },
          false
        );
        s.render(onScanSuccess, () => { });
        scanner = s;
        scannerRef.current = s;
      } catch (err) {
        console.warn('Scanner init error:', err);
      }
    }).catch((err) => {
      console.warn('html5-qrcode load error:', err);
    });

    return () => {
      mounted = false;
      if (scanner) {
        scanner.clear().catch(() => { });
      }
    };
  }, [deviceKey, processQR]);

  // USB HID keyboard scanner handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'Enter') {
        const buf = hidBufferRef.current.trim();
        if (buf.length >= 8) {
          processQR(buf);
        }
        hidBufferRef.current = '';
        if (hidTimerRef.current) clearTimeout(hidTimerRef.current);
      } else if (e.key.length === 1) {
        hidBufferRef.current += e.key;
        if (hidTimerRef.current) clearTimeout(hidTimerRef.current);
        hidTimerRef.current = setTimeout(() => {
          hidBufferRef.current = '';
        }, 200);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [processQR]);

  const saveDeviceKey = () => {
    const key = deviceKeyInput.trim();
    if (!key) return;
    setDeviceKey(key);
    localStorage.setItem('qr_device_key', key);
    setShowSettings(false);
  };

  const cfg = lastResult ? RESULT_CONFIG[lastResult.result] : null;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col text-gray-100">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-white font-bold text-lg leading-tight">{currentTime}</p>
            <p className="text-gray-500 text-xs">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          </div>
          <div className="h-8 w-px bg-gray-800" />
          {slotStatus?.activeSlot ? (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <div>
                <p className="text-green-400 font-semibold text-sm">{slotStatus.activeSlot.slot}</p>
                <p className="text-gray-500 text-xs">{slotStatus.activeSlot.startTime}–{slotStatus.activeSlot.endTime}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-gray-600 rounded-full" />
              <p className="text-gray-500 text-sm">No Active Slot</p>
            </div>
          )}
          {slotStatus && (
            <>
              <div className="h-8 w-px bg-gray-800 hidden sm:block" />
              <div className="hidden sm:flex items-center gap-3 text-sm">
                <span className="text-blue-400 font-medium">AM: {slotStatus.morningCount}</span>
                <span className="text-orange-400 font-medium">PM: {slotStatus.afternoonCount}</span>
              </div>
            </>
          )}
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6 relative overflow-hidden">
        {/* Result overlay */}
        {showResult && lastResult && cfg && (
          <div className={`absolute inset-0 z-20 flex items-center justify-center p-8 ${cfg.bg} backdrop-blur-sm transition-all duration-300`}>
            <div className={`text-center max-w-md w-full border-2 ${cfg.border} rounded-3xl p-8 bg-gray-950/95 shadow-2xl scale-100 animate-in fade-in zoom-in duration-300`}>
              <p className={`text-6xl font-black ${cfg.text} mb-4 tracking-tighter`}>{cfg.label}</p>
              {lastResult.student ? (
                <>
                  <p className="text-white text-3xl font-bold mb-2">{lastResult.student.name}</p>
                  <p className="text-gray-400 text-xl font-mono">{lastResult.student.studentId}</p>
                  {lastResult.student.department && (
                    <p className="text-gray-500 text-base mt-2">{lastResult.student.department}</p>
                  )}
                  {lastResult.result === 'ACCEPTED' && lastResult.slot && (
                    <div className={`mt-5 inline-block px-6 py-2 rounded-full text-lg font-bold ${lastResult.slot === 'MORNING' ? 'bg-blue-500/30 text-blue-300' : 'bg-orange-500/30 text-orange-300'}`}>
                      {lastResult.slot}
                    </div>
                  )}
                  {lastResult.result === 'DUPLICATE' && lastResult.firstMarkedAt && (
                    <p className="text-yellow-400/80 text-sm mt-4 font-medium">
                      Already scanned at {new Date(lastResult.firstMarkedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </>
              ) : (
                <p className={`${cfg.text} text-xl mt-2 font-medium`}>{lastResult.message}</p>
              )}
              <div className="mt-8 flex justify-center">
                <div className={`h-2 rounded-full bg-gray-800 w-48 overflow-hidden`}>
                  <div className={`h-full rounded-full ${lastResult.result === 'ACCEPTED' ? 'bg-green-400' : lastResult.result === 'DUPLICATE' ? 'bg-yellow-400' : 'bg-red-400'}`}
                    style={{
                      width: '100%',
                      animation: 'shrink 2.5s linear forwards'
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Camera container */}
        <div className="w-full max-w-sm relative">
          <div className="absolute inset-0 border-2 border-indigo-500/20 rounded-2xl pointer-events-none z-10" />
          <div id="qr-reader" className="rounded-2xl overflow-hidden bg-gray-900 border border-gray-800 shadow-2xl" />
        </div>

        {/* Manual input */}
        <div className="w-full max-w-sm space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (manualInput.trim()) {
                processQR(manualInput.trim());
                setManualInput('');
              }
            }}
            className="flex gap-2"
          >
            <input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Manual ID or USB Scanner..."
              className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono shadow-inner"
            />
            <button
              type="submit"
              disabled={processing}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 shadow-lg shadow-indigo-600/20"
            >
              Scan
            </button>
          </form>
          <div className="flex items-center justify-center gap-2 text-xs text-gray-600">
            <span>Device Key:</span>
            <span className="font-mono text-gray-400 bg-gray-900 px-2 py-0.5 rounded border border-gray-800">{deviceKey || 'not set'}</span>
          </div>
        </div>
      </div>

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 w-full max-w-md shadow-2xl scale-100 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white font-bold text-xl">Scanner Configuration</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-500 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wider">Device Key</label>
                <input
                  value={deviceKeyInput}
                  onChange={(e) => setDeviceKeyInput(e.target.value)}
                  placeholder="Paste key from Admin panel"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner"
                />
                <p className="text-gray-500 text-xs mt-2 italic">Register devices in Admin → Device Management</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-3 rounded-xl font-bold transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={saveDeviceKey}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-indigo-600/30"
                >
                  Save & Connect
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}
