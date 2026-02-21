'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Dumbbell, Eye, EyeOff } from 'lucide-react';

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
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="w-full max-w-md relative z-10">
                {/* Logo */}
                <div className="flex items-center gap-3 mb-10 justify-center">
                    <div className="h-12 w-12 flex items-center justify-center bg-primary rounded-sm shadow-none">
                        <Dumbbell size={24} className="text-primary-foreground" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground tracking-tight font-serif">GymERP</h1>
                        <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Management System</p>
                    </div>
                </div>

                {/* Card */}
                <div className="p-8 border border-border bg-card shadow-lg">
                    <h2 className="text-xl font-bold text-foreground mb-1 font-serif">Welcome back</h2>
                    <p className="text-sm text-muted-foreground mb-8">Sign in to your account</p>

                    <form className="space-y-5" onSubmit={handleSubmit}>
                        {error && (
                            <div className="bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive font-medium">
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
                                className="input-dark rounded-sm"
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
                                    className="input-dark pr-11 rounded-sm"
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
                            className="btn-primary w-full py-2.5 rounded-sm"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                                    AUTHENTICATING...
                                </span>
                            ) : 'SIGN IN'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-xs text-muted-foreground mt-6 font-mono">
                    Gym ERP v1.0 — Industrial Strength Software
                </p>
            </div>
        </div>
    );
}
