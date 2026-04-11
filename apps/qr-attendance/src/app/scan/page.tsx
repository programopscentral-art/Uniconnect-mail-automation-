'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

type ScanResult = 'ACCEPTED' | 'DUPLICATE' | 'INVALID_QR' | 'UNKNOWN_STUDENT' | 'OUTSIDE_SLOT' | 'INACTIVE_STUDENT' | 'ERROR';

interface ScanResponse {
  result: ScanResult;
  message?: string;
  student?: { studentId: string; name: string; department: string | null };
}

const RESULT_CONFIG: Record<ScanResult, { bg: string; border: string; text: string; label: string }> = {
  ACCEPTED: { bg: 'bg-green-600', border: 'border-green-400', text: 'text-white', label: 'PRESENT' },
  DUPLICATE: { bg: 'bg-yellow-500', border: 'border-yellow-300', text: 'text-black', label: 'ALREADY MARKED' },
  INVALID_QR: { bg: 'bg-red-600', border: 'border-red-400', text: 'text-white', label: 'INVALID QR' },
  UNKNOWN_STUDENT: { bg: 'bg-red-600', border: 'border-red-400', text: 'text-white', label: 'UNKNOWN' },
  OUTSIDE_SLOT: { bg: 'bg-orange-500', border: 'border-orange-300', text: 'text-white', label: 'OUTSIDE SLOT' },
  INACTIVE_STUDENT: { bg: 'bg-gray-600', border: 'border-white', text: 'text-white', label: 'INACTIVE' },
  ERROR: { bg: 'bg-red-900', border: 'border-red-500', text: 'text-white', label: 'ERROR' }
};

