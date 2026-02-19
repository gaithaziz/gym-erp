'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Scan, CloudOff, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface Member {
    id: string;
    full_name: string;
    subscription: {
        status: string;
        end_date: string | null;
    } | null;
}

export default function ScannerPage() {
    const [scanInput, setScanInput] = useState('');
    const [result, setResult] = useState<{ status: string; message: string; user?: string } | null>(null);
    const [offlineMode, setOfflineMode] = useState(false);
    const [lastSync, setLastSync] = useState<string | null>(null);

    const syncMembers = async () => {
        try {
            const res = await api.get('/access/members');
            const members = res.data.data;
            const activeMembers = members.filter((m: Member) =>
                m.subscription?.status === 'ACTIVE'
            ).map((m: Member) => m.id);

            localStorage.setItem('offline_active_members', JSON.stringify(activeMembers));
            localStorage.setItem('offline_member_details', JSON.stringify(members));
            setLastSync(new Date().toLocaleTimeString());
            setOfflineMode(false);
        } catch (err) {
            console.error("Sync failed:", err);
            setOfflineMode(true);
        }
    };

    useEffect(() => {
        syncMembers();
        const interval = setInterval(syncMembers, 60000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const syncPending = async () => {
            const pending = JSON.parse(localStorage.getItem('pending_scans') || '[]');
            if (pending.length === 0) return;
            for (const scan of pending) {
                try {
                    await api.post('/access/scan', { qr_token: scan.qr_token, kiosk_id: scan.kiosk_id });
                } catch { /* handled */ }
            }
            localStorage.setItem('pending_scans', '[]');
        };

        const syncInterval = setInterval(syncPending, 30000);
        if (!offlineMode) syncPending();
        return () => clearInterval(syncInterval);
    }, [offlineMode]);

    const handleScan = async (e: React.FormEvent) => {
        e.preventDefault();
        setResult(null);
        const token = scanInput.trim();
        if (!token) return;

        try {
            const res = await api.post('/access/scan', { qr_token: token, kiosk_id: 'scanner-01' });
            const data = res.data.data;
            setResult({ status: data.status, message: data.reason || 'Access Granted', user: data.user_name });
            setOfflineMode(false);
        } catch {
            setOfflineMode(true);
            verifyOffline(token);
        }
        setScanInput('');
    };

    const verifyOffline = (token: string) => {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) throw new Error("Invalid Token Format");
            const payload = JSON.parse(atob(parts[1]));
            const userId = payload.sub;
            const exp = payload.exp;
            const now = Math.floor(Date.now() / 1000);

            if (exp < now) {
                setResult({ status: 'DENIED', message: 'Token Expired (Offline Check)' });
                return;
            }

            const activeIds = JSON.parse(localStorage.getItem('offline_active_members') || '[]');
            const allMembers = JSON.parse(localStorage.getItem('offline_member_details') || '[]');
            const member = allMembers.find((m: Member) => m.id === userId);
            const memberName = member ? member.full_name : 'Unknown User';

            if (activeIds.includes(userId)) {
                setResult({ status: 'GRANTED', message: 'Offline Access Granted', user: memberName });
            } else {
                setResult({ status: 'DENIED', message: 'No Active Subscription (Offline Check)', user: memberName });
            }
        } catch {
            setResult({ status: 'DENIED', message: 'Scan failed' });
        }
    };

    return (
        <div className="max-w-xl mx-auto py-12 px-4">
            <div className="mb-8 flex justify-between items-center">
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <Scan className="w-6 h-6" />
                    Access Scanner
                </h1>
                <div className="text-right">
                    {offlineMode ? (
                        <span className="text-amber-400 flex items-center gap-1 text-sm font-medium">
                            <CloudOff size={16} /> Offline Mode
                        </span>
                    ) : (
                        <span className="text-emerald-500 text-sm">Online • Synced: {lastSync}</span>
                    )}
                </div>
            </div>

            <div className="chart-card mb-8 border border-border">
                <form onSubmit={handleScan} className="flex gap-4">
                    <input
                        type="text"
                        value={scanInput}
                        onChange={(e) => setScanInput(e.target.value)}
                        placeholder="Scan QR or Enter Token..."
                        className="input-dark flex-1 font-mono"
                        autoFocus
                    />
                    <button type="submit" className="btn-primary">
                        Verify
                    </button>
                </form>
            </div>

            {result && (
                <div className={`p-6 rounded-sm border-l-4 ${result.status === 'GRANTED' || result.status === 'ALREADY_SCANNED'
                    ? 'border-emerald-500 bg-emerald-500/10' : 'border-destructive bg-destructive/10'
                    }`}>
                    <div className="flex items-start gap-4">
                        {result.status === 'GRANTED' ? (
                            <CheckCircle className="w-8 h-8 text-emerald-500 flex-shrink-0" />
                        ) : result.status === 'ALREADY_SCANNED' ? (
                            <AlertTriangle className="w-8 h-8 text-amber-500 flex-shrink-0" />
                        ) : (
                            <XCircle className="w-8 h-8 text-destructive flex-shrink-0" />
                        )}
                        <div>
                            <h2 className={`text-xl font-bold ${result.status === 'GRANTED' ? 'text-emerald-500' : 'text-destructive'
                                }`}>
                                {result.status}
                            </h2>
                            <p className="text-muted-foreground mt-1">{result.message}</p>
                            {result.user && (
                                <p className="text-lg font-medium text-foreground mt-2">
                                    User: {result.user}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-12 text-center text-xs text-muted-foreground">
                <p>Scanner Kiosk ID: scanner-01</p>
                <p>Local Cache: {typeof window !== 'undefined' ? localStorage.getItem('offline_active_members')?.length || 0 : 0} bytes</p>
            </div>
        </div>
    );
}
