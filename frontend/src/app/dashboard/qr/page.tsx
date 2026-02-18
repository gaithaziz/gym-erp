'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { QrCode, RefreshCw } from 'lucide-react';

export default function QRCodePage() {
    const [qrToken, setQrToken] = useState('');
    const [expiresIn, setExpiresIn] = useState(30);
    const [countdown, setCountdown] = useState(30);
    const [loading, setLoading] = useState(true);

    const fetchQR = useCallback(async () => {
        try {
            const res = await api.get('/access/qr');
            setQrToken(res.data.data.qr_token);
            setExpiresIn(res.data.data.expires_in_seconds);
            setCountdown(res.data.data.expires_in_seconds);
            setLoading(false);
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchQR(); }, [fetchQR]);

    // Auto-refresh QR before it expires
    useEffect(() => {
        if (countdown <= 0) {
            fetchQR();
            return;
        }
        const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [countdown, fetchQR]);

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
    );

    return (
        <div className="max-w-md mx-auto text-center space-y-8 py-12">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Your Access QR Code</h1>
                <p className="text-sm text-slate-400 mt-1">Show this code at the gym entrance</p>
            </div>

            <div className="kpi-card p-8 flex flex-col items-center gap-6">
                <div className="h-48 w-48 bg-white rounded-2xl border-2 border-slate-100 flex items-center justify-center shadow-inner p-4">
                    {/* QR Code display using a simple text-based approach */}
                    {qrToken ? (
                        <div className="text-center">
                            <QrCode size={100} className="text-slate-800 mx-auto mb-2" />
                            <p className="text-[8px] text-slate-300 font-mono break-all leading-tight">
                                {qrToken.slice(0, 40)}...
                            </p>
                        </div>
                    ) : (
                        <p className="text-slate-300">No QR Available</p>
                    )}
                </div>

                {/* Countdown ring */}
                <div className="flex items-center gap-3">
                    <div className="relative h-10 w-10">
                        <svg className="h-10 w-10 -rotate-90" viewBox="0 0 40 40">
                            <circle cx="20" cy="20" r="16" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                            <circle
                                cx="20" cy="20" r="16"
                                fill="none"
                                stroke={countdown > 10 ? '#3b82f6' : '#ef4444'}
                                strokeWidth="3"
                                strokeDasharray={`${(countdown / expiresIn) * 100.53} 100.53`}
                                strokeLinecap="round"
                                className="transition-all duration-1000"
                            />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-700">
                            {countdown}
                        </span>
                    </div>
                    <div className="text-left">
                        <p className="text-sm font-medium text-slate-600">Refreshes in {countdown}s</p>
                        <p className="text-xs text-slate-400">Auto-refreshes every {expiresIn}s</p>
                    </div>
                </div>

                <button
                    onClick={fetchQR}
                    className="flex items-center gap-2 text-sm text-blue-500 hover:text-blue-700 transition-colors"
                >
                    <RefreshCw size={14} />
                    Refresh Now
                </button>
            </div>
        </div>
    );
}
