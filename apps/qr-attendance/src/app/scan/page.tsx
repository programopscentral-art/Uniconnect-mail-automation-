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

      // Play sound if possible (optional future enhancement)

      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => {
        setShowResult(false);
        setLastResult(null);
        processingRef.current = false;
        setProcessing(false);
      }, 2000); // 2 second pause before next scan
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
    setInitializing(true);

    try {
      const { Html5Qrcode } = await import('html5-qrcode');

      // Clear existing
      if (scannerRef.current) {
        try { await scannerRef.current.stop(); } catch (e) { }
      }

      const html5QrCode = new Html5Qrcode("qr-reader");
      scannerRef.current = html5QrCode;

      const config = {
        fps: 15,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      };

      // Use 'back' camera by default
      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          if (!processingRef.current) {
            processQR(decodedText);
          }
        },
        (errorMessage) => { /* ignore normal noise */ }
      );

      setCameraActive(true);
    } catch (err: any) {
      console.error(err);
      setCameraError(err?.message || 'Camera access denied or not found.');
    } finally {
      setInitializing(false);
    }
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => { });
      }
    };
  }, []);

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
      {/* Dynamic Header */}
      <div className="bg-gray-900/80 backdrop-blur-xl border-b border-white/10 px-4 py-4 flex items-center justify-between z-40">
        <div className="flex flex-col">
          <p className="font-black text-2xl tracking-tighter leading-none">{currentTime}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full ${slotStatus?.activeSlot ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
              {slotStatus?.activeSlot ? slotStatus.activeSlot.slot : 'System Closed'}
            </p>
          </div>
        </div>
        <button onClick={() => setShowSettings(true)} className="p-3 bg-white/5 rounded-2xl border border-white/10 active:scale-90 transition-all">
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        </button>
      </div>

      <div className="flex-1 relative flex flex-col items-center justify-center p-6">
        {/* Results Overlay - Full Screen Style */}
        {showResult && lastResult && cfg && (
          <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 ${cfg.bg} backdrop-blur-2xl animate-in fade-in zoom-in duration-200`}>
            <div className={`w-full max-w-sm border-4 ${cfg.border} rounded-[3rem] p-10 bg-black/40 text-center shadow-2xl`}>
              <p className={`text-6xl font-black mb-4 ${cfg.text}`}>{cfg.label}</p>
              {lastResult.student ? (
                <>
                  <p className="text-4xl font-black text-white leading-tight">{lastResult.student.name}</p>
                  <p className="text-xl font-mono text-white/60 mt-2 tracking-widest">{lastResult.student.studentId}</p>
                  <div className="mt-8 flex justify-center">
                    <div className="w-20 h-20 rounded-full border-4 border-white/20 flex items-center justify-center">
                      <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-2xl font-bold">{lastResult.message}</p>
              )}
            </div>
            <p className="mt-8 text-white/50 font-bold uppercase tracking-widest animate-pulse">Ready for next scan...</p>
          </div>
        )}

        {/* Scanner Area */}
        <div className="w-full max-w-sm aspect-square relative mb-12">
          {!cameraActive ? (
            <div
              onClick={startScanner}
              className="absolute inset-0 bg-gray-900/50 rounded-[3rem] border-2 border-dashed border-white/10 flex flex-col items-center justify-center p-8 cursor-pointer active:scale-95 transition-all"
            >
              {initializing ? (
                <div className="animate-spin w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full" />
              ) : (
                <>
                  <div className="w-24 h-24 bg-indigo-600 rounded-[2rem] flex items-center justify-center shadow-xl shadow-indigo-600/40 mb-6">
                    <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <p className="text-xl font-black text-white">Start Local Scanner</p>
                  <p className="text-gray-500 text-sm mt-2 font-medium">Click to bypass browser permissions</p>
                </>
              )}
            </div>
          ) : (
            <div className="w-full h-full relative rounded-[3.5rem] overflow-hidden border-4 border-white/10 shadow-[0_0_50px_rgba(255,255,255,0.05)]">
              <div id="qr-reader" className="w-full h-full bg-black" />
              <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none">
                <div className="w-full h-full border-2 border-indigo-500/50 rounded-3xl" />
              </div>
            </div>
          )}
          {cameraError && (
            <div className="absolute -bottom-16 left-0 right-0 text-center">
              <p className="text-red-500 font-black text-xs uppercase tracking-tighter bg-red-500/10 py-2 rounded-xl border border-red-500/20 px-4">
                {cameraError}
              </p>
              <p className="text-gray-500 text-[10px] mt-2 px-6">Check browser settings and allow camera access for this URL</p>
            </div>
          )}
        </div>

        {/* Manual Fallback */}
        <div className="w-full max-w-sm mt-8">
          <form
            onSubmit={(e) => { e.preventDefault(); processQR(manualInput); setManualInput(''); }}
            className="relative"
          >
            <input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Enter ID or Use USB..."
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-6 font-bold text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
            />
            <button className="absolute right-2 top-2 bottom-2 bg-white text-black px-6 rounded-xl font-black text-xs uppercase tracking-widest active:scale-90 transition-all">
              Submit
            </button>
          </form>
          <div className="flex items-center justify-center gap-2 mt-6">
            <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Linked As:</span>
            <span className="text-[10px] font-mono text-indigo-400 font-bold bg-indigo-400/10 px-2 py-0.5 rounded border border-indigo-400/20">
              {deviceKey ? deviceKey.slice(0, 8) + '...' : 'NONE'}
            </span>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="w-full max-w-sm bg-gray-900 border border-white/10 rounded-[3rem] p-8 shadow-2xl">
            <h2 className="text-3xl font-black mb-1">Configuration</h2>
            <p className="text-gray-500 text-sm mb-8">Set your device authorization key</p>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Device Key</label>
                <input
                  value={deviceKeyInput}
                  onChange={(e) => setDeviceKeyInput(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-2xl py-4 px-5 font-mono text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="xxxx-xxxx-xxxx"
                />
              </div>
              <div className="flex flex-col gap-3">
                <button onClick={saveDeviceKey} className="w-full bg-white text-black py-5 rounded-2xl font-black text-sm tracking-widest uppercase shadow-xl hover:bg-gray-200 active:scale-95 transition-all">
                  Save Config
                </button>
                <button onClick={() => setShowSettings(false)} className="w-full bg-transparent text-gray-500 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
