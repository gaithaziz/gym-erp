'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { ResponsiveContainer } from 'recharts';

type Size = {
    width: number;
    height: number;
};

export default function SafeResponsiveChart({
    children,
    className = 'h-full w-full',
    minHeight = 1,
    minWidth = 1,
}: {
    children: React.ReactElement;
    className?: string;
    minHeight?: number;
    minWidth?: number;
}) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [size, setSize] = useState<Size>({ width: 0, height: 0 });

    useLayoutEffect(() => {
        const node = containerRef.current;
        if (!node) return;

        const updateSize = () => {
            const nextWidth = Math.max(0, Math.floor(node.clientWidth));
            const nextHeight = Math.max(0, Math.floor(node.clientHeight));
            setSize((current) => {
                if (current.width === nextWidth && current.height === nextHeight) {
                    return current;
                }
                return { width: nextWidth, height: nextHeight };
            });
        };

        updateSize();

        const observer = new ResizeObserver(() => {
            updateSize();
        });

        observer.observe(node);
        window.addEventListener('resize', updateSize);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateSize);
        };
    }, []);

    const isReady = size.width >= minWidth && size.height >= minHeight;

    return (
        <div ref={containerRef} className={className} style={{ minHeight, minWidth }}>
            {isReady ? (
                <ResponsiveContainer width="100%" height="100%" minHeight={minHeight} minWidth={minWidth}>
                    {children}
                </ResponsiveContainer>
            ) : null}
        </div>
    );
}
