'use client';

import ClassesDashboardContent from '@/components/classes/ClassesDashboardContent';
import { useAuth } from '@/context/AuthContext';

export default function ClassesPage() {
    const { user } = useAuth();
    return <ClassesDashboardContent role={user?.role === 'MANAGER' ? 'MANAGER' : 'ADMIN'} />;
}
