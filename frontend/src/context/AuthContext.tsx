'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { clearTokens, getAccessToken, setTokens } from '@/lib/tokenStorage';
import { api } from '@/lib/api';

interface User {
    id: string;
    email: string;
    full_name: string;
    role: string;
    profile_picture_url?: string;
    phone_number?: string;
    date_of_birth?: string;
    emergency_contact?: string;
    bio?: string;
    subscription_status?: 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'NONE';
    subscription_end_date?: string | null;
    subscription_plan_name?: string | null;
    is_subscription_blocked?: boolean;
    block_reason?: 'SUBSCRIPTION_EXPIRED' | 'SUBSCRIPTION_FROZEN' | 'NO_ACTIVE_SUBSCRIPTION' | null;
}

interface AuthContextType {
    user: User | null;
    login: (accessToken: string, refreshToken: string, userData: User) => void;
    logout: () => void;
    updateUser: (userData: User) => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const initializeAuth = async () => {
            const token = getAccessToken();
            const storedUser = localStorage.getItem('user');

            if (!token) {
                setIsLoading(false);
                return;
            }

            if (storedUser) {
                setUser(JSON.parse(storedUser));
            }

            try {
                const meResp = await api.get('/auth/me');
                const freshUser = meResp.data?.data;
                if (freshUser) {
                    localStorage.setItem('user', JSON.stringify(freshUser));
                    setUser(freshUser);
                }
            } catch {
                if (!storedUser) {
                    clearTokens();
                    localStorage.removeItem('user');
                    setUser(null);
                }
            } finally {
                setIsLoading(false);
            }
        };

        setTimeout(() => {
            initializeAuth();
        }, 0);
    }, []);

    const login = (accessToken: string, refreshToken: string, userData: User) => {
        setTokens(accessToken, refreshToken);
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        router.push('/dashboard');
    };

    const logout = () => {
        clearTokens();
        localStorage.removeItem('user');
        setUser(null);
        router.push('/login');
    };

    const updateUser = (userData: User) => {
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, updateUser, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
