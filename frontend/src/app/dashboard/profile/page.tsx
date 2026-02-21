'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { User, Lock, Save, AlertCircle, CheckCircle } from 'lucide-react';
import ImageCropper from '@/components/ImageCropper';
import { useFeedback } from '@/components/FeedbackProvider';
import { resolveProfileImageUrl } from '@/lib/profileImage';

export default function ProfilePage() {
    const { user, updateUser } = useAuth();
    const { showToast } = useFeedback();

    const [fullName, setFullName] = useState(user?.full_name || '');
    const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || '');
    const [dateOfBirth, setDateOfBirth] = useState(user?.date_of_birth || '');
    const [emergencyContact, setEmergencyContact] = useState(user?.emergency_contact || '');
    const [bio, setBio] = useState(user?.bio || '');

    // Sync local state when user context is loaded
    useEffect(() => {
        if (user) {
            setFullName(user.full_name || '');
            setPhoneNumber(user.phone_number || '');
            setDateOfBirth(user.date_of_birth || '');
            setEmergencyContact(user.emergency_contact || '');
            setBio(user.bio || '');
        }
    }, [user]);

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
            const res = await api.put('/auth/me', {
                full_name: fullName,
                phone_number: phoneNumber || null,
                date_of_birth: dateOfBirth || null,
                emergency_contact: emergencyContact || null,
                bio: bio || null,
            });
            setProfileMsg({ type: 'success', text: 'Profile updated successfully' });
            if (res.data?.data) {
                updateUser(res.data.data);
            }
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

    const handleProfilePictureUpload = async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await api.post('/auth/me/profile-picture', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            if (res.data?.data) {
                updateUser(res.data.data);
            }
        } catch (err) {
            console.error('Failed to upload profile picture', err);
            showToast('Failed to upload picture. Please try again.', 'error');
        }
    };

    const currentProfileImage = resolveProfileImageUrl(user?.profile_picture_url);

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-12">
            <div>
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">My Profile</h1>
                <p className="text-sm text-muted-foreground mt-1">Manage your account settings</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Avatar & Security */}
                <div className="lg:col-span-1 space-y-8">
                    {/* Avatar Section */}
                    <div className="kpi-card p-6 flex flex-col items-center justify-center text-center space-y-4">
                        <ImageCropper
                            onCropComplete={handleProfilePictureUpload}
                            currentImage={currentProfileImage}
                            aspectData={1}
                        />
                        <div>
                            <p className="font-bold text-foreground font-serif">{user?.full_name}</p>
                            <p className="text-sm font-mono text-muted-foreground mt-1">{user?.role}</p>
                        </div>
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
                                <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">Confirm Password</label>
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

                {/* Right Column: Personal Details */}
                <div className="lg:col-span-2">
                    <div className="kpi-card p-6 space-y-6">
                        <div className="flex items-center gap-3 border-b border-border pb-4">
                            <User className="text-primary" size={20} />
                            <h2 className="text-lg font-bold text-foreground font-serif">Personal Details</h2>
                        </div>

                        <form onSubmit={handleProfileUpdate} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                <div>
                                    <label className="block text-xs font-mono text-muted-foreground mb-1">EMAIL ADDRESS (READ ONLY)</label>
                                    <input
                                        type="email"
                                        value={user?.email || ''}
                                        disabled
                                        className="w-full p-2 bg-muted/50 border border-border text-muted-foreground font-mono text-sm cursor-not-allowed"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">Phone Number</label>
                                    <input
                                        type="text"
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value)}
                                        placeholder="+1 (555) 000-0000"
                                        className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">Date of Birth</label>
                                    <input
                                        type="date"
                                        value={dateOfBirth}
                                        onChange={(e) => setDateOfBirth(e.target.value)}
                                        className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">Emergency Contact</label>
                                <input
                                    type="text"
                                    value={emergencyContact}
                                    onChange={(e) => setEmergencyContact(e.target.value)}
                                    placeholder="Jane Doe - +1 (555) 123-4567"
                                    className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">Bio / Notes</label>
                                <textarea
                                    value={bio}
                                    onChange={(e) => setBio(e.target.value)}
                                    placeholder="Tell us a little bit about yourself and your fitness goals..."
                                    className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all min-h-[100px] resize-y"
                                ></textarea>
                            </div>

                            {profileMsg && (
                                <div className={`text-xs p-2 flex items-center gap-2 ${profileMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                                    {profileMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                                    {profileMsg.text}
                                </div>
                            )}

                            <div className="pt-4 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={loadingProfile}
                                    className="btn-primary"
                                >
                                    {loadingProfile ? 'Saving...' : <><Save size={16} /> Save Profile</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
