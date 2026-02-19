'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { Dumbbell, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { login } = useAuth();
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await api.post('/auth/login', { email, password });
            const { access_token } = response.data.data;
            localStorage.setItem('token', access_token);

            const meResp = await api.get('/auth/me', {
                headers: { Authorization: `Bearer ${access_token}` }
            });
            login(access_token, meResp.data.data);
        } catch (err: any) {
            console.error(err);
            setError('Invalid email or password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center" style={{ background: '#111111' }}>
            {/* Subtle radial glow behind the card */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 50% 40% at 50% 50%, rgba(255,107,0,0.06) 0%, transparent 70%)' }} />

            <div className="w-full max-w-md relative z-10 px-6">
                {/* Logo */}
                <div className="flex items-center gap-3 mb-10 justify-center">
                    <div className="h-12 w-12 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #FF6B00, #FF8533)' }}>
                        <Dumbbell size={24} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">GymERP</h1>
                        <p className="text-xs text-[#6B6B6B]">Management System</p>
                    </div>
                </div>

                {/* Card */}
                <div className="rounded-2xl p-8 border border-white/10" style={{ background: '#1a1a1a' }}>
                    <h2 className="text-xl font-bold text-white mb-1">Welcome back</h2>
                    <p className="text-sm text-[#6B6B6B] mb-8">Sign in to your account</p>

                    <form className="space-y-5" onSubmit={handleSubmit}>
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Email</label>
                            <input
                                id="email-address"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="input-dark"
                                placeholder="admin@gym.com"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Password</label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="input-dark pr-11"
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6B6B] hover:text-[#A3A3A3] transition-colors"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary w-full py-2.5"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                    Signing in...
                                </span>
                            ) : 'Sign in'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-xs text-[#6B6B6B] mt-6">
                    Gym ERP v1.0 — Management System
                </p>
            </div>
        </div>
    );
}
