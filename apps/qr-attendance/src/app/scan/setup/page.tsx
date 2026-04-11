'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function SetupHandler() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState('Configuring device...');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const key = searchParams.get('key');
        const label = searchParams.get('label');

        if (!key) {
            setError('Invalid setup link. Key missing.');
            return;
        }

        try {
            // Save setup info to localStorage
            localStorage.setItem('qr_device_key', key);

            setStatus(`Device linked successfully!`);

            // Short delay for user to see the success
            setTimeout(() => {
                router.push('/scan');
            }, 1500);
        } catch (err) {
            setError('Failed to save device configuration.');
        }
    }, [searchParams, router]);

    return (
        <div className="text-center p-8 bg-gray-900 border border-indigo-500/30 rounded-3xl shadow-2xl max-w-sm">
            {error ? (
                <>
                    <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Setup Failed</h2>
                    <p className="text-gray-400 text-sm">{error}</p>
                </>
            ) : (
                <>
                    <div className="w-16 h-16 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Linking Device</h2>
                    <p className="text-indigo-400 text-sm font-medium">{status}</p>
                    <p className="text-gray-500 text-xs mt-4">Redirecting you to the scanner...</p>
                </>
            )}
        </div>
    );
}

export default function DeviceSetupPage() {
    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
            <Suspense fallback={<div className="text-gray-400">Loading configuration...</div>}>
                <SetupHandler />
            </Suspense>
        </div>
    );
}
