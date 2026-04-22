'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { normalizeApiError, reportSystemTabError } from '@/lib/systemTelemetry';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { CheckCircle2, XCircle, ShieldAlert, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';
import Modal from '@/components/Modal';

type FieldKey =
    | 'name'
    | 'slug'
    | 'brand_name'
    | 'admin_email'
    | 'admin_password'
    | 'plan_tier'
    | 'timezone'
    | 'initial_branch_name'
    | 'initial_branch_display_name'
    | 'initial_branch_slug'
    | 'initial_branch_code';

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

interface OnboardFormState {
    name: string;
    slug: string;
    brand_name: string;
    admin_email: string;
    admin_password: string;
    plan_tier: string;
    timezone: string;
    initial_branch_name: string;
    initial_branch_display_name: string;
    initial_branch_slug: string;
    initial_branch_code: string;
}

function normalizeSlug(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function parseOnboardErrors(detail: unknown): { formError: string | null; fieldErrors: Partial<Record<FieldKey, string>> } {
    const fieldErrors: Partial<Record<FieldKey, string>> = {};
    let formError: string | null = null;

    if (typeof detail === 'string') {
        return { formError: detail, fieldErrors };
    }

    const rows = Array.isArray(detail) ? detail : [detail];
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const entry = row as { field?: unknown; message?: unknown; msg?: unknown };
        const field = typeof entry.field === 'string' ? (entry.field as FieldKey) : null;
        const message = typeof entry.message === 'string' ? entry.message : (typeof entry.msg === 'string' ? entry.msg : null);

        if (field && message) {
            fieldErrors[field] = message;
        } else if (!formError && message) {
            formError = message;
        }
    }

    return {
        formError: formError || null,
        fieldErrors,
    };
}

const DEFAULT_FORM: OnboardFormState = {
    name: '',
    slug: '',
    brand_name: '',
    admin_email: '',
    admin_password: '',
    plan_tier: 'standard',
    timezone: 'UTC',
    initial_branch_name: 'Main Branch',
    initial_branch_display_name: 'Main Branch',
    initial_branch_slug: 'main',
    initial_branch_code: 'MAIN-01',
};

