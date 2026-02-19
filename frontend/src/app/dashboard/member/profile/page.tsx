'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { User, Lock, Save, AlertCircle, CheckCircle } from 'lucide-react';

export default function ProfilePage() {
    const { user } = useAuth(); // re-login might be needed to update context if we don't have a reloadUser method
    // Actually, context user update might be tricky without a refresh. 
    // We can just update local state and prompt refresh or manually update if context supports it.
    // For now, we'll assume a page reload or just showing success message is enough.

    const [fullName, setFullName] = useState(user?.full_name || '');
    const [loadingProfile, setLoadingProfile] = useState(false);
    const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
    const [loadingPass, setLoadingPass] = useState(false);
    const [passMsg, setPassMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleProfileUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoadingProfile(true);
        setProfileMsg(null);
        try {
            await api.put('/auth/me', { full_name: fullName });
            setProfileMsg({ type: 'success', text: 'Profile updated successfully' });
            // In a real app, we'd update the global auth context here
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setProfileMsg({ type: 'error', text: error.response?.data?.detail || 'Failed to update profile' });
        } finally {
            setLoadingProfile(false);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (passwords.new !== passwords.confirm) {
            setPassMsg({ type: 'error', text: 'New passwords do not match' });
            return;
        }
        setLoadingPass(true);
        setPassMsg(null);
        try {
            await api.put('/auth/me/password', {
                current_password: passwords.current,
                new_password: passwords.new
            });
            setPassMsg({ type: 'success', text: 'Password changed successfully' });
            setPasswords({ current: '', new: '', confirm: '' });
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setPassMsg({ type: 'error', text: error.response?.data?.detail || 'Failed to change password' });
        } finally {
            setLoadingPass(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">My Profile</h1>
                <p className="text-sm text-muted-foreground mt-1">Manage your account settings</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Profile Details */}
                <div className="kpi-card p-6 space-y-6">
                    <div className="flex items-center gap-3 border-b border-border pb-4">
                        <User className="text-primary" size={20} />
                        <h2 className="text-lg font-bold text-foreground font-serif">Personal Details</h2>
                    </div>

                    <form onSubmit={handleProfileUpdate} className="space-y-4">
                        <div>
                            <label className="block text-xs font-mono text-muted-foreground mb-1">EMAIL ADDRESS (READ ONLY)</label>
                            <input
                                type="email"
                                value={user?.email || ''}
                                disabled
                                className="w-full p-2 bg-muted/50 border border-border text-muted-foreground font-mono text-sm cursor-not-allowed"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">Full Name</label>
                            <input
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                required
                            />
                        </div>

                        {profileMsg && (
                            <div className={`text-xs p-2 flex items-center gap-2 ${profileMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                                {profileMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                                {profileMsg.text}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loadingProfile}
                            className="w-full py-2 bg-foreground text-background font-bold uppercase tracking-wider text-xs hover:bg-foreground/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loadingProfile ? 'Saving...' : <><Save size={14} /> Save Changes</>}
                        </button>
                    </form>
                </div>

                {/* Password Change */}
                <div className="kpi-card p-6 space-y-6">
                    <div className="flex items-center gap-3 border-b border-border pb-4">
                        <Lock className="text-primary" size={20} />
                        <h2 className="text-lg font-bold text-foreground font-serif">Security</h2>
                    </div>

                    <form onSubmit={handlePasswordChange} className="space-y-4">
                        <div>
                            <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">Current Password</label>
                            <input
                                type="password"
                                value={passwords.current}
                                onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                                className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">New Password</label>
                            <input
                                type="password"
                                value={passwords.new}
                                onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                                className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                required
                                minLength={6}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">Confirm New Password</label>
                            <input
                                type="password"
                                value={passwords.confirm}
                                onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                                className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                required
                            />
                        </div>

                        {passMsg && (
                            <div className={`text-xs p-2 flex items-center gap-2 ${passMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                                {passMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                                {passMsg.text}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loadingPass}
                            className="w-full py-2 border border-foreground text-foreground font-bold uppercase tracking-wider text-xs hover:bg-muted transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loadingPass ? 'Updating...' : 'Update Password'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
