'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { User, Lock, Save, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
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
    const [loadingBioData, setLoadingBioData] = useState(false);
    const [bioDataMsg, setBioDataMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [bioData, setBioData] = useState({
        height_cm: '',
        weight_kg: '',
        body_fat_pct: '',
        muscle_mass_kg: '',
    });

    const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
    const [showPasswords, setShowPasswords] = useState(false);
    const [loadingPass, setLoadingPass] = useState(false);
    const [passMsg, setPassMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const computeAge = (dob?: string) => {
        if (!dob) return null;
        const birthDate = new Date(dob);
        if (Number.isNaN(birthDate.getTime())) return null;
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
        return age >= 0 ? age : null;
    };
    const age = computeAge(dateOfBirth);

    useEffect(() => {
        const loadLatestBioData = async () => {
            try {
                const res = await api.get('/fitness/biometrics?limit=1&offset=0');
                const latest = res.data?.data?.[0];
                if (latest) {
                    setBioData({
                        height_cm: latest.height_cm?.toString() ?? '',
                        weight_kg: latest.weight_kg?.toString() ?? '',
                        body_fat_pct: latest.body_fat_pct?.toString() ?? '',
                        muscle_mass_kg: latest.muscle_mass_kg?.toString() ?? '',
                    });
                }
            } catch {
                // keep defaults
            }
        };
        loadLatestBioData();
    }, [user?.email]);

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

    const handleBioDataUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoadingBioData(true);
        setBioDataMsg(null);
        try {
            await api.post('/fitness/biometrics', {
                height_cm: bioData.height_cm ? parseFloat(bioData.height_cm) : null,
                weight_kg: bioData.weight_kg ? parseFloat(bioData.weight_kg) : null,
                body_fat_pct: bioData.body_fat_pct ? parseFloat(bioData.body_fat_pct) : null,
                muscle_mass_kg: bioData.muscle_mass_kg ? parseFloat(bioData.muscle_mass_kg) : null,
            });
            setBioDataMsg({ type: 'success', text: 'Bio data saved and tracked successfully' });
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setBioDataMsg({ type: 'error', text: error.response?.data?.detail || 'Failed to save bio data' });
        } finally {
            setLoadingBioData(false);
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
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-mono text-muted-foreground uppercase">Password Fields</span>
                                <button
                                    type="button"
                                    onClick={() => setShowPasswords((prev) => !prev)}
                                    className="text-xs font-mono text-primary hover:text-primary/80 flex items-center gap-1"
                                >
                                    {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
                                    {showPasswords ? 'Hide Passwords' : 'Show Passwords'}
                                </button>
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">Current Password</label>
                                <input
                                    type={showPasswords ? 'text' : 'password'}
                                    value={passwords.current}
                                    onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                                    className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">New Password</label>
                                <input
                                    type={showPasswords ? 'text' : 'password'}
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
                                    type={showPasswords ? 'text' : 'password'}
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">Age (Auto)</label>
                                    <input
                                        type="text"
                                        value={age !== null ? `${age}` : 'N/A'}
                                        disabled
                                        className="w-full p-2 bg-muted/50 border border-border text-muted-foreground font-mono text-sm cursor-not-allowed"
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

                    <div className="kpi-card p-6 space-y-6 mt-8">
                        <div className="flex items-center gap-3 border-b border-border pb-4">
                            <User className="text-primary" size={20} />
                            <h2 className="text-lg font-bold text-foreground font-serif">Body Metrics</h2>
                        </div>
                        <form onSubmit={handleBioDataUpdate} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">Height (cm)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                        value={bioData.height_cm}
                                        onChange={e => setBioData({ ...bioData, height_cm: e.target.value })}
                                        placeholder="e.g. 175"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">Weight (kg)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                        value={bioData.weight_kg}
                                        onChange={e => setBioData({ ...bioData, weight_kg: e.target.value })}
                                        placeholder="e.g. 75"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">Body Fat (%)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                        value={bioData.body_fat_pct}
                                        onChange={e => setBioData({ ...bioData, body_fat_pct: e.target.value })}
                                        placeholder="e.g. 18"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">Muscle Mass (kg)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                        value={bioData.muscle_mass_kg}
                                        onChange={e => setBioData({ ...bioData, muscle_mass_kg: e.target.value })}
                                        placeholder="e.g. 32"
                                    />
                                </div>
                            </div>

                            {bioDataMsg && (
                                <div className={`text-xs p-2 flex items-center gap-2 ${bioDataMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                                    {bioDataMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                                    {bioDataMsg.text}
                                </div>
                            )}

                            <div className="pt-4 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={loadingBioData}
                                    className="btn-primary"
                                >
                                    {loadingBioData ? 'Saving...' : <><Save size={16} /> Save Body Metrics</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
