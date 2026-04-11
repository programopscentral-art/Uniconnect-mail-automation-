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
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

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
        body: JSON.stringify({
          qr_payload: payload.trim(),
          device_key: deviceKey,
          device_info: typeof window !== 'undefined' ? navigator.userAgent : 'Unknown'
        })
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token && deviceKey && !processingRef.current) {
      processQR(token);
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [deviceKey, processQR]);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);

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

  const startScanner = async () => {
    if (!deviceKey) return setShowSettings(true);
    setCameraError(null);

    try {
      const { Html5QrcodeScanner } = await import('html5-qrcode');

      if (scannerRef.current) {
        await scannerRef.current.clear();
      }

      const s = new Html5QrcodeScanner(
        'qr-reader',
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          showTorchButtonIfSupported: true
        },
        false
      );

      s.render((text) => processQR(text), (err) => { });
      scannerRef.current = s;
      setCameraActive(true);
    } catch (err) {
      setCameraError('Could not access camera. Please check permissions.');
    }
  };

  // Auto-start scanner on mount
  useEffect(() => {
    if (deviceKey) {
      startScanner();
    }
  }, [deviceKey]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'Enter') {
        const buf = hidBufferRef.current.trim();
        if (buf.length >= 8) processQR(buf);
        hidBufferRef.current = '';
        if (hidTimerRef.current) clearTimeout(hidTimerRef.current);
      } else if (e.key.length === 1) {
        hidBufferRef.current += e.key;
        if (hidTimerRef.current) clearTimeout(hidTimerRef.current);
        hidTimerRef.current = setTimeout(() => { hidBufferRef.current = ''; }, 200);
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
    <div className="min-h-screen bg-gray-950 flex flex-col text-gray-100 font-sans">
      <div className="bg-gray-900/50 backdrop-blur-md border-b border-gray-800 px-4 py-3 sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <p className="text-white font-black text-xl leading-none">{currentTime}</p>
            <p className="text-gray-500 text-[10px] uppercase font-bold tracking-widest mt-1">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          </div>
          <div className="h-8 w-px bg-gray-800" />
          {slotStatus?.activeSlot ? (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
              <div>
                <p className="text-green-400 font-black text-xs uppercase tracking-tight">{slotStatus.activeSlot.slot}</p>
                <p className="text-gray-500 text-[10px] font-medium">{slotStatus.activeSlot.startTime}–{slotStatus.activeSlot.endTime}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-600">
              <span className="w-2 h-2 bg-gray-700 rounded-full" />
              <p className="text-[10px] uppercase font-bold tracking-tight">System Offline</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {slotStatus && (
            <div className="hidden sm:flex items-center gap-3 mr-4">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-gray-500 font-bold uppercase">Morning</span>
                <span className="text-sm text-blue-400 font-black">{slotStatus.morningCount}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-gray-500 font-bold uppercase">Afternoon</span>
                <span className="text-sm text-orange-400 font-black">{slotStatus.afternoonCount}</span>
              </div>
            </div>
          )}
          <button onClick={() => setShowSettings(true)} className="p-2.5 text-gray-400 hover:text-white transition-all bg-gray-800/50 hover:bg-gray-800 rounded-xl border border-gray-700/50">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8 overflow-hidden relative">
        {showResult && lastResult && cfg && (
          <div className={`fixed inset-0 z-50 flex items-center justify-center p-6 ${cfg.bg} backdrop-blur-md animate-in fade-in duration-300`}>
            <div className={`text-center max-w-sm w-full border-4 ${cfg.border} rounded-[3rem] p-10 bg-gray-950 shadow-[0_0_50px_rgba(0,0,0,0.5)] scale-100 animate-in zoom-in-90 duration-300`}>
              <p className={`text-5xl font-black ${cfg.text} mb-3 tracking-tighter`}>{cfg.label}</p>
              {lastResult.student ? (
                <>
                  <p className="text-white text-3xl font-black mb-1">{lastResult.student.name}</p>
                  <p className="text-gray-500 text-lg font-mono tracking-widest">{lastResult.student.studentId}</p>
                  {lastResult.result === 'ACCEPTED' && (
                    <div className="mt-6 w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(34,197,94,0.5)]">
                      <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </>
              ) : (
                <p className={`${cfg.text} text-lg mt-2 font-bold`}>{lastResult.message}</p>
              )}
            </div>
          </div>
        )}

        <div className="w-full max-w-sm">
          {!cameraActive ? (
            <div className="aspect-square w-full bg-gray-900/50 rounded-[2.5rem] border-2 border-dashed border-gray-800 flex flex-col items-center justify-center gap-4 text-center p-8 active:border-indigo-500 transition-all cursor-pointer" onClick={startScanner}>
              <div className="w-20 h-20 bg-indigo-500/10 text-indigo-500 rounded-3xl flex items-center justify-center shadow-lg border border-indigo-500/20">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p className="text-white font-black text-lg">Camera Is Off</p>
                <p className="text-gray-500 text-sm mt-1">Tap to turn on camera & start scanning</p>
              </div>
              <button className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-2xl font-black text-sm shadow-xl shadow-indigo-600/20 transition-all active:scale-95">
                TAP TO OPEN SCANNER
              </button>
            </div>
          ) : (
            <div className="relative group overflow-hidden rounded-[2.5rem] border-2 border-indigo-500/30 shadow-[0_0_30px_rgba(99,102,241,0.1)]">
              <div id="qr-reader" className="w-full overflow-hidden" />
              <div className="absolute inset-0 pointer-events-none border-2 border-indigo-500/20 m-6 rounded-3xl" />
            </div>
          )}
          {cameraError && <p className="text-red-400 text-center text-xs mt-4 font-bold uppercase tracking-wider">{cameraError}</p>}
        </div>

        <div className="w-full max-w-sm space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (manualInput.trim()) {
                processQR(manualInput.trim());
                setManualInput('');
              }
            }}
            className="group flex flex-col gap-3"
          >
            <div className="relative">
              <input
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Enter ID Manually..."
                className="w-full bg-gray-900/80 border border-gray-800 rounded-2xl px-5 py-4 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-base font-bold transition-all shadow-inner"
              />
              <button
                type="submit"
                disabled={processing}
                className="absolute right-2 top-2 bottom-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95"
              >
                {processing ? '...' : 'SUBMIT'}
              </button>
            </div>
          </form>
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1 bg-gray-900/50 rounded-lg border border-gray-800/50">
              <span className="text-[9px] text-gray-600 uppercase font-black tracking-widest">Authorized As:</span>
              <span className="text-[10px] font-mono text-indigo-400 font-bold">{deviceKey || 'UNLINKED'}</span>
            </div>
            {!cameraActive && (
              <p className="text-[10px] text-gray-700 font-medium">Automatic scanner detection is active</p>
            )}
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200">
          <div className="bg-gray-950 border border-gray-800 rounded-[2.5rem] p-8 w-full max-w-sm shadow-[0_0_50px_rgba(0,0,0,0.8)] scale-100 animate-in zoom-in-95 duration-300">
            <h2 className="text-white font-black text-2xl mb-1">Configuration</h2>
            <p className="text-gray-500 text-xs mb-8 font-medium">Link this hardware to your admin panel</p>

            <div className="space-y-8">
              <div>
                <label className="block text-[10px] font-black text-gray-500 mb-2 uppercase tracking-[0.2em]">Secret Device Key</label>
                <input
                  value={deviceKeyInput}
                  onChange={(e) => setDeviceKeyInput(e.target.value)}
                  placeholder="Paste key here..."
                  className="w-full bg-gray-900 border border-gray-800 rounded-2xl px-5 py-4 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={saveDeviceKey}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-black text-sm transition-all active:scale-95 shadow-lg shadow-indigo-600/30"
                >
                  SAVE & CONNECT
                </button>
                <button
                  onClick={() => setShowSettings(false)}
                  className="w-full bg-transparent border border-gray-800 hover:border-gray-700 text-gray-500 py-4 rounded-2xl font-black text-xs transition-all tracking-widest"
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
