'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, ShieldAlert, Plus } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';
import Modal from '@/components/Modal';
import type { AxiosError } from 'axios';

interface Gym {
    id: string;
    slug: string;
    name: string;
    is_active: boolean;
    is_maintenance_mode: boolean;
    plan_tier: string;
    subscription_expires_at: string | null;
    grace_period_days: number;
    created_at: string;
}

export default function GymManagementPage() {
    const { user } = useAuth();
    const { t, formatDate, locale } = useLocale();
    const [gyms, setGyms] = useState<Gym[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    const [onboardModalOpen, setOnboardModalOpen] = useState(false);
    const [onboarding, setOnboarding] = useState(false);
    const [onboardingError, setOnboardingError] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        slug: '',
        brand_name: '',
        admin_email: '',
        admin_password: '',
        plan_tier: 'standard'
    });

    const fetchData = useCallback(async () => {
        try {
            const resp = await api.get('/system/gyms');
            setGyms(resp.data);
        } catch (err) {
            console.error("Failed to fetch gyms", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (user?.role === 'SUPER_ADMIN') {
            fetchData();
        }
    }, [user, fetchData]);

    const toggleGymStatus = async (gymId: string, currentStatus: boolean) => {
        setUpdating(gymId);
        try {
            await api.patch(`/system/gyms/${gymId}`, { is_active: !currentStatus });
            setGyms(prev => prev.map(g => g.id === gymId ? { ...g, is_active: !currentStatus } : g));
        } catch (err) {
            console.error("Failed to update gym status", err);
        } finally {
            setUpdating(null);
        }
    };

    const toggleGymMaintenance = async (gymId: string, currentStatus: boolean) => {
        setUpdating(gymId + '_maint');
        try {
            await api.patch(`/system/gyms/${gymId}/maintenance`, { is_maintenance_mode: !currentStatus });
            setGyms(prev => prev.map(g => g.id === gymId ? { ...g, is_maintenance_mode: !currentStatus } : g));
        } catch (err) {
            console.error("Failed to update gym maintenance", err);
        } finally {
            setUpdating(null);
        }
    };

    const handleOnboardSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setOnboarding(true);
        setOnboardingError(null);
        try {
            await api.post('/system/gyms/onboard', formData);
            setOnboardModalOpen(false);
            setFormData({ name: '', slug: '', brand_name: '', admin_email: '', admin_password: '', plan_tier: 'standard' });
            fetchData();
        } catch (err) {
            console.error("Onboarding failed", err);
            const apiError = err as AxiosError<{ detail?: unknown }>;
            const detail = apiError.response?.data?.detail;
            const fallback = locale === 'ar' ? 'فشل إنشاء النادي. يرجى مراجعة البيانات والمحاولة مرة أخرى.' : 'Onboarding failed. Please review the form data and try again.';
            setOnboardingError(typeof detail === 'string' ? detail : fallback);
        } finally {
            setOnboarding(false);
        }
    };

    const handleSync = async () => {
        setLoading(true);
        try {
            const resp = await api.post('/system/subscriptions/sync');
            const { locked, unlocked } = resp.data.stats;
            alert(`Sync completed! Locked: ${locked}, Unlocked: ${unlocked}`);
            fetchData();
        } catch (err) {
            console.error("Sync failed", err);
            alert("Failed to sync subscriptions.");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">
                        {t('dashboard.nav.gymManagement')}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {locale === 'ar' ? 'إدارة المستأجرين والاشتراكات' : 'Manage platform tenants and subscription status'}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={handleSync}
                        className="btn-ghost flex items-center gap-2 border border-border"
                    >
                        {locale === 'ar' ? 'مزامنة الاشتراكات' : 'Sync Subscriptions'}
                    </button>
                    <button 
                        onClick={() => setOnboardModalOpen(true)}
                        className="btn-primary flex items-center gap-2"
                    >
                        <Plus size={18} />
                        {locale === 'ar' ? 'إضافة نادي جديد' : 'Onboard New Gym'}
                    </button>
                </div>
            </div>

            <div className="kpi-card p-6">
                <div className="overflow-x-auto">
                    <table className="w-full text-start table-dark min-w-[800px]">
                        <thead>
                            <tr>
                                <th>{locale === 'ar' ? 'النادي' : 'Gym Name'}</th>
                                <th>{locale === 'ar' ? 'المسار' : 'Slug'}</th>
                                <th>{locale === 'ar' ? 'الخطة' : 'Plan'}</th>
                                <th>{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                                <th>{locale === 'ar' ? 'الصيانة' : 'Maint.'}</th>
                                <th>{locale === 'ar' ? 'الاشتراك' : 'Subscription'}</th>
                                <th>{locale === 'ar' ? 'تاريخ التسجيل' : 'Registered'}</th>
                                <th className="text-end">{locale === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {gyms.length > 0 ? (
                                gyms.map((gym) => (
                                    <tr key={gym.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="font-bold">{gym.name}</td>
                                        <td className="font-mono text-[10px] text-muted-foreground">{gym.slug}</td>
                                        <td>
                                            <span className="inline-flex rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary uppercase tracking-wider font-mono">
                                                {gym.plan_tier}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                {gym.is_active ? (
                                                    <CheckCircle2 size={14} className="text-emerald-500" />
                                                ) : (
                                                    <XCircle size={14} className="text-destructive" />
                                                )}
                                                <span className={`text-[10px] uppercase font-bold ${gym.is_active ? 'text-emerald-500' : 'text-destructive'}`}>
                                                    {gym.is_active ? (locale === 'ar' ? 'نشط' : 'Active') : (locale === 'ar' ? 'معلق' : 'Suspended')}
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            <button 
                                                onClick={() => toggleGymMaintenance(gym.id, gym.is_maintenance_mode)}
                                                disabled={updating === gym.id + '_maint'}
                                                className={`p-1 rounded transition-colors ${gym.is_maintenance_mode ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                                            >
                                                <ShieldAlert size={16} />
                                            </button>
                                         </td>
                                         <td>
                                             <div className="flex flex-col gap-0.5">
                                                 {gym.subscription_expires_at ? (
                                                     <>
                                                         <span className={`text-[10px] font-bold ${new Date(gym.subscription_expires_at) < new Date() ? 'text-destructive' : 'text-emerald-500'}`}>
                                                             {formatDate(new Date(gym.subscription_expires_at))}
                                                         </span>
                                                         {(() => {
                                                             const expiry = new Date(gym.subscription_expires_at);
                                                             const now = new Date();
                                                             const graceDeadline = new Date(expiry);
                                                             graceDeadline.setDate(graceDeadline.getDate() + gym.grace_period_days);
                                                             
                                                             if (now > graceDeadline) {
                                                                 return <span className="text-[8px] uppercase text-destructive font-extrabold px-1.5 py-0.5 bg-destructive/10 rounded w-fit mt-1">{locale === 'ar' ? 'منتهي تماماً' : 'Locked'}</span>;
                                                             } else if (now > expiry) {
                                                                 return <span className="text-[8px] uppercase text-amber-500 font-extrabold px-1.5 py-0.5 bg-amber-500/10 rounded w-fit mt-1">{locale === 'ar' ? 'فترة سماح' : 'Grace Period'}</span>;
                                                             }
                                                             return null;
                                                         })()}
                                                     </>
                                                 ) : (
                                                     <span className="text-[10px] text-muted-foreground italic">{locale === 'ar' ? 'غير محدد' : 'Not Set'}</span>
                                                 )}
                                             </div>
                                         </td>
                                        <td className="font-mono text-[10px] text-muted-foreground">
                                            {formatDate(new Date(gym.created_at))}
                                        </td>
                                        <td className="text-end">
                                            <button
                                                onClick={() => toggleGymStatus(gym.id, gym.is_active)}
                                                disabled={updating === gym.id}
                                                className={`btn-ghost !py-1 !px-3 text-[10px] uppercase font-bold tracking-tighter ${gym.is_active ? 'text-destructive' : 'text-emerald-500'}`}
                                            >
                                                {updating === gym.id ? '...' : (gym.is_active ? (locale === 'ar' ? 'تعليق' : 'Suspend') : (locale === 'ar' ? 'تنشيط' : 'Activate'))}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className="text-center py-8 text-muted-foreground font-mono">
                                        {locale === 'ar' ? 'لا توجد صالات مسجلة' : 'No gyms found'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal isOpen={onboardModalOpen} onClose={() => setOnboardModalOpen(false)} title={locale === 'ar' ? 'إضافة نادي جديد' : 'Onboard New Gym'}>
                <form onSubmit={handleOnboardSubmit} className="space-y-4 pt-4">
                    {onboardingError ? (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            {onboardingError}
                        </div>
                    ) : null}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'اسم النادي' : 'Gym Name'}</label>
                            <input 
                                required
                                type="text" 
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                                className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm" 
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'المسار (Slug)' : 'URL Slug'}</label>
                            <input 
                                required
                                type="text" 
                                value={formData.slug}
                                onChange={e => setFormData({...formData, slug: e.target.value})}
                                className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm font-mono" 
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'البريد الإلكتروني للمشرف' : 'Admin Email'}</label>
                        <input 
                            required
                            type="email" 
                            value={formData.admin_email}
                            onChange={e => setFormData({...formData, admin_email: e.target.value})}
                            className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm" 
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'كلمة المرور للمشرف' : 'Admin Password'}</label>
                        <input 
                            required
                            type="password" 
                            value={formData.admin_password}
                            onChange={e => setFormData({...formData, admin_password: e.target.value})}
                            className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm" 
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'باقة الاشتراك' : 'Plan Tier'}</label>
                        <select 
                            value={formData.plan_tier}
                            onChange={e => setFormData({...formData, plan_tier: e.target.value})}
                            className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm"
                        >
                            <option value="standard">Standard</option>
                            <option value="premium">Premium</option>
                            <option value="enterprise">Enterprise</option>
                        </select>
                    </div>
                    <div className="pt-4 flex justify-end gap-3">
                        <button type="button" onClick={() => setOnboardModalOpen(false)} className="btn-ghost">{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button>
                        <button type="submit" disabled={onboarding} className="btn-primary min-w-[100px]">
                            {onboarding ? '...' : (locale === 'ar' ? 'إضافة' : 'Onboard')}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
