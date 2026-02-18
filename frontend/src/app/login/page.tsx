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
        <div className="flex min-h-screen" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
            {/* Left — Branding Panel */}
            <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center px-16">
                <div className="flex items-center gap-4 mb-8">
                    <div className="icon-blue h-16 w-16 rounded-2xl flex items-center justify-center shadow-2xl">
                        <Dumbbell size={32} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-bold text-white">Gym ERP</h1>
                        <p className="text-slate-400 text-sm">Management System</p>
                    </div>
                </div>
                <p className="text-slate-400 text-center max-w-sm leading-relaxed">
                    Your all-in-one solution for gym operations — manage staff, track finances, build workout plans, and monitor performance.
                </p>
            </div>

            {/* Right — Login Form */}
            <div className="flex-1 flex items-center justify-center px-8">
                <div className="w-full max-w-md">
                    {/* Mobile logo */}
                    <div className="lg:hidden flex items-center gap-3 mb-10 justify-center">
                        <div className="icon-blue h-12 w-12 rounded-xl flex items-center justify-center shadow-lg">
                            <Dumbbell size={24} className="text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-white">Gym ERP</h1>
                    </div>

                    <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8 border border-white/10 shadow-2xl">
                        <h2 className="text-2xl font-bold text-white mb-1">Welcome back</h2>
                        <p className="text-sm text-slate-400 mb-8">Sign in to your account</p>

                        <form className="space-y-5" onSubmit={handleSubmit}>
                            {error && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">
                                    {error}
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                                <input
                                    id="email-address"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 outline-none text-sm transition-all"
                                    placeholder="admin@gym.com"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
                                <div className="relative">
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        autoComplete="current-password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 pr-11 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 outline-none text-sm transition-all"
                                        placeholder="••••••••"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-2.5 rounded-xl font-medium text-sm hover:shadow-lg hover:shadow-blue-500/25 transition-all disabled:opacity-50"
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

                    <p className="text-center text-xs text-slate-500 mt-6">
                        Gym ERP v1.0 — Management System
                    </p>
                </div>
            </div>
        </div>
    );
}
