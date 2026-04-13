'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

type ScanResult = 'ACCEPTED' | 'DUPLICATE' | 'INVALID_QR' | 'UNKNOWN_STUDENT' | 'OUTSIDE_SLOT' | 'INACTIVE_STUDENT' | 'ERROR';

interface ScanResponse {
  result: ScanResult;
  message?: string;
  student?: { studentId: string; name: string; department: string | null };
}

const RESULT_CONFIG: Record<ScanResult, { bg: string; border: string; text: string; label: string; icon: string }> = {
  ACCEPTED:         { bg: 'bg-green-600',  border: 'border-green-400',  text: 'text-white', label: 'PRESENT',       icon: '✅' },
  DUPLICATE:        { bg: 'bg-yellow-500', border: 'border-yellow-300', text: 'text-black', label: 'ALREADY MARKED', icon: '⚠️' },
  INVALID_QR:       { bg: 'bg-red-600',    border: 'border-red-400',    text: 'text-white', label: 'INVALID QR',    icon: '❌' },
  UNKNOWN_STUDENT:  { bg: 'bg-red-600',    border: 'border-red-400',    text: 'text-white', label: 'UNKNOWN',       icon: '❌' },
  OUTSIDE_SLOT:     { bg: 'bg-orange-500', border: 'border-orange-300', text: 'text-white', label: 'OUTSIDE SLOT',  icon: '⏰' },
  INACTIVE_STUDENT: { bg: 'bg-gray-600',   border: 'border-gray-400',   text: 'text-white', label: 'INACTIVE',      icon: '🚫' },
  ERROR:            { bg: 'bg-red-900',    border: 'border-red-500',    text: 'text-white', label: 'ERROR',         icon: '💥' },
};

