'use client';

import React, { useEffect, useState } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

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

export function DashboardGrid({ children, layoutId }: DashboardGridProps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [layouts, setLayouts] = useState<any>(defaultLayouts);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const storedLayout = localStorage.getItem(`dashboard_layout_${layoutId}`);
        setTimeout(() => {
            setMounted(true);
            if (storedLayout) {
                try {
                    setLayouts(JSON.parse(storedLayout));
                } catch {
                    console.error("Failed to parse stored layout");
                }
            }
        }, 0);
    }, [layoutId]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleLayoutChange = (layout: any, allLayouts: any) => {
        setLayouts(allLayouts);
        localStorage.setItem(`dashboard_layout_${layoutId}`, JSON.stringify(allLayouts));
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

    return (
        <ResponsiveGridLayout
            className="layout"
            layouts={layouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={30}
            onLayoutChange={handleLayoutChange}
            compactType="vertical"
            preventCollision={false}
            isDraggable
            isResizable
            draggableHandle=".drag-handle"
        >
            {children}
        </ResponsiveGridLayout>
    );
}