export default function GymManagementPage() {
    const { user } = useAuth();
    const { t, formatDate, locale } = useLocale();
    const [gyms, setGyms] = useState<Gym[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    const [onboardModalOpen, setOnboardModalOpen] = useState(false);
    const [onboarding, setOnboarding] = useState(false);
    const [onboardingError, setOnboardingError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
    const [showAdvanced, setShowAdvanced] = useState(false);

    const [formData, setFormData] = useState<OnboardFormState>(DEFAULT_FORM);

    const passwordChecks = useMemo(() => {
        const password = formData.admin_password;
        return {
            minLen: password.length >= 8,
            hasUpper: /[A-Z]/.test(password),
            hasLower: /[a-z]/.test(password),
            hasDigit: /\d/.test(password),
        };
    }, [formData.admin_password]);

    const derivedSlug = useMemo(() => normalizeSlug(formData.slug || formData.name), [formData.slug, formData.name]);

    const fetchData = useCallback(async () => {
        try {
            const resp = await api.get('/system/gyms');
            setGyms(Array.isArray(resp.data) ? resp.data : []);
        } catch (err) {
            await reportSystemTabError('system_gyms', 'fetch_gyms', err);
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
            setGyms((prev) => prev.map((g) => (g.id === gymId ? { ...g, is_active: !currentStatus } : g)));
        } catch (err) {
            await reportSystemTabError('system_gyms', 'toggle_gym_status', err, { gymId, targetStatus: !currentStatus });
        } finally {
            setUpdating(null);
        }
    };

    const toggleGymMaintenance = async (gymId: string, currentStatus: boolean) => {
        setUpdating(`${gymId}_maint`);
        try {
            await api.patch(`/system/gyms/${gymId}/maintenance`, { is_maintenance_mode: !currentStatus });
            setGyms((prev) => prev.map((g) => (g.id === gymId ? { ...g, is_maintenance_mode: !currentStatus } : g)));
        } catch (err) {
            await reportSystemTabError('system_gyms', 'toggle_gym_maintenance', err, { gymId, targetStatus: !currentStatus });
        } finally {
            setUpdating(null);
        }
    };

    const updateField = (field: keyof OnboardFormState, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    };

    const handleOnboardSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setOnboarding(true);
        setOnboardingError(null);
        setFieldErrors({});

        const payload = {
            ...formData,
            slug: normalizeSlug(derivedSlug),
            initial_branch_slug: normalizeSlug(formData.initial_branch_slug),
            initial_branch_code: formData.initial_branch_code.trim().toUpperCase(),
            brand_name: formData.brand_name.trim() || formData.name.trim(),
        };

        try {
            await api.post('/system/gyms/onboard', payload);
            setOnboardModalOpen(false);
            setFormData(DEFAULT_FORM);
            await fetchData();
        } catch (err) {
            await reportSystemTabError('system_gyms', 'onboard_gym', err, { slug: payload.slug, admin_email: payload.admin_email });
            const apiErr = err as { response?: { data?: { detail?: unknown } } };
            const parsed = parseOnboardErrors(apiErr.response?.data?.detail);
            const fallback = locale === 'ar'
                ? 'فشل إنشاء النادي. يرجى مراجعة البيانات والمحاولة مرة أخرى.'
                : 'Onboarding failed. Please review the form data and try again.';
            setOnboardingError(parsed.formError || normalizeApiError(err) || fallback);
            setFieldErrors(parsed.fieldErrors);
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
            await fetchData();
        } catch (err) {
            await reportSystemTabError('system_gyms', 'sync_subscriptions', err);
            alert(locale === 'ar' ? 'فشلت مزامنة الاشتراكات.' : 'Failed to sync subscriptions.');
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
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{t('dashboard.nav.gymManagement')}</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {locale === 'ar' ? 'إدارة المستأجرين والاشتراكات' : 'Manage platform tenants and subscription status'}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleSync} className="btn-ghost flex items-center gap-2 border border-border">
                        {locale === 'ar' ? 'مزامنة الاشتراكات' : 'Sync Subscriptions'}
                    </button>
                    <button onClick={() => setOnboardModalOpen(true)} className="btn-primary flex items-center gap-2">
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
                                            <span className="inline-flex rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary uppercase tracking-wider font-mono">{gym.plan_tier}</span>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                {gym.is_active ? <CheckCircle2 size={14} className="text-emerald-500" /> : <XCircle size={14} className="text-destructive" />}
                                                <span className={`text-[10px] uppercase font-bold ${gym.is_active ? 'text-emerald-500' : 'text-destructive'}`}>
                                                    {gym.is_active ? (locale === 'ar' ? 'نشط' : 'Active') : (locale === 'ar' ? 'معلق' : 'Suspended')}
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            <button
                                                onClick={() => toggleGymMaintenance(gym.id, gym.is_maintenance_mode)}
                                                disabled={updating === `${gym.id}_maint`}
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

                                                            if (now > graceDeadline) return <span className="text-[8px] uppercase text-destructive font-extrabold px-1.5 py-0.5 bg-destructive/10 rounded w-fit mt-1">{locale === 'ar' ? 'منتهي تماماً' : 'Locked'}</span>;
                                                            if (now > expiry) return <span className="text-[8px] uppercase text-amber-500 font-extrabold px-1.5 py-0.5 bg-amber-500/10 rounded w-fit mt-1">{locale === 'ar' ? 'فترة سماح' : 'Grace Period'}</span>;
                                                            return null;
                                                        })()}
                                                    </>
                                                ) : (
                                                    <span className="text-[10px] text-muted-foreground italic">{locale === 'ar' ? 'غير محدد' : 'Not Set'}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="font-mono text-[10px] text-muted-foreground">{formatDate(new Date(gym.created_at))}</td>
                                        <td className="text-end">
                                            <button
                                                onClick={() => toggleGymStatus(gym.id, gym.is_active)}
                                                disabled={updating === gym.id}
                                                className={`btn-ghost !py-1 !px-3 text-[10px] uppercase font-bold tracking-tighter ${gym.is_active ? 'text-destructive' : 'text-emerald-500'}`}
                                            >
                                                {updating === gym.id ? '...' : gym.is_active ? (locale === 'ar' ? 'تعليق' : 'Suspend') : (locale === 'ar' ? 'تنشيط' : 'Activate')}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={8} className="text-center py-8 text-muted-foreground font-mono">{locale === 'ar' ? 'لا توجد صالات مسجلة' : 'No gyms found'}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal isOpen={onboardModalOpen} onClose={() => setOnboardModalOpen(false)} title={locale === 'ar' ? 'إضافة نادي جديد' : 'Onboard New Gym'}>
                <form onSubmit={handleOnboardSubmit} className="space-y-4 pt-4">
                    {onboardingError ? (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{onboardingError}</div>
                    ) : null}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'اسم النادي' : 'Gym Name'}</label>
                            <input required type="text" value={formData.name} onChange={(e) => updateField('name', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm" />
                            {fieldErrors.name ? <p className="text-xs text-destructive">{fieldErrors.name}</p> : null}
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'المسار (Slug)' : 'URL Slug'}</label>
                            <input required type="text" value={formData.slug} onChange={(e) => updateField('slug', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm font-mono" />
                            <p className="text-[11px] text-muted-foreground">{locale === 'ar' ? 'المسار النهائي:' : 'Normalized slug:'} <span className="font-mono">{derivedSlug || '...'}</span></p>
                            {fieldErrors.slug ? <p className="text-xs text-destructive">{fieldErrors.slug}</p> : null}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'اسم العلامة التجارية' : 'Brand Name'}</label>
                        <input type="text" value={formData.brand_name} onChange={(e) => updateField('brand_name', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm" />
                        {fieldErrors.brand_name ? <p className="text-xs text-destructive">{fieldErrors.brand_name}</p> : null}
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'البريد الإلكتروني للمشرف' : 'Admin Email'}</label>
                        <input required type="email" value={formData.admin_email} onChange={(e) => updateField('admin_email', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm" />
                        {fieldErrors.admin_email ? <p className="text-xs text-destructive">{fieldErrors.admin_email}</p> : null}
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'كلمة المرور للمشرف' : 'Admin Password'}</label>
                        <input required type="password" value={formData.admin_password} onChange={(e) => updateField('admin_password', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm" />
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <span className={passwordChecks.minLen ? 'text-emerald-500' : 'text-muted-foreground'}>{locale === 'ar' ? '8 أحرف على الأقل' : 'At least 8 chars'}</span>
                            <span className={passwordChecks.hasUpper ? 'text-emerald-500' : 'text-muted-foreground'}>{locale === 'ar' ? 'حرف كبير' : 'Uppercase'}</span>
                            <span className={passwordChecks.hasLower ? 'text-emerald-500' : 'text-muted-foreground'}>{locale === 'ar' ? 'حرف صغير' : 'Lowercase'}</span>
                            <span className={passwordChecks.hasDigit ? 'text-emerald-500' : 'text-muted-foreground'}>{locale === 'ar' ? 'رقم' : 'Number'}</span>
                        </div>
                        {fieldErrors.admin_password ? <p className="text-xs text-destructive">{fieldErrors.admin_password}</p> : null}
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'باقة الاشتراك' : 'Plan Tier'}</label>
                        <select value={formData.plan_tier} onChange={(e) => updateField('plan_tier', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm">
                            <option value="standard">Standard</option>
                            <option value="premium">Premium</option>
                            <option value="enterprise">Enterprise</option>
                        </select>
                        {fieldErrors.plan_tier ? <p className="text-xs text-destructive">{fieldErrors.plan_tier}</p> : null}
                    </div>

                    <button
                        type="button"
                        className="btn-ghost !px-2 text-xs flex items-center gap-1"
                        onClick={() => setShowAdvanced((v) => !v)}
                    >
                        {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {locale === 'ar' ? 'إعدادات متقدمة' : 'Advanced Settings'}
                    </button>

                    {showAdvanced ? (
                        <div className="space-y-4 rounded-md border border-border p-3 bg-muted/20">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Timezone</label>
                                    <input value={formData.timezone} onChange={(e) => updateField('timezone', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm" />
                                    {fieldErrors.timezone ? <p className="text-xs text-destructive">{fieldErrors.timezone}</p> : null}
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Branch Name</label>
                                    <input value={formData.initial_branch_name} onChange={(e) => updateField('initial_branch_name', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm" />
                                    {fieldErrors.initial_branch_name ? <p className="text-xs text-destructive">{fieldErrors.initial_branch_name}</p> : null}
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Branch Display Name</label>
                                    <input value={formData.initial_branch_display_name} onChange={(e) => updateField('initial_branch_display_name', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm" />
                                    {fieldErrors.initial_branch_display_name ? <p className="text-xs text-destructive">{fieldErrors.initial_branch_display_name}</p> : null}
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Branch Slug</label>
                                    <input value={formData.initial_branch_slug} onChange={(e) => updateField('initial_branch_slug', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm font-mono" />
                                    {fieldErrors.initial_branch_slug ? <p className="text-xs text-destructive">{fieldErrors.initial_branch_slug}</p> : null}
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Branch Code</label>
                                <input value={formData.initial_branch_code} onChange={(e) => updateField('initial_branch_code', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm font-mono" />
                                {fieldErrors.initial_branch_code ? <p className="text-xs text-destructive">{fieldErrors.initial_branch_code}</p> : null}
                            </div>
                        </div>
                    ) : null}

                    <div className="pt-4 flex justify-end gap-3">
                        <button type="button" onClick={() => setOnboardModalOpen(false)} className="btn-ghost">{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button>
                        <button type="submit" disabled={onboarding} className="btn-primary min-w-[100px]">{onboarding ? '...' : (locale === 'ar' ? 'إضافة' : 'Onboard')}</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
