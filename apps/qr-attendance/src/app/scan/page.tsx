'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';

type ScanResult = 'ACCEPTED' | 'DUPLICATE' | 'INVALID_QR' | 'UNKNOWN_STUDENT' | 'OUTSIDE_SLOT' | 'INACTIVE_STUDENT' | 'ERROR';

interface ScanResponse {
  result: ScanResult;
  message?: string;
  student?: { studentId: string; name: string; department: string | null };
  slot?: string;
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
  const [currentTime, setCurrentTime] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);

  const scannerRef = useRef<any>(null);
  const processingRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const processQR = useCallback(async (payload: string) => {
    if (processingRef.current || !payload.trim()) return;
    if (!deviceKey) { setShowSettings(true); return; }

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
      setLastResult({ result: 'ERROR', message: 'Network error.' });
      setShowResult(true);
      setTimeout(() => { setShowResult(false); setLastResult(null); processingRef.current = false; setProcessing(false); }, 2000);
    }
  }, [deviceKey]);

  const startScanner = async () => {
    if (!deviceKey) return setShowSettings(true);
    setCameraError(null);
    setInitializing(true);

    try {
      // PROBE: Just check if camera exists at all
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(t => t.stop());

      // FIND ALL CAMERAS
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === 'videoinput');

      if (cameras.length === 0) throw new Error('No camera found on this device.');

      // PUSH TO ENGINE
      const H5 = (window as any).Html5Qrcode;
      if (!H5) throw new Error('Loading engine... Wait 2s.');

      if (scannerRef.current) {
        try { await scannerRef.current.stop(); } catch (e) { }
      }

      const html5QrCode = new H5("qr-reader");
      scannerRef.current = html5QrCode;

      // Prefer back camera, otherwise any
      const backCamera = cameras.reverse().find(c => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('environment'));
      const deviceId = backCamera ? backCamera.deviceId : cameras[0].deviceId;

      await html5QrCode.start(
        deviceId,
        { fps: 20, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        (decodedText: string) => { if (!processingRef.current) processQR(decodedText); },
        () => { }
      );

      setCameraActive(true);
    } catch (err: any) {
      console.error(err);
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
        setCameraError('LOCKED: Please refresh page or check Browser Privacy Settings.');
      } else {
        setCameraError(err.message || 'Camera blocked by hardware.');
      }
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
      <Script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js" strategy="beforeInteractive" />

      <div className="bg-gray-900 border-b border-white/5 px-4 py-4 flex items-center justify-between z-40 bg-gradient-to-r from-gray-950 to-black">
        <div className="flex flex-col">
          <p className="font-black text-2xl tracking-tighter leading-none">{currentTime}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <p className="text-[10px] font-black tracking-widest text-green-500 uppercase">System Ready</p>
          </div>
        </div>
        <button onClick={() => setShowSettings(true)} className="p-3 bg-white/5 rounded-2xl border border-white/10 active:scale-95">
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        </button>
      </div>

      <div className="flex-1 relative flex flex-col items-center justify-center p-6 bg-black">
        {showResult && lastResult && cfg && (
          <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 ${cfg.bg} backdrop-blur-3xl animate-in fade-in transition-all duration-300`}>
            <div className={`w-full max-w-xs border-4 ${cfg.border} rounded-[3.5rem] p-12 bg-black shadow-2xl`}>
              <p className={`text-5xl font-black mb-4 ${cfg.text}`}>{cfg.label}</p>
              {lastResult.student && (
                <>
                  <p className="text-3xl font-black text-white leading-tight">{lastResult.student.name}</p>
                  <p className="text-lg font-mono text-white/50 mt-1">{lastResult.student.studentId}</p>
                </>
              )}
            </div>
            <p className="text-white/40 mt-8 font-black tracking-widest uppercase animate-pulse">Auto-reset in 2s...</p>
          </div>
        )}

        <div className="w-full max-w-sm aspect-square relative mb-12">
          {!cameraActive ? (
            <button
              onClick={startScanner}
              className="absolute inset-0 bg-indigo-600 rounded-[3.5rem] border-4 border-white/10 flex flex-col items-center justify-center p-12 cursor-pointer text-center shadow-[0_0_60px_rgba(79,70,229,0.3)]"
            >
              <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center shadow-2xl mb-6">
                <svg className="w-12 h-12 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                </svg>
              </div>
              <p className="text-2xl font-black text-white tracking-tighter uppercase">{initializing ? 'Opening Hardware...' : 'Scan Now'}</p>
              <p className="text-indigo-200 text-[10px] mt-2 font-black uppercase tracking-widest">Multi-Camera Probing</p>
            </button>
          ) : (
            <div className="w-full h-full relative rounded-[4rem] overflow-hidden border-4 border border-white/10">
              <div id="qr-reader" className="w-full h-full bg-black" />
              <div className="absolute inset-0 border-[60px] border-black/60 pointer-events-none">
                <div className="w-full h-full border-2 border-white/20 rounded-3xl" />
              </div>
            </div>
          )}
          {cameraError && (
            <div className="absolute -bottom-28 left-0 right-0 text-center px-6">
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl">
                <p className="text-red-500 font-black text-xs uppercase mb-1">Hardware Conflict</p>
                <p className="text-gray-400 text-[9px] leading-tight font-medium uppercase tracking-tighter">{cameraError}</p>
              </div>
            </div>
          )}
        </div>

        <div className="w-full max-w-sm mt-8">
          <form
            onSubmit={(e) => { e.preventDefault(); processQR(manualInput); setManualInput(''); }}
            className="relative"
          >
            <input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Type ID..."
              className="w-full bg-white/5 border border-white/5 rounded-2xl py-6 px-7 font-black text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/10 transition-all font-mono"
            />
            <button className="absolute right-3 top-3 bottom-3 bg-white text-black px-6 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg">Submit</button>
          </form>
          {deviceKey && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">Linked:</span>
              <span className="text-[10px] font-mono text-indigo-400 font-bold">{deviceKey.slice(0, 10)}...</span>
            </div>
          )}
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6 animate-in zoom-in-95 duration-200">
          <div className="w-full max-w-xs bg-gray-900 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
            <h2 className="text-3xl font-black tracking-tighter">Setting</h2>
            <div className="space-y-6 mt-10">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Device Secret</label>
                <input
                  value={deviceKeyInput}
                  type="password"
                  onChange={(e) => setDeviceKeyInput(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-2xl py-4 px-5 font-mono text-center text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="xxxx-xxxx-xxxx"
                />
              </div>
              <div className="flex flex-col gap-3">
                <button onClick={saveDeviceKey} className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black text-sm tracking-widest uppercase shadow-xl active:scale-95">Authorize</button>
                <button onClick={() => setShowSettings(false)} className="w-full text-gray-500 py-2 font-bold text-xs uppercase tracking-widest">Back</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