export default function ScanPage() {
  const [deviceKey, setDeviceKey]         = useState('');
  const [deviceKeyInput, setDeviceKeyInput] = useState('');
  const [showSettings, setShowSettings]   = useState(false);
  const [scanResult, setScanResult]       = useState<ScanResponse | null>(null);
  const [showResult, setShowResult]       = useState(false);
  const [currentTime, setCurrentTime]     = useState('');
  const [cameraActive, setCameraActive]   = useState(false);
  const [starting, setStarting]           = useState(false);
  const [errorMsg, setErrorMsg]           = useState<string | null>(null);

  const videoRef      = useRef<HTMLVideoElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const rafRef        = useRef<number>(0);
  const processingRef = useRef(false);
  const resultTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clock
  useEffect(() => {
    const t = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
      }));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Load device key from storage
  useEffect(() => {
    const stored = localStorage.getItem('qr_device_key');
    if (stored) { setDeviceKey(stored); setDeviceKeyInput(stored); }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => stopCamera(), []);

  function stopCamera() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }

  const showScanResult = useCallback((data: ScanResponse) => {
    setScanResult(data);
    setShowResult(true);
    if (resultTimer.current) clearTimeout(resultTimer.current);
    resultTimer.current = setTimeout(() => {
      setShowResult(false);
      setScanResult(null);
      processingRef.current = false;
    }, 2500);
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
          device_info: navigator.userAgent,
        }),
      });
      const data: ScanResponse = await res.json();
      showScanResult(data);
    } catch {
      showScanResult({ result: 'ERROR', message: 'Network error — check connection.' });
    }
  }, [deviceKey, showScanResult]);

  // Continuous scan loop using jsQR + canvas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startScanLoop = useCallback((jsQR: (data: Uint8ClampedArray, w: number, h: number, opts?: any) => { data: string } | null) => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const tick = () => {
      if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });
        if (code && !processingRef.current) {
          processQR(code.data);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [processQR]);

  const startCamera = async () => {
    if (!deviceKey) return setShowSettings(true);
    setStarting(true);
    setErrorMsg(null);

    try {
      // Load jsQR dynamically (client-only, browser library)
      const mod = await import('jsqr');
      const jsQR = mod.default;

      // Try multiple camera constraint strategies — most reliable to least
      const strategies: MediaStreamConstraints[] = [
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        { video: { facingMode: 'environment' } },
        { video: true },
      ];

      let stream: MediaStream | null = null;
      let lastErr: unknown;

      for (const constraints of strategies) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (e) {
          lastErr = e;
        }
      }

      if (!stream) {
        const e = lastErr as DOMException;
        if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
          throw new Error('Camera permission denied. Please allow camera access in your browser settings and try again.');
        }
        if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError') {
          throw new Error('No camera found on this device.');
        }
        throw new Error('Could not start camera. Please check your camera is not in use by another app.');
      }

      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true'); // required for iOS
      await video.play();

      setCameraActive(true);
      startScanLoop(jsQR);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not start camera.';
      setErrorMsg(msg);
    } finally {
      setStarting(false);
    }
  };

  const saveKey = () => {
    const key = deviceKeyInput.trim();
    if (!key) return;
    setDeviceKey(key);
    localStorage.setItem('qr_device_key', key);
    setShowSettings(false);
  };

  const cfg = scanResult ? RESULT_CONFIG[scanResult.result] : null;

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans flex flex-col items-center justify-center select-none overflow-hidden">
      {/* Hidden canvas for frame decoding */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

      {/* Top HUD */}
      <div className="fixed top-0 left-0 right-0 px-6 pt-6 pb-4 flex justify-between items-start bg-gradient-to-b from-black/90 to-transparent z-40">
        <div>
          <p className="text-3xl font-black italic tracking-tighter tabular-nums">{currentTime}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-green-500 animate-ping' : 'bg-indigo-500'}`} />
            <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${cameraActive ? 'text-green-400' : 'text-indigo-400'}`}>
              {cameraActive ? 'Scanning Live' : 'Ready'}
            </span>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          {cameraActive && (
            <button
              onClick={stopCamera}
              className="px-4 py-2 rounded-2xl bg-red-600/20 border border-red-500/30 text-red-400 text-xs font-black uppercase tracking-widest active:scale-95"
            >
              Stop
            </button>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Camera / Activate area */}
      <div className="w-full max-w-sm px-6 mt-24 mb-6">
        {cameraActive ? (
          /* Live camera viewfinder */
          <div className="relative rounded-[2.5rem] overflow-hidden border-2 border-indigo-500/30 shadow-[0_0_60px_-15px_rgba(79,70,229,0.4)]"
               style={{ aspectRatio: '3/4' }}>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
              autoPlay
            />
            {/* Scanning guide overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-56 h-56">
                {/* Corner brackets */}
                <span className="absolute top-0 left-0  w-8 h-8 border-t-[3px] border-l-[3px] border-white rounded-tl-md" />
                <span className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-white rounded-tr-md" />
                <span className="absolute bottom-0 left-0  w-8 h-8 border-b-[3px] border-l-[3px] border-white rounded-bl-md" />
                <span className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-white rounded-br-md" />
                {/* Scan line */}
                <span className="absolute left-2 right-2 h-0.5 bg-indigo-400/80 rounded-full animate-scanline" />
              </div>
            </div>
            {/* Bottom label */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent text-center">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-white/60">Hold QR code in the frame</p>
            </div>
          </div>
        ) : (
          /* Activate button */
          <div className="flex flex-col gap-4">
            <button
              onClick={startCamera}
              disabled={starting}
              className="w-full aspect-square bg-indigo-600 rounded-[3rem] shadow-[0_30px_80px_-20px_rgba(79,70,229,0.6)] border-4 border-white/10 flex flex-col items-center justify-center gap-6 transition-all active:scale-95 disabled:opacity-70"
            >
              {starting ? (
                <>
                  <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin" />
                  <p className="text-lg font-black uppercase tracking-tighter text-white/80">Starting Camera…</p>
                </>
              ) : (
                <>
                  <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center shadow-2xl">
                    {/* Camera icon */}
                    <svg className="w-14 h-14 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-black uppercase tracking-tighter">Tap to Scan</p>
                    <p className="text-white/50 text-xs mt-1 font-bold uppercase tracking-widest">Point at student QR code</p>
                  </div>
                </>
              )}
            </button>

            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/30 p-5 rounded-2xl text-center">
                <p className="text-red-400 font-black text-xs uppercase tracking-widest mb-2">Camera Error</p>
                <p className="text-gray-300 text-sm leading-relaxed">{errorMsg}</p>
                <button
                  onClick={startCamera}
                  className="mt-4 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest px-6 py-3 rounded-xl active:scale-95"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Device auth status */}
      <div className="flex items-center gap-2 px-6">
        <span className={`w-2 h-2 rounded-full ${deviceKey ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-600">
          Device: {deviceKey ? 'AUTHENTICATED' : 'NOT CONFIGURED'}
        </span>
        {!deviceKey && (
          <button onClick={() => setShowSettings(true)} className="text-indigo-400 text-[10px] font-black uppercase tracking-widest ml-1 underline underline-offset-2">
            Set Key
          </button>
        )}
      </div>

      {/* Full-screen scan result overlay */}
      {showResult && scanResult && cfg && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-8 ${cfg.bg}`}>
          <div className={`w-full max-w-xs border-8 ${cfg.border} rounded-[3.5rem] p-10 bg-black/20 text-center`}>
            <div className="text-6xl mb-4">{cfg.icon}</div>
            <p className={`text-5xl font-black ${cfg.text}`}>{cfg.label}</p>
            {scanResult.student && (
              <>
                <p className="text-3xl font-black text-white mt-6">{scanResult.student.name}</p>
                <p className="text-sm font-mono text-white/50 mt-1">{scanResult.student.studentId}</p>
                {scanResult.student.department && (
                  <p className="text-xs text-white/40 mt-1">{scanResult.student.department}</p>
                )}
              </>
            )}
            {scanResult.message && !scanResult.student && (
              <p className="text-sm text-white/70 mt-4 leading-relaxed">{scanResult.message}</p>
            )}
          </div>
        </div>
      )}

      {/* Settings / Device Key modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-8">
          <div className="w-full max-w-sm bg-gray-950 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
            <h2 className="text-3xl font-black tracking-tighter mb-1">Device Key</h2>
            <p className="text-gray-500 text-sm mb-8 leading-relaxed">
              Authenticate this device to enable attendance scanning. Contact your administrator for the key.
            </p>
            <div className="space-y-4">
              <input
                value={deviceKeyInput}
                type="password"
                autoComplete="off"
                autoFocus
                onChange={(e) => setDeviceKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveKey()}
                className="w-full bg-black border border-white/10 rounded-2xl py-4 px-5 font-mono text-center text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter device key"
              />
              <button
                onClick={saveKey}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-sm tracking-widest uppercase active:scale-95"
              >
                Activate Scanner
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="w-full text-gray-600 py-3 font-bold text-xs uppercase tracking-widest"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}