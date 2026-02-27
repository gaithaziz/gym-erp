'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { User, Lock, Save, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import ImageCropper from '@/components/ImageCropper';
import { useFeedback } from '@/components/FeedbackProvider';
import { resolveProfileImageUrl } from '@/lib/profileImage';
import { useLocale } from '@/context/LocaleContext';

export default function ProfilePage() {
    const { user, updateUser } = useAuth();
    const { locale } = useLocale();
    const { showToast } = useFeedback();
    const txt = locale === 'ar' ? {
        profileUpdated: 'تم تحديث الملف الشخصي بنجاح',
        profileUpdateFailed: 'فشل تحديث الملف الشخصي',
        passwordsNoMatch: 'كلمات المرور الجديدة غير متطابقة',
        passwordChanged: 'تم تغيير كلمة المرور بنجاح',
        passwordChangeFailed: 'فشل تغيير كلمة المرور',
        uploadPictureFailed: 'فشل رفع الصورة. يرجى المحاولة مرة أخرى.',
        bioSaved: 'تم حفظ بيانات الجسم وتتبعها بنجاح',
        bioSaveFailed: 'فشل حفظ بيانات الجسم',
        title: 'ملفي الشخصي',
        subtitle: 'إدارة إعدادات حسابك',
        security: 'الأمان',
        passwordFields: 'حقول كلمة المرور',
        hidePasswords: 'إخفاء كلمات المرور',
        showPasswords: 'إظهار كلمات المرور',
        currentPassword: 'كلمة المرور الحالية',
        newPassword: 'كلمة المرور الجديدة',
        confirmPassword: 'تأكيد كلمة المرور',
        updating: 'جارٍ التحديث...',
        updatePassword: 'تحديث كلمة المرور',
        personalDetails: 'البيانات الشخصية',
        fullName: 'الاسم الكامل',
        readOnlyEmail: 'البريد الإلكتروني (للقراءة فقط)',
        phoneNumber: 'رقم الهاتف',
        dateOfBirth: 'تاريخ الميلاد',
        ageAuto: 'العمر (تلقائي)',
        emergencyContact: 'جهة اتصال الطوارئ',
        emergencyPlaceholder: 'Jane Doe - +1 (555) 123-4567',
        bioNotes: 'نبذة / ملاحظات',
        bioPlaceholder: 'حدثنا قليلًا عن نفسك وأهدافك الرياضية...',
        saving: 'جارٍ الحفظ...',
        saveProfile: 'حفظ الملف الشخصي',
        bodyMetrics: 'قياسات الجسم',
        heightCm: 'الطول (سم)',
        weightKg: 'الوزن (كجم)',
        bodyFat: 'دهون الجسم (%)',
        muscleMassKg: 'الكتلة العضلية (كجم)',
        eg175: 'مثال: 175',
        eg75: 'مثال: 75',
        eg18: 'مثال: 18',
        eg32: 'مثال: 32',
        saveBodyMetrics: 'حفظ قياسات الجسم',
        na: 'غير متاح',
    } : {
        profileUpdated: 'Profile updated successfully',
        profileUpdateFailed: 'Failed to update profile',
        passwordsNoMatch: 'New passwords do not match',
        passwordChanged: 'Password changed successfully',
        passwordChangeFailed: 'Failed to change password',
        uploadPictureFailed: 'Failed to upload picture. Please try again.',
        bioSaved: 'Bio data saved and tracked successfully',
        bioSaveFailed: 'Failed to save bio data',
        title: 'My Profile',
        subtitle: 'Manage your account settings',
        security: 'Security',
        passwordFields: 'Password Fields',
        hidePasswords: 'Hide Passwords',
        showPasswords: 'Show Passwords',
        currentPassword: 'Current Password',
        newPassword: 'New Password',
        confirmPassword: 'Confirm Password',
        updating: 'Updating...',
        updatePassword: 'Update Password',
        personalDetails: 'Personal Details',
        fullName: 'Full Name',
        readOnlyEmail: 'EMAIL ADDRESS (READ ONLY)',
        phoneNumber: 'Phone Number',
        dateOfBirth: 'Date of Birth',
        ageAuto: 'Age (Auto)',
        emergencyContact: 'Emergency Contact',
        emergencyPlaceholder: 'Jane Doe - +1 (555) 123-4567',
        bioNotes: 'Bio / Notes',
        bioPlaceholder: 'Tell us a little bit about yourself and your fitness goals...',
        saving: 'Saving...',
        saveProfile: 'Save Profile',
        bodyMetrics: 'Body Metrics',
        heightCm: 'Height (cm)',
        weightKg: 'Weight (kg)',
        bodyFat: 'Body Fat (%)',
        muscleMassKg: 'Muscle Mass (kg)',
        eg175: 'e.g. 175',
        eg75: 'e.g. 75',
        eg18: 'e.g. 18',
        eg32: 'e.g. 32',
        saveBodyMetrics: 'Save Body Metrics',
        na: 'N/A',
    };

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
            setProfileMsg({ type: 'success', text: txt.profileUpdated });
            if (res.data?.data) {
                updateUser(res.data.data);
            }
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setProfileMsg({ type: 'error', text: error.response?.data?.detail || txt.profileUpdateFailed });
        } finally {
            setLoadingProfile(false);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (passwords.new !== passwords.confirm) {
            setPassMsg({ type: 'error', text: txt.passwordsNoMatch });
            return;
        }
        setLoadingPass(true);
        setPassMsg(null);
        try {
            await api.put('/auth/me/password', {
                current_password: passwords.current,
                new_password: passwords.new
            });
            setPassMsg({ type: 'success', text: txt.passwordChanged });
            setPasswords({ current: '', new: '', confirm: '' });
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setPassMsg({ type: 'error', text: error.response?.data?.detail || txt.passwordChangeFailed });
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
            showToast(txt.uploadPictureFailed, 'error');
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
            setBioDataMsg({ type: 'success', text: txt.bioSaved });
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setBioDataMsg({ type: 'error', text: error.response?.data?.detail || txt.bioSaveFailed });
        } finally {
            setLoadingBioData(false);
        }
    };

    const currentProfileImage = resolveProfileImageUrl(user?.profile_picture_url);

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-12">
            <div>
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{txt.title}</h1>
                <p className="text-sm text-muted-foreground mt-1">{txt.subtitle}</p>
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
                            <h2 className="text-lg font-bold text-foreground font-serif">{txt.security}</h2>
                        </div>

                        <form onSubmit={handlePasswordChange} className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-mono text-muted-foreground uppercase">{txt.passwordFields}</span>
                                <button
                                    type="button"
                                    onClick={() => setShowPasswords((prev) => !prev)}
                                    className="text-xs font-mono text-primary hover:text-primary/80 flex items-center gap-1"
                                >
                                    {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
                                    {showPasswords ? txt.hidePasswords : txt.showPasswords}
                                </button>
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">{txt.currentPassword}</label>
                                <input
                                    type={showPasswords ? 'text' : 'password'}
                                    value={passwords.current}
                                    onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                                    className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">{txt.newPassword}</label>
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
                                <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">{txt.confirmPassword}</label>
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
                                {loadingPass ? txt.updating : txt.updatePassword}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Right Column: Personal Details */}
                <div className="lg:col-span-2">
                    <div className="kpi-card p-6 space-y-6">
                        <div className="flex items-center gap-3 border-b border-border pb-4">
                            <User className="text-primary" size={20} />
                            <h2 className="text-lg font-bold text-foreground font-serif">{txt.personalDetails}</h2>
                        </div>

                        <form onSubmit={handleProfileUpdate} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">{txt.fullName}</label>
                                    <input
                                        type="text"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-muted-foreground mb-1">{txt.readOnlyEmail}</label>
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
                                    <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">{txt.phoneNumber}</label>
                                    <input
                                        type="text"
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value)}
                                        placeholder="+1 (555) 000-0000"
                                        className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">{txt.dateOfBirth}</label>
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
                                    <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">{txt.ageAuto}</label>
                                    <input
                                        type="text"
                                        value={age !== null ? `${age}` : txt.na}
                                        disabled
                                        className="w-full p-2 bg-muted/50 border border-border text-muted-foreground font-mono text-sm cursor-not-allowed"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">{txt.emergencyContact}</label>
                                <input
                                    type="text"
                                    value={emergencyContact}
                                    onChange={(e) => setEmergencyContact(e.target.value)}
                                    placeholder={txt.emergencyPlaceholder}
                                    className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">{txt.bioNotes}</label>
                                <textarea
                                    value={bio}
                                    onChange={(e) => setBio(e.target.value)}
                                    placeholder={txt.bioPlaceholder}
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
                                    {loadingProfile ? txt.saving : <><Save size={16} /> {txt.saveProfile}</>}
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="kpi-card p-6 space-y-6 mt-8">
                        <div className="flex items-center gap-3 border-b border-border pb-4">
                            <User className="text-primary" size={20} />
                            <h2 className="text-lg font-bold text-foreground font-serif">{txt.bodyMetrics}</h2>
                        </div>
                        <form onSubmit={handleBioDataUpdate} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">{txt.heightCm}</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                        value={bioData.height_cm}
                                        onChange={e => setBioData({ ...bioData, height_cm: e.target.value })}
                                        placeholder={txt.eg175}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">{txt.weightKg}</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                        value={bioData.weight_kg}
                                        onChange={e => setBioData({ ...bioData, weight_kg: e.target.value })}
                                        placeholder={txt.eg75}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">{txt.bodyFat}</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                        value={bioData.body_fat_pct}
                                        onChange={e => setBioData({ ...bioData, body_fat_pct: e.target.value })}
                                        placeholder={txt.eg18}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-muted-foreground mb-1 uppercase">{txt.muscleMassKg}</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="w-full p-2 bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                        value={bioData.muscle_mass_kg}
                                        onChange={e => setBioData({ ...bioData, muscle_mass_kg: e.target.value })}
                                        placeholder={txt.eg32}
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
                                    {loadingBioData ? txt.saving : <><Save size={16} /> {txt.saveBodyMetrics}</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
