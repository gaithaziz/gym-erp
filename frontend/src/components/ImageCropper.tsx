import React, { useState, useCallback, useRef } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import Image from 'next/image';
import { Upload, Crop as CropIcon } from 'lucide-react';
import Modal from './Modal';

interface ImageCropperProps {
    onCropComplete: (file: File) => void;
    currentImage?: string;
    aspectData?: number;
}

// Helper to extract a cropped image purely in the browser using Canvas
const getCroppedImg = async (imageSrc: string, pixelCrop: Area): Promise<File> => {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        img.src = imageSrc;
        img.onload = () => resolve(img);
        img.onerror = (error: Event | string) => reject(error);
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) throw new Error('No 2d context');

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
    );

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Canvas is empty'));
                return;
            }
            const file = new File([blob], 'cropped.jpg', { type: 'image/jpeg' });
            resolve(file);
        }, 'image/jpeg');
    });
};

export default function ImageCropper({ onCropComplete, currentImage, aspectData = 1 }: ImageCropperProps) {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [previewImageFailed, setPreviewImageFailed] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const profileAlt = 'Profile';
    const uploadLabel = 'Upload';
    const modalTitle = 'Adjust Picture';
    const cropShapeRound = 'round' as const;
    const zoomLabel = 'Zoom';
    const cancelLabel = 'Cancel';
    const cropSaveLabel = 'Crop & Save';

    React.useEffect(() => {
        setPreviewImageFailed(false);
    }, [currentImage]);

    const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const reader = new FileReader();
            reader.addEventListener('load', () => {
                setImageSrc(reader.result?.toString() || null);
                setIsModalOpen(true);
            });
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    const handleCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const processCrop = async () => {
        try {
            if (imageSrc && croppedAreaPixels) {
                const croppedFile = await getCroppedImg(imageSrc, croppedAreaPixels);
                onCropComplete(croppedFile);
                setIsModalOpen(false);
                setImageSrc(null);
            }
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div>
            <div className="flex flex-col items-center gap-4">
                <div className="relative group w-32 h-32 rounded-full overflow-hidden border-2 border-border bg-muted flex items-center justify-center">
                    {currentImage && !previewImageFailed ? (
                        <Image src={currentImage} alt={profileAlt} fill className="object-cover" unoptimized onError={() => setPreviewImageFailed(true)} />
                    ) : (
                        <UserPlaceholder />
                    )}
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer"
                    >
                        <Upload size={20} className="mb-1" />
                        <span className="text-xs font-medium">{uploadLabel}</span>
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={onSelectFile}
                        accept="image/*"
                        className="hidden"
                    />
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setImageSrc(null); }} title={modalTitle}>
                <div className="space-y-4">
                    <div className="relative h-48 md:h-56 w-full bg-black rounded-sm overflow-hidden touch-none">
                        {imageSrc && (
                            <Cropper
                                image={imageSrc}
                                crop={crop}
                                zoom={zoom}
                                aspect={aspectData}
                                onCropChange={setCrop}
                                onCropComplete={handleCropComplete}
                                onZoomChange={setZoom}
                                cropShape={cropShapeRound}
                                showGrid={false}
                            />
                        )}
                    </div>
                    <div className="px-2">
                        <label className="text-xs text-muted-foreground mb-2 block">{zoomLabel}</label>
                        <input
                            type="range"
                            value={zoom}
                            min={1}
                            max={3}
                            step={0.1}
                            aria-labelledby={zoomLabel}
                            onChange={(e) => setZoom(Number(e.target.value))}
                            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="btn-ghost">{cancelLabel}</button>
                        <button type="button" onClick={processCrop} className="btn-primary"><CropIcon size={16} /> {cropSaveLabel}</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

function UserPlaceholder() {
    const svgXmlns = 'http://www.w3.org/2000/svg';
    const fillRuleEvenOdd = 'evenodd';
    const clipRuleEvenOdd = 'evenodd';
    const avatarPath = 'M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z';
    return (
        <svg className="w-16 h-16 text-muted-foreground" fill="currentColor" viewBox="0 0 20 20" xmlns={svgXmlns}>
            <path fillRule={fillRuleEvenOdd} d={avatarPath} clipRule={clipRuleEvenOdd} />
        </svg>
    )
}
