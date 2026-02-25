'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Camera, CameraOff, CheckCircle, RefreshCw, ScanLine, XCircle } from 'lucide-react';
import jsQR from 'jsqr';

const KIOSK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const STAFF_ROLES = new Set(['ADMIN', 'COACH', 'EMPLOYEE', 'CASHIER', 'RECEPTION', 'FRONT_DESK']);

type ScanKind = 'client_entry' | 'staff_check_in' | 'staff_check_out';

type ParsedQrPayload = {
    kind: ScanKind;
    kioskId: string;
};

type ScanResult = {
    status: string;
    user_name?: string;
    reason?: string | null;
};

const parseQrPayload = (rawValue: string): ParsedQrPayload | null => {
    const trimmed = rawValue.trim();
    if (!trimmed) return null;

    if (KIOSK_ID_PATTERN.test(trimmed)) {
        return { kind: 'client_entry', kioskId: trimmed };
    }

    if (trimmed.startsWith('gymerp://kiosk/')) {
        const kioskId = trimmed.replace('gymerp://kiosk/', '').trim();
        return KIOSK_ID_PATTERN.test(kioskId) ? { kind: 'client_entry', kioskId } : null;
    }

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
            const parsed = JSON.parse(trimmed) as { kiosk_id?: string; type?: string };
            const kioskId = parsed.kiosk_id?.trim();
            if (!kioskId || !KIOSK_ID_PATTERN.test(kioskId)) return null;

            if (!parsed.type) return { kind: 'client_entry', kioskId };
            if (parsed.type === 'client_entry' || parsed.type === 'staff_check_in' || parsed.type === 'staff_check_out') {
                return { kind: parsed.type, kioskId };
            }
            return null;
        } catch {
            return null;
        }
    }

    return null;
};

const headingByKind: Record<ScanKind, string> = {
    client_entry: 'Client Entrance Check-In',
    staff_check_in: 'Staff Clock In',
    staff_check_out: 'Staff Clock Out',
};

