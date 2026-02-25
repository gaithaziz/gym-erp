'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Dumbbell, Eye, EyeOff, ShieldCheck, Zap, Users } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await api.post('/auth/login', { email, password });
            const { access_token, refresh_token } = response.data.data;

            const meResp = await api.get('/auth/me', {
                headers: { Authorization: `Bearer ${access_token}` }
            });
            login(access_token, refresh_token, meResp.data.data);
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { detail?: string } } };
            console.error(err);
            setError(axiosErr.response?.data?.detail || 'Invalid email or password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8 overflow-hidden flex items-center">
            <div className="pointer-events-none absolute inset-0 opacity-60">
                <div className="absolute -top-20 -left-16 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
                <div className="absolute -bottom-24 -right-20 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />
                <div className="absolute left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/10" />
                <div className="absolute left-1/2 top-1/2 h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/40" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:44px_44px]" />
            </div>

            <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2 relative z-10">
                <div className="hidden lg:flex flex-col justify-between rounded-md border border-border bg-card p-8">
                    <div>
                        <div className="flex items-center gap-3 mb-8">
                            <div className="h-12 w-12 flex items-center justify-center bg-primary rounded-md">
                                <Dumbbell size={24} className="text-primary-foreground" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-foreground tracking-tight font-serif">GymERP</h1>
                                <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Management System</p>
                            </div>
                        </div>

                        <h2 className="text-3xl font-bold text-foreground font-serif leading-tight">
                            One dashboard
                            <br />
                            for your whole gym
                        </h2>
                        <p className="mt-4 text-sm text-muted-foreground max-w-sm">
                            Manage members, staff, attendance, and payroll with a single clean workflow.
                        </p>

                        <div className="mt-6 grid grid-cols-3 gap-3">
                            <div className="rounded-md border border-border bg-background/70 p-3 text-center">
                                <p className="text-[10px] font-mono uppercase text-muted-foreground">Modules</p>
                                <p className="mt-1 text-lg font-bold text-primary">12+</p>
                            </div>
                            <div className="rounded-md border border-border bg-background/70 p-3 text-center">
                                <p className="text-[10px] font-mono uppercase text-muted-foreground">Automation</p>
                                <p className="mt-1 text-lg font-bold text-primary">Live</p>
                            </div>
                            <div className="rounded-md border border-border bg-background/70 p-3 text-center">
                                <p className="text-[10px] font-mono uppercase text-muted-foreground">Access</p>
                                <p className="mt-1 text-lg font-bold text-primary">Secure</p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="rounded-md border border-border bg-muted/20 p-3 flex items-center gap-3">
                            <Users size={16} className="text-primary" />
                            <p className="text-sm text-foreground">Membership and staff lifecycle in one place</p>
                        </div>
                        <div className="rounded-md border border-border bg-muted/20 p-3 flex items-center gap-3">
                            <ShieldCheck size={16} className="text-primary" />
                            <p className="text-sm text-foreground">Secure access with role-based control</p>
                        </div>
                        <div className="rounded-md border border-border bg-muted/20 p-3 flex items-center gap-3">
                            <Zap size={16} className="text-primary" />
                            <p className="text-sm text-foreground">Fast operations for front-desk and management</p>
                        </div>
                    </div>
                </div>

                <div className="w-full rounded-md border border-border bg-card p-8 shadow-lg relative overflow-hidden">
                    <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-primary/10 blur-2xl" />
                    <div className="pointer-events-none absolute -left-10 -bottom-10 h-28 w-28 rounded-full bg-emerald-500/10 blur-2xl" />
                    <div className="flex items-center gap-3 mb-8 lg:hidden">
                        <div className="h-10 w-10 flex items-center justify-center bg-primary rounded-md">
                            <Dumbbell size={20} className="text-primary-foreground" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-foreground tracking-tight font-serif">GymERP</h1>
                            <p className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">Management System</p>
                        </div>
                    </div>

                    <h2 className="text-xl font-bold text-foreground mb-1 font-serif">Welcome back</h2>
                    <p className="text-sm text-muted-foreground mb-8">Sign in to your account</p>

                    <form className="space-y-5" onSubmit={handleSubmit}>
                        {error && (
                            <div className="bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive font-medium rounded-md">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Email</label>
                            <input
                                id="email-address"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="input-dark rounded-md"
                                placeholder="admin@gym.com"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Password</label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="input-dark pr-11 rounded-md"
                                    placeholder="********"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary w-full py-2.5 rounded-md"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                                    AUTHENTICATING...
                                </span>
                            ) : 'SIGN IN'}
                        </button>
                    </form>

                    <p className="text-center text-xs text-muted-foreground mt-5 font-mono">
                        Gym ERP v1.0 - Industrial Strength Software
                    </p>
                </div>
            </div>
        </div>
    );
}
