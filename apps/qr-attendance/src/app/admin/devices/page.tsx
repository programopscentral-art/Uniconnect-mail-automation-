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
      setMsg(`Device created! Key: ${data.device.deviceKey}`);
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
        <h1 className="text-2xl font-bold text-white">Devices</h1>
        <p className="text-gray-400 text-sm mt-1">Manage scanner devices</p>
      </div>

      {/* Add device form */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-white font-semibold mb-4">Register New Device</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Device label (e.g. Gate 1 Scanner)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location (optional)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <button
            onClick={createDevice}
            disabled={creating || !label.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
          >
            {creating ? 'Creating...' : 'Add Device'}
          </button>
        </div>
        {msg && (
          <p className={`mt-3 text-sm ${msg.includes('created') || msg.includes('deleted') ? 'text-green-400' : 'text-red-400'}`}>{msg}</p>
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
        <div className="space-y-3">
          {devices.map((device) => (
            <div key={device.id} className={`bg-gray-900 border rounded-xl p-4 ${device.isActive ? 'border-gray-800' : 'border-red-900/50 opacity-60'}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${device.isActive ? 'bg-green-400' : 'bg-red-500'}`} />
                  <div>
                    <p className="text-white font-medium">{device.label ?? 'Unnamed Device'}</p>
                    {device.location && (
                      <p className="text-gray-500 text-xs mt-0.5">{device.location}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <code className="text-xs bg-gray-800 px-2 py-0.5 rounded text-indigo-300 font-mono">
                        {device.deviceKey}
                      </code>
                      <button
                        onClick={() => copyKey(device.deviceKey)}
                        className="text-gray-500 hover:text-white transition-colors"
                        title="Copy device key"
                      >
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
                </div>
                <div className="flex items-center gap-3">
                  {device.lastSeen && (
                    <p className="text-gray-500 text-xs">
                      Last seen: {new Date(device.lastSeen).toLocaleString('en-IN')}
                    </p>
                  )}
                  <button
                    onClick={() => toggleDevice(device.id, device.isActive)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${device.isActive
                        ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                        : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                      }`}
                  >
                    {device.isActive ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => deleteDevice(device.id)}
                    className="p-1.5 text-gray-500 hover:text-red-500 transition-colors"
                    title="Delete Device"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
          {devices.length === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
              <p className="text-gray-500">No devices registered yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