export default function QRCodePage() {
    const { user } = useAuth();
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [cameraReady, setCameraReady] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [detectedScan, setDetectedScan] = useState<ParsedQrPayload | null>(null);
    const [manualKioskId, setManualKioskId] = useState('');
    const [manualMode, setManualMode] = useState<ScanKind>('client_entry');
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        setManualMode(user?.role === 'CUSTOMER' ? 'client_entry' : 'staff_check_in');
    }, [user?.role]);

    const stopScanner = useCallback(() => {
        if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
    }, []);

    const startScanner = useCallback(async () => {
        stopScanner();
        setCameraReady(false);
        setCameraError('');
        setDetectedScan(null);

        if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setCameraError('Camera scanning is not supported on this device.');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } },
                audio: false,
            });
            streamRef.current = stream;

            if (!videoRef.current) return;
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            setCameraReady(true);

            const hasBarcodeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;
            const detector = hasBarcodeDetector
                ? new (window as unknown as {
                    BarcodeDetector: new (opts: { formats: string[] }) => { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>> };
                }).BarcodeDetector({ formats: ['qr_code'] })
                : null;

            if (!hasBarcodeDetector) {
                setCameraError('Using compatibility scanner mode for this browser.');
            }

            scanIntervalRef.current = setInterval(async () => {
                if (!videoRef.current || submitting || detectedScan) return;
                try {
                    let value: string | undefined;

                    if (detector) {
                        const barcodes = await detector.detect(videoRef.current);
                        value = barcodes[0]?.rawValue;
                    } else if (canvasRef.current) {
                        const video = videoRef.current;
                        const canvas = canvasRef.current;

                        if (video.videoWidth > 0 && video.videoHeight > 0) {
                            canvas.width = video.videoWidth;
                            canvas.height = video.videoHeight;
                            const ctx = canvas.getContext('2d', { willReadFrequently: true });
                            if (ctx) {
                                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                                const code = jsQR(imageData.data, imageData.width, imageData.height);
                                value = code?.data;
                            }
                        }
                    }

                    if (!value) return;
                    const parsed = parseQrPayload(value);
                    if (parsed) {
                        setDetectedScan(parsed);
                        setScanResult(null);
                        stopScanner();
                    }
                } catch {
                    // Ignore scan frame errors.
                }
            }, 350);
        } catch {
            setCameraError('Unable to access camera. Check browser permissions.');
        }
    }, [detectedScan, stopScanner, submitting]);

    const validateRoleAndMode = useCallback((kind: ScanKind): string | null => {
        const role = user?.role || '';
        if (role === 'CUSTOMER' && kind !== 'client_entry') {
            return 'This QR is for staff attendance only.';
        }
        if (role !== 'CUSTOMER' && kind === 'client_entry') {
            return 'Use staff start/end QR for attendance.';
        }
        if (kind !== 'client_entry' && !STAFF_ROLES.has(role)) {
            return 'Your role is not allowed to record staff attendance.';
        }
        return null;
    }, [user?.role]);

    const submitAction = useCallback(async (payload: ParsedQrPayload) => {
        if (!KIOSK_ID_PATTERN.test(payload.kioskId)) {
            setScanResult({ status: 'DENIED', reason: 'Invalid kiosk QR format.' });
            return;
        }

        const modeError = validateRoleAndMode(payload.kind);
        if (modeError) {
            setScanResult({ status: 'DENIED', reason: modeError });
            return;
        }

        setSubmitting(true);
        setScanResult(null);
        try {
            if (payload.kind === 'client_entry') {
                const res = await api.post('/access/scan-session', { kiosk_id: payload.kioskId });
                setScanResult(res.data.data as ScanResult);
            } else if (payload.kind === 'staff_check_in') {
                const res = await api.post('/access/check-in');
                setScanResult({ status: 'GRANTED', reason: res.data?.message || 'Clocked in successfully.' });
            } else {
                const res = await api.post('/access/check-out');
                setScanResult({ status: 'GRANTED', reason: res.data?.message || 'Clocked out successfully.' });
            }
        } catch (error: unknown) {
            const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setScanResult({ status: 'DENIED', reason: detail || 'Action failed.' });
        } finally {
            setSubmitting(false);
        }
    }, [validateRoleAndMode]);

    useEffect(() => {
        startScanner();
        return () => stopScanner();
    }, [startScanner, stopScanner]);

    const currentKind = detectedScan?.kind || manualMode;

    return (
        <div className="max-w-xl mx-auto space-y-6 py-8">
            <div>
                <h1 className="text-2xl font-bold text-foreground">{headingByKind[currentKind]}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Scan a QR and confirm the action. Client entry grants access, staff QR codes clock in/out.
                </p>
            </div>

            <div className="kpi-card p-4 space-y-4">
                <div className="overflow-hidden rounded-sm border border-border bg-black/80">
                    <video ref={videoRef} className="h-64 w-full object-cover" playsInline muted />
                </div>
                <canvas ref={canvasRef} className="hidden" />

                <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        {cameraReady ? <Camera className="h-4 w-4 text-primary" /> : <CameraOff className="h-4 w-4" />}
                        {cameraReady ? 'Camera ready' : 'Camera not ready'}
                    </div>
                    <button onClick={startScanner} type="button" className="btn-ghost px-3 py-1.5 text-xs">
                        <RefreshCw size={14} />
                        Restart Camera
                    </button>
                </div>

                {cameraError && (
                    <p className="text-xs text-amber-500">{cameraError}</p>
                )}
            </div>

            <div className="kpi-card p-4 space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Detected QR</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                        value={detectedScan?.kioskId || ''}
                        onChange={(e) => setDetectedScan((prev) => (prev ? { ...prev, kioskId: e.target.value } : prev))}
                        placeholder="Scan to auto-fill kiosk ID"
                        className="input-dark sm:col-span-2 font-mono"
                    />
                    <select
                        className="input-dark font-mono"
                        value={detectedScan?.kind || manualMode}
                        onChange={(e) => setDetectedScan((prev) => (prev ? { ...prev, kind: e.target.value as ScanKind } : prev))}
                        disabled={!detectedScan}
                    >
                        <option value="client_entry">client_entry</option>
                        <option value="staff_check_in">staff_check_in</option>
                        <option value="staff_check_out">staff_check_out</option>
                    </select>
                </div>
                <button
                    type="button"
                    onClick={() => detectedScan && submitAction(detectedScan)}
                    disabled={!detectedScan || submitting}
                    className="btn-primary w-full"
                >
                    <ScanLine size={14} />
                    {submitting ? 'Processing...' : 'Confirm Detected Action'}
                </button>
                <p className="text-xs text-muted-foreground">
                    Supported payloads: raw `kiosk_id`, `gymerp://kiosk/{'{id}'}`, `{`"kiosk_id":"id"`}`, or typed JSON `{`"type":"staff_check_in","kiosk_id":"id"`}`.
                </p>
            </div>

            <div className="kpi-card p-4 space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Manual Fallback</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                        value={manualKioskId}
                        onChange={(e) => setManualKioskId(e.target.value)}
                        placeholder="Enter kiosk ID manually"
                        className="input-dark sm:col-span-2 font-mono"
                    />
                    <select className="input-dark font-mono" value={manualMode} onChange={(e) => setManualMode(e.target.value as ScanKind)}>
                        <option value="client_entry">client_entry</option>
                        <option value="staff_check_in">staff_check_in</option>
                        <option value="staff_check_out">staff_check_out</option>
                    </select>
                </div>
                <button
                    type="button"
                    onClick={() => submitAction({ kind: manualMode, kioskId: manualKioskId.trim() })}
                    disabled={!manualKioskId.trim() || submitting}
                    className="btn-ghost w-full"
                >
                    Submit Manual Action
                </button>
            </div>

            {scanResult && (
                <div className={`kpi-card p-4 border-l-4 ${scanResult.status === 'GRANTED' || scanResult.status === 'ALREADY_SCANNED' ? 'border-l-primary' : 'border-l-destructive'}`}>
                    <div className="flex items-start gap-3">
                        {scanResult.status === 'GRANTED' || scanResult.status === 'ALREADY_SCANNED' ? (
                            <CheckCircle className="h-6 w-6 text-primary mt-0.5" />
                        ) : (
                            <XCircle className="h-6 w-6 text-destructive mt-0.5" />
                        )}
                        <div>
                            <p className="text-sm font-bold text-foreground">{scanResult.status}</p>
                            <p className="text-sm text-muted-foreground">{scanResult.reason || 'Action recorded.'}</p>
                            {scanResult.user_name && (
                                <p className="text-sm text-foreground mt-1">{scanResult.user_name}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
