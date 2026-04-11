'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';

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
  ACCEPTED: { bg: 'bg-green-500/90', border: 'border-green-400', text: 'text-white', label: 'PRESENT' },
  DUPLICATE: { bg: 'bg-yellow-500/90', border: 'border-yellow-400', text: 'text-white', label: 'ALREADY MARKED' },
  INVALID_QR: { bg: 'bg-red-500/90', border: 'border-red-400', text: 'text-white', label: 'INVALID QR' },
  UNKNOWN_STUDENT: { bg: 'bg-red-500/90', border: 'border-red-400', text: 'text-white', label: 'UNKNOWN' },
  OUTSIDE_SLOT: { bg: 'bg-orange-500/90', border: 'border-orange-400', text: 'text-white', label: 'OUTSIDE SLOT' },
  INACTIVE_STUDENT: { bg: 'bg-gray-600/90', border: 'border-gray-400', text: 'text-white', label: 'INACTIVE' },
  ERROR: { bg: 'bg-red-500/90', border: 'border-red-400', text: 'text-white', label: 'ERROR' }
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
  const [initializing, setInitializing] = useState(false);
  const [libReady, setLibReady] = useState(false);

  const scannerRef = useRef<any>(null);
  const processingRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      }, 2000);
    } catch {
      setLastResult({ result: 'ERROR', message: 'Network error. Check connection.' });
      setShowResult(true);
      resetTimerRef.current = setTimeout(() => {
        setShowResult(false);
        setLastResult(null);
        processingRef.current = false;
        setProcessing(false);
      }, 2000);
    }
  }, [deviceKey]);

  useEffect(() => {
    const stored = localStorage.getItem('qr_device_key');
    if (stored) {
      setDeviceKey(stored);
      setDeviceKeyInput(stored);
    }
  }, []);

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
    if (!window.hasOwnProperty('Html5Qrcode')) {
      setCameraError('Scanner engine not loaded yet. Please wait a moment.');
      return;
    }

    setCameraError(null);
    setInitializing(true);

    try {
      const H5 = (window as any).Html5Qrcode;

      if (scannerRef.current) {
        try { await scannerRef.current.stop(); } catch (e) { }
      }

      const html5QrCode = new H5("qr-reader");
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 15, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        (decodedText: string) => {
          if (!processingRef.current) processQR(decodedText);
        },
        () => { }
      );

      setCameraActive(true);
    } catch (err: any) {
      setCameraError(`CAMERA ERROR: ${err?.message || 'Access Denied'}`);
    } finally {
      setInitializing(false);
    }
  };

  const saveDeviceKey = () => {
    const key = deviceKeyInput.trim();
    if (!key) return;
    setDeviceKey(key);
    localStorage.setItem('qr_device_key', key);
    setShowSettings(false);
  };

  const cfg = lastResult ? RESULT_CONFIG[lastResult.result] : null;

  return (
    <div className="min-h-screen bg-black flex flex-col text-white font-sans overflow-hidden">
      <Script
        src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"
        onLoad={() => setLibReady(true)}
      />

      <div className="bg-gray-900/80 backdrop-blur-xl border-b border-white/10 px-4 py-4 flex items-center justify-between z-40">
        <div className="flex flex-col">
          <p className="font-black text-2xl tracking-tighter leading-none">{currentTime}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full ${slotStatus?.activeSlot ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 uppercase">{slotStatus?.activeSlot ? slotStatus.activeSlot.slot : 'System Offline'}</p>
          </div>
        </div>
        <button onClick={() => setShowSettings(true)} className="p-3 bg-white/5 rounded-2xl border border-white/10 active:scale-90 transition-all">
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        </button>
      </div>

      <div className="flex-1 relative flex flex-col items-center justify-center p-6">
        {showResult && lastResult && cfg && (
          <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 ${cfg.bg} backdrop-blur-2xl animate-in fade-in zoom-in duration-200`}>
            <div className={`w-full max-w-sm border-4 ${cfg.border} rounded-[3rem] p-10 bg-black/40 text-center shadow-2xl`}>
              <p className={`text-6xl font-black mb-4 ${cfg.text}`}>{cfg.label}</p>
              {lastResult.student && (
                <>
                  <p className="text-4xl font-black text-white leading-tight">{lastResult.student.name}</p>
                  <p className="text-xl font-mono text-white/60 mt-2">{lastResult.student.studentId}</p>
                </>
              )}
            </div>
          </div>
        )}

        <div className="w-full max-w-sm aspect-square relative mb-12">
          {!cameraActive ? (
            <div
              onClick={startScanner}
              className="absolute inset-0 bg-gray-900/50 rounded-[3rem] border-2 border-dashed border-white/10 flex flex-col items-center justify-center p-8 cursor-pointer active:scale-95 transition-all text-center"
            >
              <div className="w-24 h-24 bg-indigo-600 rounded-[2rem] flex items-center justify-center shadow-xl shadow-indigo-600/40 mb-6">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                </svg>
              </div>
              <p className="text-xl font-black">{initializing ? 'LOADING...' : 'OPEN CAMERA'}</p>
              <p className="text-gray-500 text-xs mt-2 font-medium">{libReady ? 'Ready for scan' : 'Connecting to engine...'}</p>
            </div>
          ) : (
            <div className="w-full h-full relative rounded-[3.5rem] overflow-hidden border-4 border-white/10">
              <div id="qr-reader" className="w-full h-full bg-black" />
              <div className="absolute inset-0 border-[40px] border-black/50 pointer-events-none">
                <div className="w-full h-full border-2 border-indigo-500/50 rounded-3xl" />
              </div>
            </div>
          )}
          {cameraError && (
            <div className="absolute -bottom-24 left-0 right-0 text-center">
              <p className="text-red-500 font-black text-[10px] uppercase tracking-tighter bg-red-500/10 py-3 rounded-xl border border-red-500/20 px-4">
                {cameraError}
              </p>
            </div>
          )}
        </div>

        <div className="w-full max-w-sm">
          <form
            onSubmit={(e) => { e.preventDefault(); processQR(manualInput); setManualInput(''); }}
            className="relative"
          >
            <input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Enter ID / USB Scanner..."
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-6 font-bold text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-mono"
            />
            <button className="absolute right-2 top-2 bottom-2 bg-white text-black px-6 rounded-xl font-black text-xs uppercase tracking-widest active:scale-90 transition-all">Submit</button>
          </form>
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="w-full max-w-sm bg-gray-900 border border-white/10 rounded-[3rem] p-8 shadow-2xl scale-100 animate-in zoom-in-95">
            <h2 className="text-3xl font-black mb-1">Link Device</h2>
            <div className="space-y-6 mt-8">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Device Key</label>
                <input
                  value={deviceKeyInput}
                  onChange={(e) => setDeviceKeyInput(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-2xl py-4 px-5 font-mono text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="xxxx-xxxx-xxxx"
                />
              </div>
              <div className="flex flex-col gap-3">
                <button onClick={saveDeviceKey} className="w-full bg-white text-black py-4 rounded-2xl font-black text-sm tracking-widest uppercase">Save</button>
                <button onClick={() => setShowSettings(false)} className="w-full bg-transparent text-gray-500 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
