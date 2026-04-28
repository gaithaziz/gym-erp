'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface Branch {
    id: string;
    name: string;
    gym_id?: string;
    display_name?: string | null;
    gym_name?: string;
}

interface BranchContextType {
    branches: Branch[];
    selectedBranchId: string;
    setSelectedBranchId: (id: string) => void;
    isLoading: boolean;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export function BranchProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [branches, setBranches] = useState<Branch[]>([]);
    const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
    const [isLoading, setIsLoading] = useState(false);
    const canUseBranchScope = Boolean(user && ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role));

    useEffect(() => {
        if (!canUseBranchScope || !user) {
            return;
        }

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsLoading(true);
        const endpoint = user.role === 'SUPER_ADMIN' ? '/system/branches' : '/hr/branches';
        api.get(endpoint)
            .then(res => {
                const branchData = user.role === 'SUPER_ADMIN'
                    ? (Array.isArray(res.data) ? res.data : [])
                    : (res.data.data || []);
                setBranches(branchData);
                
                // Persistence: try to load from localStorage
                const saved = localStorage.getItem(`selected_branch_${user.id}`);
                if (saved && (saved === 'all' || branchData.some((b: Branch) => b.id === saved))) {
                    setSelectedBranchId(saved);
                }
            })
            .catch(err => console.error("Failed to fetch branches", err))
            .finally(() => setIsLoading(false));
    }, [canUseBranchScope, user]);

    const handleSetBranch = (id: string) => {
        if (!canUseBranchScope) return;
        setSelectedBranchId(id);
        if (user) {
            localStorage.setItem(`selected_branch_${user.id}`, id);
        }
    };

    const effectiveBranches = canUseBranchScope ? branches : [];
    const effectiveSelectedBranchId = canUseBranchScope ? selectedBranchId : 'all';

    return (
        <BranchContext.Provider value={{ branches: effectiveBranches, selectedBranchId: effectiveSelectedBranchId, setSelectedBranchId: handleSetBranch, isLoading: canUseBranchScope ? isLoading : false }}>
            {children}
        </BranchContext.Provider>
    );
}

export function useBranch() {
    const context = useContext(BranchContext);
    if (context === undefined) {
        throw new Error('useBranch must be used within a BranchProvider');
    }
    return context;
}
