'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Camera, CameraOff, CheckCircle, RefreshCw, ScanLine, XCircle } from 'lucide-react';
import jsQR from 'jsqr';

const KIOSK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

type ScanResult = {
    status: string;
    user_name?: string;
    reason?: string | null;
};

const parseKioskIdFromQr = (rawValue: string): string | null => {
    const trimmed = rawValue.trim();
    if (!trimmed) return null;

    if (KIOSK_ID_PATTERN.test(trimmed)) {
        return trimmed;
    }

    if (trimmed.startsWith('gymerp://kiosk/')) {
        const kioskId = trimmed.replace('gymerp://kiosk/', '').trim();
        return KIOSK_ID_PATTERN.test(kioskId) ? kioskId : null;
    }

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
            const parsed = JSON.parse(trimmed) as { kiosk_id?: string };
            const kioskId = parsed.kiosk_id?.trim();
            return kioskId && KIOSK_ID_PATTERN.test(kioskId) ? kioskId : null;
        } catch {
            return null;
        }
    }

    return null;
};

export default function QRCodePage() {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [cameraReady, setCameraReady] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [detectedKioskId, setDetectedKioskId] = useState('');
    const [manualKioskId, setManualKioskId] = useState('');
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [submitting, setSubmitting] = useState(false);

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
        setDetectedKioskId('');

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
                if (!videoRef.current || submitting || detectedKioskId) return;
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
                    const kioskId = parseKioskIdFromQr(value);
                    if (kioskId) {
                        setDetectedKioskId(kioskId);
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
    }, [detectedKioskId, stopScanner, submitting]);

    const confirmCheckIn = useCallback(async (kioskId: string) => {
        if (!KIOSK_ID_PATTERN.test(kioskId)) {
            setScanResult({ status: 'DENIED', reason: 'Invalid kiosk QR format.' });
            return;
        }

        setSubmitting(true);
        setScanResult(null);
        try {
            const res = await api.post('/access/scan-session', { kiosk_id: kioskId });
            setScanResult(res.data.data as ScanResult);
        } catch (error: unknown) {
            const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setScanResult({ status: 'DENIED', reason: detail || 'Check-in failed.' });
        } finally {
            setSubmitting(false);
        }
    }, []);

    useEffect(() => {
        startScanner();
        return () => stopScanner();
    }, [startScanner, stopScanner]);

    return (
        <div className="max-w-xl mx-auto space-y-6 py-8">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Scan Entrance QR</h1>
                <p className="text-sm text-muted-foreground mt-1">Scan the kiosk QR, then confirm your check-in.</p>
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
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Detected Kiosk</label>
                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        value={detectedKioskId}
                        onChange={(e) => setDetectedKioskId(e.target.value)}
                        placeholder="Scan to auto-fill kiosk ID"
                        className="input-dark flex-1 font-mono"
                    />
                    <button
                        type="button"
                        onClick={() => confirmCheckIn(detectedKioskId)}
                        disabled={!detectedKioskId || submitting}
                        className="btn-primary sm:w-auto w-full"
                    >
                        <ScanLine size={14} />
                        {submitting ? 'Checking...' : 'Confirm Check-In'}
                    </button>
                </div>
                <p className="text-xs text-muted-foreground">Supported QR payloads: `kiosk_id`, `gymerp://kiosk/{'{id}'}`, or `{`"kiosk_id":"{id}"`}`.</p>
            </div>

            <div className="kpi-card p-4 space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Manual Fallback</label>
                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        value={manualKioskId}
                        onChange={(e) => setManualKioskId(e.target.value)}
                        placeholder="Enter kiosk ID manually"
                        className="input-dark flex-1 font-mono"
                    />
                    <button
                        type="button"
                        onClick={() => confirmCheckIn(manualKioskId.trim())}
                        disabled={!manualKioskId.trim() || submitting}
                        className="btn-ghost sm:w-auto w-full"
                    >
                        Submit
                    </button>
                </div>
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
                            <p className="text-sm text-muted-foreground">{scanResult.reason || 'Check-in recorded.'}</p>
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
