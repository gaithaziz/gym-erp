'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useLocale } from '@/context/LocaleContext';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface DashboardGridProps {
    children: React.ReactNode;
    layoutId: string; // Unique ID for storing layout in localStorage
}

// Default layout configuration
const defaultLayouts = {
    lg: [
        { i: 'stats-0', x: 0, y: 0, w: 3, h: 4 },
        { i: 'stats-1', x: 3, y: 0, w: 3, h: 4 },
        { i: 'stats-2', x: 6, y: 0, w: 3, h: 4 },
        { i: 'stats-3', x: 9, y: 0, w: 3, h: 4 },
        { i: 'chart-visits', x: 0, y: 4, w: 6, h: 10 },
        { i: 'chart-revenue', x: 6, y: 4, w: 6, h: 10 },
        { i: 'activity', x: 0, y: 14, w: 12, h: 8 },
    ],
    md: [
        { i: 'stats-0', x: 0, y: 0, w: 5, h: 4 },
        { i: 'stats-1', x: 5, y: 0, w: 5, h: 4 },
        { i: 'stats-2', x: 0, y: 4, w: 5, h: 4 },
        { i: 'stats-3', x: 5, y: 4, w: 5, h: 4 },
        { i: 'chart-visits', x: 0, y: 8, w: 10, h: 10 },
        { i: 'chart-revenue', x: 0, y: 18, w: 10, h: 10 },
        { i: 'activity', x: 0, y: 28, w: 10, h: 8 },
    ],
    sm: [ // Mobile/Tablet
        { i: 'stats-0', x: 0, y: 0, w: 6, h: 4 },
        { i: 'stats-1', x: 0, y: 4, w: 6, h: 4 },
        { i: 'stats-2', x: 0, y: 8, w: 6, h: 4 },
        { i: 'stats-3', x: 0, y: 12, w: 6, h: 4 },
        { i: 'chart-visits', x: 0, y: 16, w: 6, h: 10 },
        { i: 'chart-revenue', x: 0, y: 26, w: 6, h: 10 },
        { i: 'activity', x: 0, y: 36, w: 6, h: 8 },
    ]
};

const COLS = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 } as const;

type GridItem = { i: string; x: number; y: number; w: number; h: number };
type GridLayouts = Partial<Record<keyof typeof COLS, GridItem[]>>;

function minSizeForKey(key: string): { w: number; h: number } {
    // Prevent important cards/charts from collapsing to near-zero size.
    if (key.startsWith('stats-')) return { w: 2, h: 3 };
    if (key === 'chart-visits' || key === 'chart-revenue') return { w: 4, h: 8 };
    if (key === 'activity') return { w: 4, h: 6 };
    return { w: 1, h: 2 };
}

function normalizeItem(item: GridItem, cols: number): GridItem {
    const min = minSizeForKey(item.i);
    const w = Math.max(min.w, Math.min(cols, Number.isFinite(item.w) ? item.w : min.w));
    const h = Math.max(min.h, Number.isFinite(item.h) ? item.h : min.h);
    const xRaw = Number.isFinite(item.x) ? item.x : 0;
    const x = Math.max(0, Math.min(cols - w, xRaw));
    const y = Math.max(0, Number.isFinite(item.y) ? item.y : 0);
    return { i: item.i, x, y, w, h };
}

function sanitizeLayouts(stored: unknown, requiredKeys: string[]): GridLayouts {
    if (!stored || typeof stored !== 'object') return defaultLayouts;
    const parsed = stored as GridLayouts;
    const normalized: GridLayouts = {};
    const breakpoints = Object.keys(COLS) as Array<keyof typeof COLS>;

    for (const bp of breakpoints) {
        const cols = COLS[bp];
        const fallback = (defaultLayouts as GridLayouts)[bp] ?? (defaultLayouts as GridLayouts).sm ?? [];
        const fallbackByKey = new Map(fallback.map((item) => [item.i, item]));
        const sourceRaw = Array.isArray(parsed[bp]) ? parsed[bp]! : [];
        const sourceByKey = new Map<string, GridItem>();

        sourceRaw.forEach((item) => {
            if (!item || typeof item !== 'object') return;
            const next = item as GridItem;
            if (typeof next.i !== 'string') return;
            if (!requiredKeys.includes(next.i)) return;
            sourceByKey.set(next.i, normalizeItem(next, cols));
        });

        normalized[bp] = requiredKeys.map((key, index) => {
            const fromSource = sourceByKey.get(key);
            if (fromSource) return fromSource;
            const fromFallback = fallbackByKey.get(key);
            if (fromFallback) return normalizeItem(fromFallback, cols);
            const min = minSizeForKey(key);
            return {
                i: key,
                x: 0,
                y: index * 4,
                w: Math.min(cols, Math.max(min.w, cols >= 6 ? 3 : cols)),
                h: Math.max(min.h, 4),
            };
        });
    }

    return normalized;
}

