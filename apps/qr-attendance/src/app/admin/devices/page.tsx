'use client';

import { useEffect, useState } from 'react';

interface Device {
  id: string;
  deviceKey: string;
  label: string | null;
  location: string | null;
  isActive: boolean;
  lastSeen: string | null;
  createdAt: string;
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [location, setLocation] = useState('');
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [showQrFor, setShowQrFor] = useState<Device | null>(null);

  async function loadDevices() {
    const res = await fetch('/api/admin/devices');
    const data = await res.json();
    setDevices(data.devices ?? []);
    setLoading(false);
  }

  useEffect(() => { loadDevices(); }, []);

  async function createDevice() {
    if (!label.trim()) return;
    setCreating(true);
    setMsg('');
    const res = await fetch('/api/admin/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, location })
    });
    const data = await res.json();
    if (res.ok) {
      setDevices((prev) => [data.device, ...prev]);
      setLabel('');
      setLocation('');
      setMsg(`Device created!`);
      // Automatically show QR for new device
      setShowQrFor(data.device);
    } else {
      setMsg(data.error ?? 'Failed to create device');
    }
    setCreating(false);
  }

  async function toggleDevice(id: string, isActive: boolean) {
    const res = await fetch('/api/admin/devices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive: !isActive })
    });
    const data = await res.json();
    if (res.ok) {
      setDevices((prev) => prev.map((d) => d.id === id ? data.device : d));
    }
  }

  async function deleteDevice(id: string) {
    if (!confirm('Are you sure you want to delete this device? It will no longer be able to submit attendance.')) return;
    const res = await fetch(`/api/admin/devices/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setDevices(prev => prev.filter(d => d.id !== id));
      setMsg('Device deleted');
    }
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Device Management</h1>
        <p className="text-gray-400 text-sm mt-1">Register and authorize scanner hardware</p>
      </div>

      {/* Add device form */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-xl">
        <h2 className="text-white font-semibold mb-4">Register New Scanner</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Device Name (e.g. Lobby Tablet)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Physical Location"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <button
            onClick={createDevice}
            disabled={creating || !label.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap shadow-lg shadow-indigo-600/20"
          >
            {creating ? 'Adding...' : 'Add & Generate QR'}
          </button>
        </div>
        {msg && (
          <p className={`mt-3 text-sm font-medium ${msg.includes('created') || msg.includes('deleted') ? 'text-green-400' : 'text-red-400'}`}>{msg}</p>
        )}
      </div>

      {/* Device list */}
      {loading ? (
        <div className="flex justify-center py-20">
          <svg className="animate-spin h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {devices.map((device) => (
            <div key={device.id} className={`bg-gray-900 border rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all ${device.isActive ? 'border-gray-800' : 'border-red-900/30 opacity-60'}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${device.isActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
                  <div>
                    <p className="text-white font-bold text-lg">{device.label ?? 'Unnamed Device'}</p>
                    <p className="text-gray-500 text-xs font-medium">{device.location || 'No location set'}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowQrFor(device)}
                  className="bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border border-indigo-500/20"
                >
                  Setup QR
                </button>
              </div>

              <div className="flex items-center justify-between border-t border-gray-800 pt-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Security Key</span>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-gray-800 px-2 py-0.5 rounded text-indigo-300 font-mono">
                      {device.deviceKey}
                    </code>
                    <button onClick={() => copyKey(device.deviceKey)} className="text-gray-600 hover:text-white">
                      {copied === device.deviceKey ? (
                        <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleDevice(device.id, device.isActive)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${device.isActive
                      ? 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/20'
                      : 'bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20'
                      }`}
                  >
                    {device.isActive ? 'Block' : 'Authorize'}
                  </button>
                  <button
                    onClick={() => deleteDevice(device.id)}
                    className="p-2 text-gray-600 hover:text-red-500 transition-all border border-transparent hover:border-red-500/20 rounded-lg"
                    title="Remove Device"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* QR Modal */}
      {showQrFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 rounded-[2rem] p-8 w-full max-w-md text-center shadow-2xl scale-100 animate-in zoom-in-95 duration-300">
            <h2 className="text-2xl font-bold text-white mb-2">Link Device</h2>
            <p className="text-gray-400 text-sm mb-6">Scan this with your tablet/kiosk camera to automatically link it as <span className="text-indigo-400 font-bold">"{showQrFor.label}"</span></p>

            <div className="bg-white p-6 rounded-3xl inline-block mb-6 shadow-glow transition-all">
              <img
                src={`/api/admin/devices/qr/${showQrFor.id}`}
                alt="Setup QR"
                className="w-48 h-48"
              />
            </div>

            <div className="space-y-4">
              <div className="bg-gray-950 p-4 rounded-2xl border border-gray-800 text-left">
                <p className="text-[10px] text-gray-600 uppercase font-black mb-1">Backup Key</p>
                <code className="text-indigo-300 font-mono text-sm">{showQrFor.deviceKey}</code>
              </div>

              <button
                onClick={() => setShowQrFor(null)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-600/30 active:scale-95"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .shadow-glow {
          box-shadow: 0 0 20px rgba(99, 102, 241, 0.2);
        }
      `}</style>
    </div>
  );
}
