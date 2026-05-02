'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PerksRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/dashboard/subscription');
    }, [router]);

    return null;
}