export function DashboardGrid({ children, layoutId }: DashboardGridProps) {
    const { direction } = useLocale();
    const isRtl = direction === 'rtl';
    const useSafeStaticGrid = true;
    const [layouts, setLayouts] = useState<GridLayouts>(defaultLayouts);
    const [mounted, setMounted] = useState(false);
    const storageKey = `dashboard_layout_v3_${layoutId}_${direction}`;
    const childKeys = useMemo(
        () =>
            React.Children.toArray(children)
                .map((child) => {
                    if (!React.isValidElement(child)) return null;
                    const rawKey = child.key;
                    if (rawKey == null) return null;
                    return String(rawKey).replace(/^\.\$?/, '');
                })
                .filter((key): key is string => Boolean(key)),
        [children]
    );
    const directionalChildren = useMemo(
        () =>
            React.Children.map(children, (child) => {
                if (!React.isValidElement(child)) return child;
                return React.cloneElement(
                    child as React.ReactElement<Record<string, unknown>>,
                    { dir: direction } as Record<string, unknown>
                );
            }),
        [children, direction]
    );

    useEffect(() => {
        if (isRtl) {
            setLayouts(sanitizeLayouts(defaultLayouts, childKeys));
            setMounted(true);
            return;
        }

        const storedLayout = localStorage.getItem(storageKey);
        setTimeout(() => {
            setMounted(true);
            if (storedLayout) {
                try {
                    setLayouts(sanitizeLayouts(JSON.parse(storedLayout), childKeys));
                } catch {
                    console.error("Failed to parse stored layout");
                    setLayouts(sanitizeLayouts(defaultLayouts, childKeys));
                }
                return;
            }
            setLayouts(sanitizeLayouts(defaultLayouts, childKeys));
        }, 0);
    }, [childKeys, isRtl, storageKey]);

    const handleLayoutChange = (_layout: unknown, allLayouts: unknown) => {
        const safeLayouts = sanitizeLayouts(allLayouts, childKeys);
        setLayouts(safeLayouts);
        if (!isRtl) {
            localStorage.setItem(storageKey, JSON.stringify(safeLayouts));
        }
    };

    if (!mounted) {
        const childCount = Math.max(React.Children.count(children), 7);

        return (
            <div
                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4 animate-pulse"
                aria-busy="true"
                aria-live="polite"
            >
                {Array.from({ length: childCount }).map((_, idx) => {
                    const blockClass =
                        idx < 4
                            ? 'xl:col-span-3 min-h-[130px]'
                            : idx < 6
                                ? 'xl:col-span-6 min-h-[320px]'
                                : 'xl:col-span-12 min-h-[220px]';

                    return (
                        <div
                            key={`placeholder-${idx}`}
                            className={`border border-border bg-card p-5 ${blockClass}`}
                        >
                            <div className="h-3 w-24 bg-muted rounded-sm mb-4" />
                            <div className="h-7 w-20 bg-muted rounded-sm mb-2" />
                            <div className="h-3 w-32 bg-muted/70 rounded-sm" />
                        </div>
                    );
                })}
            </div>
        );
    }

    if (useSafeStaticGrid || isRtl) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
                {React.Children.toArray(directionalChildren).map((child, idx) => {
                    const blockClass =
                        idx < 4
                            ? 'xl:col-span-3 min-h-[130px]'
                            : idx < 6
                                ? 'xl:col-span-6 min-h-[320px]'
                                : 'xl:col-span-12 min-h-[220px]';

                    return (
                        <div key={`rtl-grid-${idx}`} className={blockClass}>
                            {child}
                        </div>
                    );
                })}
            </div>
        );
    }

    return (
        <ResponsiveGridLayout
            className="layout"
            layouts={layouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={COLS}
            rowHeight={30}
            onLayoutChange={handleLayoutChange}
            compactType="vertical"
            preventCollision={false}
            isDraggable
            isResizable
            draggableHandle=".drag-handle"
            style={{ direction: 'ltr' }}
        >
            {directionalChildren}
        </ResponsiveGridLayout>
    );
}