export default function ScanPage() {
  const [deviceKey, setDeviceKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [deviceKeyInput, setDeviceKeyInput] = useState('');
  const [status, setStatus] = useState<ScanResponse | null>(null);
  const [showStatus, setShowStatus] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [libLoading, setLibLoading] = useState(false);

  const scannerRef = useRef<any>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem('qr_device_key');
    if (stored) {
      setDeviceKey(stored);
      setDeviceKeyInput(stored);
    }

    // Auto-update clock
    const t = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const processQR = useCallback(async (payload: string) => {
    if (processingRef.current || !payload.trim()) return;
    if (!deviceKey) { setShowSettings(true); return; }

    processingRef.current = true;
    try {
      const res = await fetch('/api/scan/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_payload: payload.trim(),
          device_key: deviceKey,
          device_info: typeof navigator !== 'undefined' ? navigator.userAgent : 'Mobile'
        })
      });
      const data = await res.json();
      setStatus(data);
      setShowStatus(true);
      setTimeout(() => { setShowStatus(false); setStatus(null); processingRef.current = false; }, 2000);
    } catch {
      setErrorMsg('Network Failure');
      processingRef.current = false;
    }
  }, [deviceKey]);

  const initCamera = async () => {
    if (!deviceKey) return setShowSettings(true);
    setLibLoading(true);
    setErrorMsg(null);

    try {
      // 1. Direct Permission Check
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      stream.getTracks().forEach(t => t.stop());

      // 2. Load Scanner
      const { Html5Qrcode } = await import('html5-qrcode');

      const scanner = new Html5Qrcode("scanner-area");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 20, qrbox: { width: 250, height: 250 } },
        (decodedText) => { if (!processingRef.current) processQR(decodedText); },
        () => { }
      );

      setCameraActive(true);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Camera Access Denied by iPad Controller.');
    } finally {
      setLibLoading(false);
    }
  };

  const saveKey = () => {
    const key = deviceKeyInput.trim();
    if (!key) return;
    setDeviceKey(key);
    localStorage.setItem('qr_device_key', key);
    setShowSettings(false);
  };

  const cfg = status ? RESULT_CONFIG[status.result] : null;

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans flex flex-col items-center justify-center p-6 select-none">
      {/* HUD Header */}
      <div className="fixed top-0 left-0 right-0 p-6 flex justify-between items-start bg-gradient-to-b from-black to-transparent z-40">
        <div className="flex flex-col">
          <p className="text-3xl font-black italic tracking-tighter">{currentTime}</p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400">Scanner Online</p>
          </div>
        </div>
        <button onClick={() => setShowSettings(true)} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-xl">
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
        </button>
      </div>

      {/* Main Scanner Stage */}
      <div className="w-full max-w-sm aspect-square relative mb-12 group">
        {!cameraActive ? (
          <button
            onClick={initCamera}
            disabled={libLoading}
            className="absolute inset-0 bg-indigo-600 rounded-[3rem] shadow-[0_40px_100px_-20px_rgba(79,70,229,0.5)] border-4 border-white/20 flex flex-col items-center justify-center p-12 transition-all active:scale-95 text-center"
          >
            {libLoading ? (
              <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center shadow-2xl mb-8">
                  <svg className="w-14 h-14 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <p className="text-3xl font-black uppercase tracking-tighter">Wake Camera</p>
                <p className="text-white/60 text-xs mt-2 font-bold uppercase tracking-widest leading-relaxed">System requires iPad permission</p>
              </>
            )}
          </button>
        ) : (
          <div className="w-full h-full relative rounded-[4rem] overflow-hidden border-4 border-indigo-500/30">
            <div id="scanner-area" className="w-full h-full bg-black" />
            <div className="absolute inset-0 border-[60px] border-black/40 pointer-events-none">
              <div className="w-full h-full border-2 border-white/20 rounded-2xl" />
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="absolute top-full left-0 right-0 mt-8 bg-red-500/10 border border-red-500/20 p-5 rounded-3xl text-center">
            <p className="text-red-500 font-black text-xs uppercase tracking-widest mb-1">Hardware Error</p>
            <p className="text-gray-400 text-[10px] leading-tight font-medium uppercase tracking-tighter">{errorMsg}</p>
          </div>
        )}
      </div>

      {/* Manual Input Fallback */}
      <div className="w-full max-w-sm mt-8">
        <form
          onSubmit={(e) => { e.preventDefault(); processQR(manualInput); setManualInput(''); }}
          className="relative"
        >
          <input
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Manual ID..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-6 px-8 font-black text-xl focus:outline-none focus:bg-white/10 transition-all font-mono"
          />
          <button className="absolute right-3 top-3 bottom-3 bg-white text-black px-6 rounded-xl font-black text-xs uppercase tracking-widest">Mark</button>
        </form>
        <div className="mt-8 flex flex-col items-center">
          <span className="text-[10px] font-black text-gray-700 uppercase tracking-[0.4em]">Device Auth: {deviceKey ? 'ACTIVE' : 'MISSING'}</span>
        </div>
      </div>

      {/* Quick Status Overlay */}
      {showStatus && status && cfg && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-8 ${cfg.bg} bg-opacity-95 backdrop-blur-2xl animate-in zoom-in-95 duration-200`}>
          <div className={`w-full max-w-sm border-8 ${cfg.border} rounded-[4rem] p-16 bg-black shadow-2xl text-center`}>
            <p className={`text-6xl font-black mb-6 ${cfg.text}`}>{cfg.label}</p>
            {status.student && (
              <>
                <p className="text-4xl font-black text-white">{status.student.name}</p>
                <p className="text-xl font-mono text-white/50 mt-2">{status.student.studentId}</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="w-full max-w-sm bg-gray-950 border border-white/10 rounded-[3.5rem] p-12 shadow-2xl">
            <h2 className="text-4xl font-black tracking-tighter mb-2">Auth</h2>
            <p className="text-gray-500 text-sm mb-12 tracking-widest leading-relaxed uppercase">Enter Admin Key to enable hardware.</p>

            <div className="space-y-6">
              <input
                value={deviceKeyInput}
                type="password"
                onChange={(e) => setDeviceKeyInput(e.target.value)}
                className="w-full bg-black border border-white/10 rounded-2xl py-5 px-6 font-mono text-center text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Secret Key"
              />
              <button onClick={saveKey} className="w-full bg-white text-black py-6 rounded-2xl font-black text-sm tracking-widest uppercase active:scale-95 shadow-xl">Activate Hardware</button>
              <button onClick={() => setShowSettings(false)} className="w-full text-gray-500 py-3 font-bold text-xs uppercase tracking-widest tracking-[0.3em]">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
