'use client';

import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/components/FeedbackProvider';
import { api } from '@/lib/api';
import { normalizeApiError, reportSystemTabError } from '@/lib/systemTelemetry';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { CheckCircle2, XCircle, ShieldAlert, Plus, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';
import Modal from '@/components/Modal';
import { SystemAdminAccessDenied, SystemAdminShell } from '@/components/system-admin/SystemAdminShell';

const COMMON_TIMEZONES = [
    'UTC',
    'Asia/Amman',
    'Asia/Dubai',
    'Asia/Riyadh',
    'Asia/Qatar',
    'Asia/Kuwait',
    'Europe/London',
    'Europe/Berlin',
    'Europe/Istanbul',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
];

const BRANCH_CODE_RE = /^[A-Z0-9-]{2,16}$/;
const PLAN_OPTIONS = [
    {
        value: 'standard',
        title: 'Standard',
        description: 'Good for a single-location gym that wants core access and simple operations.',
        features: ['Core member management', 'Basic reporting', 'Single location'],
    },
    {
        value: 'premium',
        title: 'Premium',
        description: 'Best for growth-stage gyms that need stronger visibility and a little more headroom.',
        features: ['Advanced reporting', 'Priority support', 'Multi-team ready'],
    },
    {
        value: 'enterprise',
        title: 'Enterprise',
        description: 'For large gyms or groups that need the full platform and tighter operational control.',
        features: ['Multi-branch workflows', 'Priority onboarding', 'Platform-wide controls'],
    },
] as const;

type FieldKey =
    | 'name'
    | 'slug'
    | 'brand_name'
    | 'admin_email'
    | 'admin_password'
    | 'plan_tier'
    | 'timezone'
    | 'subscription_expires_at'
    | 'initial_branch_name'
    | 'initial_branch_display_name'
    | 'initial_branch_slug'
    | 'initial_branch_code';

interface Gym {
    id: string;
    slug: string;
    name: string;
    brand_name: string;
    is_active: boolean;
    is_maintenance_mode: boolean;
    plan_tier: string;
    timezone: string;
    subscription_expires_at: string | null;
    grace_period_days: number;
    created_at: string;
}

interface EditGymFormState {
    name: string;
    slug: string;
    brand_name: string;
    plan_tier: string;
    timezone: string;
    subscription_expires_at: string;
    grace_period_days: string;
}

interface OnboardFormState {
    name: string;
    slug: string;
    brand_name: string;
    admin_email: string;
    admin_password: string;
    plan_tier: string;
    timezone: string;
    subscription_expires_at: string;
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
    subscription_expires_at: '',
    initial_branch_name: 'Main Branch',
    initial_branch_display_name: 'Main Branch',
    initial_branch_slug: 'main',
    initial_branch_code: 'MAIN-01',
};

export default function GymManagementPage() {
    const { user } = useAuth();
    const { showToast, confirm } = useFeedback();
    const { t, formatDate, locale } = useLocale();
    const [gyms, setGyms] = useState<Gym[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [updating, setUpdating] = useState<string | null>(null);
    const [onboardModalOpen, setOnboardModalOpen] = useState(false);
    const [onboardStep, setOnboardStep] = useState<1 | 2 | 3>(1);
    const [onboarding, setOnboarding] = useState(false);
    const [onboardingError, setOnboardingError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [brandTouched, setBrandTouched] = useState(false);
    const [branchNameTouched, setBranchNameTouched] = useState(false);
    const [branchDisplayTouched, setBranchDisplayTouched] = useState(false);
    const [branchSlugTouched, setBranchSlugTouched] = useState(false);
    const [branchCodeTouched, setBranchCodeTouched] = useState(false);
    const [editingGym, setEditingGym] = useState<Gym | null>(null);
    const [editGymModalOpen, setEditGymModalOpen] = useState(false);
    const [editGymError, setEditGymError] = useState<string | null>(null);
    const [editFieldErrors, setEditFieldErrors] = useState<Partial<Record<FieldKey | 'grace_period_days', string>>>({});
    const [savingGym, setSavingGym] = useState(false);

    const [formData, setFormData] = useState<OnboardFormState>(DEFAULT_FORM);
    const [editFormData, setEditFormData] = useState<EditGymFormState>({
        name: '',
        slug: '',
        brand_name: '',
        plan_tier: 'standard',
        timezone: 'UTC',
        subscription_expires_at: '',
        grace_period_days: '7',
    });

    const passwordChecks = useMemo(() => {
        const password = formData.admin_password;
        return {
            minLen: password.length >= 8,
            hasUpper: /[A-Z]/.test(password),
            hasLower: /[a-z]/.test(password),
            hasDigit: /\d/.test(password),
        };
    }, [formData.admin_password]);

    const derivedSlug = useMemo(() => normalizeSlug(formData.slug), [formData.slug]);
    const derivedBranchSlug = useMemo(() => normalizeSlug(formData.initial_branch_slug || `${formData.name}-branch`), [formData.initial_branch_slug, formData.name]);
    const derivedBranchCode = useMemo(() => {
        const seed = normalizeSlug(formData.name).replace(/-/g, '').slice(0, 4).toUpperCase();
        return formData.initial_branch_code || `${seed || 'MAIN'}-01`;
    }, [formData.initial_branch_code, formData.name]);

    const openEditGymModal = (gym: Gym) => {
        setEditingGym(gym);
        setEditGymError(null);
        setEditFieldErrors({});
        setEditFormData({
            name: gym.name,
            slug: gym.slug,
            brand_name: gym.brand_name,
            plan_tier: gym.plan_tier,
            timezone: gym.timezone,
            subscription_expires_at: gym.subscription_expires_at ? new Date(gym.subscription_expires_at).toISOString().slice(0, 10) : '',
            grace_period_days: String(gym.grace_period_days),
        });
        setEditGymModalOpen(true);
    };

    const closeEditGymModal = () => {
        setEditGymModalOpen(false);
        setEditingGym(null);
        setEditGymError(null);
        setEditFieldErrors({});
        setSavingGym(false);
    };

    const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
        const silent = opts?.silent ?? false;
        if (silent) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        try {
            const resp = await api.get('/system/gyms');
            setGyms(Array.isArray(resp.data) ? resp.data : []);
            setLastUpdated(new Date());
        } catch (err) {
            const message = normalizeApiError(err);
            showToast(message, 'error');
            await reportSystemTabError('system_gyms', 'fetch_gyms', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [showToast]);

    useEffect(() => {
        if (user?.role === 'SUPER_ADMIN') {
            fetchData();
        } else if (user) {
            setLoading(false);
        }
    }, [user, fetchData]);

    const toggleGymStatus = async (gymId: string, currentStatus: boolean) => {
        setUpdating(gymId);
        try {
            const accepted = await confirm({
                title: currentStatus ? (locale === 'ar' ? 'تأكيد التعليق' : 'Confirm suspension') : (locale === 'ar' ? 'تأكيد التنشيط' : 'Confirm reactivation'),
                description: currentStatus
                    ? (locale === 'ar' ? 'سيتم تعليق هذا النادي ومنع الوصول إليه.' : 'This will suspend the gym and block access.')
                    : (locale === 'ar' ? 'سيتم إعادة تفعيل هذا النادي.' : 'This will reactivate the gym.'),
                confirmText: currentStatus ? (locale === 'ar' ? 'تعليق' : 'Suspend') : (locale === 'ar' ? 'تنشيط' : 'Reactivate'),
                destructive: currentStatus,
            });
            if (!accepted) return;
            await api.patch(`/system/gyms/${gymId}`, { is_active: !currentStatus });
            setGyms((prev) => prev.map((g) => (g.id === gymId ? { ...g, is_active: !currentStatus } : g)));
            setLastUpdated(new Date());
            showToast(currentStatus
                ? (locale === 'ar' ? 'تم تعليق النادي.' : 'Gym suspended.')
                : (locale === 'ar' ? 'تم تنشيط النادي.' : 'Gym reactivated.'),
            'success');
        } catch (err) {
            showToast(normalizeApiError(err), 'error');
            await reportSystemTabError('system_gyms', 'toggle_gym_status', err, { gymId, targetStatus: !currentStatus });
        } finally {
            setUpdating(null);
        }
    };

    const toggleGymMaintenance = async (gymId: string, currentStatus: boolean) => {
        setUpdating(`${gymId}_maint`);
        try {
            const accepted = await confirm({
                title: currentStatus ? (locale === 'ar' ? 'إيقاف الصيانة' : 'Disable maintenance') : (locale === 'ar' ? 'تشغيل الصيانة' : 'Enable maintenance'),
                description: currentStatus
                    ? (locale === 'ar' ? 'سيعود هذا النادي إلى العمل العادي.' : 'This gym will return to normal operation.')
                    : (locale === 'ar' ? 'سيتم وضع هذا النادي في وضع الصيانة.' : 'This gym will be placed into maintenance mode.'),
                confirmText: currentStatus ? (locale === 'ar' ? 'إيقاف' : 'Disable') : (locale === 'ar' ? 'تشغيل' : 'Enable'),
                destructive: !currentStatus,
            });
            if (!accepted) return;
            await api.patch(`/system/gyms/${gymId}/maintenance`, { is_maintenance_mode: !currentStatus });
            setGyms((prev) => prev.map((g) => (g.id === gymId ? { ...g, is_maintenance_mode: !currentStatus } : g)));
            setLastUpdated(new Date());
            showToast(currentStatus
                ? (locale === 'ar' ? 'تم إيقاف صيانة النادي.' : 'Gym maintenance disabled.')
                : (locale === 'ar' ? 'تم تشغيل صيانة النادي.' : 'Gym maintenance enabled.'),
            'success');
        } catch (err) {
            showToast(normalizeApiError(err), 'error');
            await reportSystemTabError('system_gyms', 'toggle_gym_maintenance', err, { gymId, targetStatus: !currentStatus });
        } finally {
            setUpdating(null);
        }
    };

    const updateEditField = (field: keyof EditGymFormState, value: string) => {
        setEditFormData((prev) => ({ ...prev, [field]: value }));
        setEditFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    };

    const validateEditGymForm = () => {
        const nextErrors: Partial<Record<FieldKey | 'grace_period_days', string>> = {};
        const normalizedSlug = normalizeSlug(editFormData.slug);
        const normalizedGrace = Number.parseInt(editFormData.grace_period_days, 10);

        if (!editFormData.name.trim()) nextErrors.name = locale === 'ar' ? 'اسم النادي مطلوب.' : 'Gym name is required.';
        if (!normalizedSlug) nextErrors.slug = locale === 'ar' ? 'المسار مطلوب.' : 'Gym slug is required.';
        if (!editFormData.brand_name.trim()) nextErrors.brand_name = locale === 'ar' ? 'اسم العلامة التجارية مطلوب.' : 'Brand name is required.';
        if (!PLAN_OPTIONS.some((option) => option.value === editFormData.plan_tier)) nextErrors.plan_tier = locale === 'ar' ? 'الباقة غير صالحة.' : 'Invalid package selected.';
        if (!editFormData.timezone.trim()) nextErrors.timezone = locale === 'ar' ? 'اختر المنطقة الزمنية.' : 'Timezone is required.';
        if (editFormData.subscription_expires_at) {
            const parsed = new Date(editFormData.subscription_expires_at);
            if (Number.isNaN(parsed.getTime())) {
                nextErrors.subscription_expires_at = locale === 'ar' ? 'تاريخ انتهاء الاشتراك غير صالح.' : 'Subscription expiry date is invalid.';
            }
        }
        if (!Number.isInteger(normalizedGrace) || normalizedGrace < 0 || normalizedGrace > 365) {
            nextErrors.grace_period_days = locale === 'ar' ? 'فترة السماح يجب أن تكون بين 0 و365 يوماً.' : 'Grace period must be between 0 and 365 days.';
        }
        if (editingGym && gyms.some((gym) => gym.id !== editingGym.id && gym.slug === normalizedSlug)) {
            nextErrors.slug = locale === 'ar' ? 'المسار مستخدم بالفعل.' : 'Gym slug already exists.';
        }

        setEditFieldErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const handleSaveGym = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingGym) return;
        if (!validateEditGymForm()) return;

        setSavingGym(true);
        setEditGymError(null);

        const payload = {
            name: editFormData.name.trim(),
            slug: normalizeSlug(editFormData.slug),
            brand_name: editFormData.brand_name.trim(),
            plan_tier: editFormData.plan_tier,
            timezone: editFormData.timezone.trim(),
            subscription_expires_at: editFormData.subscription_expires_at || null,
            grace_period_days: Number.parseInt(editFormData.grace_period_days, 10),
        };

        try {
            await api.patch(`/system/gyms/${editingGym.id}`, payload);
            await fetchData({ silent: true });
            closeEditGymModal();
            showToast(locale === 'ar' ? 'تم تحديث بيانات النادي.' : 'Gym details updated.', 'success');
        } catch (err) {
            await reportSystemTabError('system_gyms', 'edit_gym', err, { gymId: editingGym.id, slug: payload.slug });
            const apiErr = err as { response?: { data?: { detail?: unknown } } };
            const parsed = parseOnboardErrors(apiErr.response?.data?.detail);
            setEditGymError(parsed.formError || normalizeApiError(err));
            setEditFieldErrors((prev) => ({ ...prev, ...parsed.fieldErrors }));
        } finally {
            setSavingGym(false);
        }
    };

    const updateField = (field: keyof OnboardFormState, value: string) => {
        setFormData((prev) => {
            const next = { ...prev, [field]: value };

            if (field === 'name') {
                next.slug = normalizeSlug(value);
                if (!brandTouched) next.brand_name = value;
                if (!branchNameTouched) next.initial_branch_name = `${value} Branch`;
                if (!branchDisplayTouched) next.initial_branch_display_name = `${value} Branch`;
                if (!branchSlugTouched) next.initial_branch_slug = `${normalizeSlug(value)}-branch`;
                if (!branchCodeTouched) {
                    const seed = normalizeSlug(value).replace(/-/g, '').slice(0, 4).toUpperCase();
                    next.initial_branch_code = `${seed || 'MAIN'}-01`;
                }
            }

            return next;
        });
        setFieldErrors((prev) => ({ ...prev, [field]: undefined }));

        if (field === 'brand_name') setBrandTouched(true);
        if (field === 'initial_branch_name') setBranchNameTouched(true);
        if (field === 'initial_branch_display_name') setBranchDisplayTouched(true);
        if (field === 'initial_branch_slug') setBranchSlugTouched(true);
        if (field === 'initial_branch_code') setBranchCodeTouched(true);
    };

    const resetOnboardModal = () => {
        setOnboardModalOpen(false);
        setOnboardStep(1);
        setFieldErrors({});
        setOnboardingError(null);
        setBrandTouched(false);
        setBranchNameTouched(false);
        setBranchDisplayTouched(false);
        setBranchSlugTouched(false);
        setBranchCodeTouched(false);
        setFormData(DEFAULT_FORM);
    };

    const openOnboardModal = () => {
        setOnboardStep(1);
        setOnboardingError(null);
        setFieldErrors({});
        setBrandTouched(false);
        setBranchNameTouched(false);
        setBranchDisplayTouched(false);
        setBranchSlugTouched(false);
        setBranchCodeTouched(false);
        setFormData(DEFAULT_FORM);
        setOnboardModalOpen(true);
    };

    const validateStepOne = () => {
        const nextErrors: Partial<Record<FieldKey, string>> = {};
        const slugValue = normalizeSlug(derivedSlug);

        if (!formData.name.trim()) nextErrors.name = locale === 'ar' ? 'اسم النادي مطلوب.' : 'Gym name is required.';
        if (!slugValue) nextErrors.slug = locale === 'ar' ? 'المسار مطلوب.' : 'Gym slug is required.';
        if (slugValue && gyms.some((gym) => gym.slug === slugValue)) {
            nextErrors.slug = locale === 'ar' ? 'المسار مستخدم بالفعل.' : 'Gym slug already exists.';
        }
        if (!formData.brand_name.trim()) nextErrors.brand_name = locale === 'ar' ? 'اسم العلامة التجارية مطلوب.' : 'Brand name is required.';
        if (!formData.timezone.trim()) nextErrors.timezone = locale === 'ar' ? 'اختر المنطقة الزمنية.' : 'Timezone is required.';

        setFieldErrors((prev) => ({ ...prev, ...nextErrors }));
        return Object.keys(nextErrors).length === 0;
    };

    const validateStepTwo = () => {
        const nextErrors: Partial<Record<FieldKey, string>> = {};
        if (!formData.plan_tier.trim()) nextErrors.plan_tier = locale === 'ar' ? 'اختر باقة الاشتراك.' : 'Select a package.';
        if (!PLAN_OPTIONS.some((option) => option.value === formData.plan_tier)) {
            nextErrors.plan_tier = locale === 'ar' ? 'الباقة غير صالحة.' : 'Invalid package selected.';
        }
        if (formData.subscription_expires_at) {
            const parsed = new Date(formData.subscription_expires_at);
            if (Number.isNaN(parsed.getTime())) {
                nextErrors.subscription_expires_at = locale === 'ar' ? 'تاريخ انتهاء الاشتراك غير صالح.' : 'Subscription expiry date is invalid.';
            }
        }
        setFieldErrors((prev) => ({ ...prev, ...nextErrors }));
        return Object.keys(nextErrors).length === 0;
    };

    const validateStepThree = async () => {
        const nextErrors: Partial<Record<FieldKey, string>> = {};
        const normalizedBranchSlug = normalizeSlug(derivedBranchSlug);
        const normalizedBranchCode = derivedBranchCode.toUpperCase();
        const normalizedEmail = formData.admin_email.trim().toLowerCase();

        if (!formData.admin_email.trim()) nextErrors.admin_email = locale === 'ar' ? 'البريد الإلكتروني مطلوب.' : 'Admin email is required.';
        if (!formData.admin_password.trim()) nextErrors.admin_password = locale === 'ar' ? 'كلمة المرور مطلوبة.' : 'Admin password is required.';
        if (!formData.initial_branch_name.trim()) nextErrors.initial_branch_name = locale === 'ar' ? 'اسم الفرع مطلوب.' : 'Branch name is required.';
        if (!normalizedBranchSlug) nextErrors.initial_branch_slug = locale === 'ar' ? 'مسار الفرع مطلوب.' : 'Branch slug is required.';
        if (!BRANCH_CODE_RE.test(normalizedBranchCode)) nextErrors.initial_branch_code = locale === 'ar' ? 'رمز الفرع غير صالح.' : 'Branch code is invalid.';

        if (gyms.some((gym) => gym.slug === derivedSlug)) {
            nextErrors.slug = locale === 'ar' ? 'المسار مستخدم بالفعل.' : 'Gym slug already exists.';
        }

        if (Object.keys(nextErrors).length === 0 && normalizedEmail) {
            try {
                const resp = await api.get('/system/users/search', { params: { q: normalizedEmail, page: 1, limit: 20 } });
                const items = resp.data?.data?.items || [];
                if (Array.isArray(items) && items.some((item: { email?: string }) => (item.email || '').toLowerCase() === normalizedEmail)) {
                    nextErrors.admin_email = locale === 'ar' ? 'البريد الإلكتروني مستخدم بالفعل.' : 'Admin email already exists.';
                }
            } catch {
                // Best-effort validation; final submit still has backend enforcement.
            }
        }

        setFieldErrors((prev) => ({ ...prev, ...nextErrors }));
        return Object.keys(nextErrors).length === 0;
    };

    const handleOnboardSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setOnboarding(true);
        setOnboardingError(null);
        setFieldErrors({});

        if (!validateStepTwo() || !(await validateStepThree())) {
            setOnboarding(false);
            return;
        }

        const payload = {
            ...formData,
            slug: normalizeSlug(formData.slug),
            initial_branch_slug: normalizeSlug(derivedBranchSlug),
            initial_branch_code: derivedBranchCode.trim().toUpperCase(),
            brand_name: formData.brand_name.trim() || formData.name.trim(),
            subscription_expires_at: formData.subscription_expires_at || null,
        };

        try {
            await api.post('/system/gyms/onboard', payload);
            resetOnboardModal();
            await fetchData();
            showToast(locale === 'ar' ? 'تم إنشاء النادي بنجاح.' : 'Gym onboarded successfully.', 'success');
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
        setRefreshing(true);
        try {
            const resp = await api.post('/system/subscriptions/sync');
            const { locked, unlocked } = resp.data.stats;
            showToast(locale === 'ar'
            ? `اكتملت المزامنة. تم القفل: ${locked}، تم الفتح: ${unlocked}`
            : `Sync completed. Locked: ${locked}, Unlocked: ${unlocked}`,
            'success');
            setLastUpdated(new Date());
            await fetchData({ silent: true });
        } catch (err) {
            await reportSystemTabError('system_gyms', 'sync_subscriptions', err);
            showToast(locale === 'ar' ? 'فشلت مزامنة الاشتراكات.' : 'Failed to sync subscriptions.', 'error');
        } finally {
            setRefreshing(false);
        }
    };

    const handleCopy = async (value: string, label: string) => {
        try {
            await navigator.clipboard.writeText(value);
            showToast(locale === 'ar' ? `تم نسخ ${label}` : `${label} copied`, 'success');
        } catch {
            showToast(locale === 'ar' ? 'فشل النسخ.' : 'Copy failed.', 'error');
        }
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        );
    }

    if (user && user.role !== 'SUPER_ADMIN') {
        return <SystemAdminAccessDenied />;
    }

    return (
        <SystemAdminShell
            activeTab="gyms"
            title={t('dashboard.nav.gymManagement')}
            description={locale === 'ar' ? 'إدارة المستأجرين والاشتراكات' : 'Manage platform tenants and subscription status'}
            lastUpdated={lastUpdated}
            refreshing={refreshing}
            onRefresh={() => fetchData({ silent: true })}
            actionSlot={
                <div className="flex gap-2">
                    <button onClick={handleSync} className="btn-ghost flex items-center gap-2 border border-border">
                        {locale === 'ar' ? 'مزامنة الاشتراكات' : 'Sync Subscriptions'}
                    </button>
                    <button onClick={openOnboardModal} className="btn-primary flex items-center gap-2">
                        <Plus size={18} />
                        {locale === 'ar' ? 'فتح معالج المستأجر' : 'Open Tenant Wizard'}
                    </button>
                </div>
            }
        >

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
                                                className={`btn-ghost !py-1 !px-2 text-[10px] uppercase font-bold tracking-wider ${gym.is_maintenance_mode ? 'text-destructive' : 'text-muted-foreground'}`}
                                            >
                                                <ShieldAlert size={14} className="mr-1" />
                                                {gym.is_maintenance_mode ? (locale === 'ar' ? 'إيقاف' : 'Disable') : (locale === 'ar' ? 'صيانة' : 'Maintenance')}
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
                                                            const graceLabel = `${locale === 'ar' ? 'المهلة حتى' : 'Grace until'} ${formatDate(graceDeadline)}`;

                                                            if (now > graceDeadline) return <span className="text-[8px] uppercase text-destructive font-extrabold px-1.5 py-0.5 bg-destructive/10 rounded w-fit mt-1">{locale === 'ar' ? 'منتهي تماماً' : 'Locked'}</span>;
                                                            if (now > expiry) {
                                                                return (
                                                                    <>
                                                                        <span className="text-[8px] uppercase text-amber-500 font-extrabold px-1.5 py-0.5 bg-amber-500/10 rounded w-fit mt-1">{locale === 'ar' ? 'فترة سماح' : 'Grace Period'}</span>
                                                                        <span className="text-[9px] text-muted-foreground">{graceLabel}</span>
                                                                    </>
                                                                );
                                                            }
                                                            return <span className="text-[9px] text-muted-foreground">{graceLabel}</span>;
                                                        })()}
                                                    </>
                                                ) : (
                                                    <span className="text-[10px] text-muted-foreground italic">{locale === 'ar' ? 'غير محدد' : 'Not Set'}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="font-mono text-[10px] text-muted-foreground">{formatDate(new Date(gym.created_at))}</td>
                                        <td className="text-end">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => openEditGymModal(gym)}
                                                    className="btn-ghost !py-1 !px-2 text-[10px] uppercase font-bold tracking-tighter"
                                                >
                                                    {locale === 'ar' ? 'تعديل' : 'Edit'}
                                                </button>
                                                <button
                                                    onClick={() => handleCopy(gym.id, locale === 'ar' ? 'معرف النادي' : 'Gym ID')}
                                                    className="btn-ghost !py-1 !px-2 text-[10px] uppercase font-bold tracking-tighter"
                                                >
                                                    <Copy size={12} className="mr-1" />
                                                    {locale === 'ar' ? 'نسخ' : 'Copy'}
                                                </button>
                                                <button
                                                    onClick={() => toggleGymStatus(gym.id, gym.is_active)}
                                                    disabled={updating === gym.id}
                                                    className={`btn-ghost !py-1 !px-3 text-[10px] uppercase font-bold tracking-tighter ${gym.is_active ? 'text-destructive' : 'text-emerald-500'}`}
                                                >
                                                    {updating === gym.id ? '...' : gym.is_active ? (locale === 'ar' ? 'تعليق' : 'Suspend') : (locale === 'ar' ? 'تنشيط' : 'Activate')}
                                                </button>
                                            </div>
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

            <Modal
                isOpen={editGymModalOpen}
                onClose={closeEditGymModal}
                title={locale === 'ar' ? 'تعديل النادي' : 'Edit Gym'}
                maxWidthClassName="max-w-3xl"
            >
                <form onSubmit={handleSaveGym} className="space-y-5 pt-4">
                    {editGymError ? (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{editGymError}</div>
                    ) : null}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'اسم النادي' : 'Gym Name'}</label>
                            <input value={editFormData.name} onChange={(e) => updateEditField('name', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm" />
                            {editFieldErrors.name ? <p className="text-xs text-destructive">{editFieldErrors.name}</p> : null}
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'اسم العلامة التجارية' : 'Brand Name'}</label>
                            <input value={editFormData.brand_name} onChange={(e) => updateEditField('brand_name', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm" />
                            {editFieldErrors.brand_name ? <p className="text-xs text-destructive">{editFieldErrors.brand_name}</p> : null}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'المسار' : 'Slug'}</label>
                            <input value={editFormData.slug} onChange={(e) => updateEditField('slug', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm font-mono" />
                            {editFieldErrors.slug ? <p className="text-xs text-destructive">{editFieldErrors.slug}</p> : null}
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'المنطقة الزمنية' : 'Timezone'}</label>
                            <select value={editFormData.timezone} onChange={(e) => updateEditField('timezone', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm">
                                {COMMON_TIMEZONES.map((tz) => (
                                    <option key={tz} value={tz}>{tz}</option>
                                ))}
                            </select>
                            {editFieldErrors.timezone ? <p className="text-xs text-destructive">{editFieldErrors.timezone}</p> : null}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="space-y-1.5 sm:col-span-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'الخطة' : 'Plan'}</label>
                            <select value={editFormData.plan_tier} onChange={(e) => updateEditField('plan_tier', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm">
                                {PLAN_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.title}</option>
                                ))}
                            </select>
                            {editFieldErrors.plan_tier ? <p className="text-xs text-destructive">{editFieldErrors.plan_tier}</p> : null}
                        </div>
                        <div className="space-y-1.5 sm:col-span-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'انتهاء الاشتراك' : 'Subscription Expiry'}</label>
                            <input type="date" value={editFormData.subscription_expires_at} onChange={(e) => updateEditField('subscription_expires_at', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm" />
                            <p className="text-[11px] text-muted-foreground">{locale === 'ar' ? 'استخدم هذا الحقل لتجديد الاشتراك أو تمديده.' : 'Use this to renew or extend the subscription.'}</p>
                            {editFieldErrors.subscription_expires_at ? <p className="text-xs text-destructive">{editFieldErrors.subscription_expires_at}</p> : null}
                        </div>
                        <div className="space-y-1.5 sm:col-span-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'فترة السماح بالأيام' : 'Grace Period (days)'}</label>
                            <input type="number" min="0" max="365" value={editFormData.grace_period_days} onChange={(e) => updateEditField('grace_period_days', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm" />
                            {editFieldErrors.grace_period_days ? <p className="text-xs text-destructive">{editFieldErrors.grace_period_days}</p> : null}
                        </div>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                        {locale === 'ar'
                            ? 'يمكنك من هنا تعديل بيانات النادي الأساسية، تغيير الباقة، تجديد تاريخ الاشتراك، أو تعديل مهلة السماح قبل الإغلاق التلقائي.'
                            : 'From here you can update gym basics, change the plan tier, renew the subscription date, or adjust the grace period before auto-locking.'}
                    </div>

                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={closeEditGymModal} className="btn-ghost">{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button>
                        <button type="submit" disabled={savingGym} className="btn-primary min-w-[140px]">{savingGym ? '...' : (locale === 'ar' ? 'حفظ التغييرات' : 'Save Changes')}</button>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={onboardModalOpen}
                onClose={resetOnboardModal}
                title={locale === 'ar' ? 'معالج إنشاء المستأجر' : 'Tenant Setup Wizard'}
                maxWidthClassName="max-w-5xl"
            >
                <form onSubmit={handleOnboardSubmit} className="space-y-5 pt-4">
                    {onboardingError ? (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{onboardingError}</div>
                    ) : null}

                    <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
                                    {locale === 'ar' ? 'معالج من 3 خطوات' : '3-step wizard'}
                                </div>
                                <div className="mt-1 text-sm text-muted-foreground">
                                    {locale === 'ar'
                                        ? 'أنشئ النادي، اختر الباقة، ثم اضبط المشرف والفرع.'
                                        : 'Create the gym, choose a package, then set the admin and first branch.'}
                                </div>
                            </div>
                            <div className="text-right ltr:text-right rtl:text-left">
                                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                                    {locale === 'ar' ? 'الخطوة الحالية' : 'Current step'}
                                </div>
                                <div className="mt-1 text-lg font-bold text-foreground font-mono">{onboardStep}/3</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                        <span className={`rounded-full px-2 py-1 ${onboardStep === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted/40'}`}>1</span>
                        <span>{locale === 'ar' ? 'الأساسيات' : 'Basics'}</span>
                        <span className="h-px w-8 bg-border" />
                        <span className={`rounded-full px-2 py-1 ${onboardStep === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted/40'}`}>2</span>
                        <span>{locale === 'ar' ? 'الباقة' : 'Package'}</span>
                        <span className="h-px w-8 bg-border" />
                        <span className={`rounded-full px-2 py-1 ${onboardStep === 3 ? 'bg-primary text-primary-foreground' : 'bg-muted/40'}`}>3</span>
                        <span>{locale === 'ar' ? 'المشرف والفرع' : 'Admin and branch'}</span>
                    </div>

                    {onboardStep === 1 ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'اسم النادي' : 'Gym Name'}</label>
                                    <input required type="text" value={formData.name} onChange={(e) => updateField('name', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm" />
                                    {fieldErrors.name ? <p className="text-xs text-destructive">{fieldErrors.name}</p> : null}
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'المسار (Slug)' : 'URL Slug'}</label>
                                    <input type="text" value={derivedSlug} readOnly className="w-full bg-muted/20 border border-border rounded px-3 py-2 text-sm font-mono text-muted-foreground" />
                                    <p className="text-[11px] text-muted-foreground">{locale === 'ar' ? 'يُنشأ تلقائياً من اسم النادي.' : 'Auto-generated from the gym name.'}</p>
                                    {fieldErrors.slug ? <p className="text-xs text-destructive">{fieldErrors.slug}</p> : null}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'المنطقة الزمنية' : 'Timezone'}</label>
                                <select value={formData.timezone} onChange={(e) => updateField('timezone', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm">
                                    {COMMON_TIMEZONES.map((tz) => (
                                        <option key={tz} value={tz}>{tz}</option>
                                    ))}
                                </select>
                                {fieldErrors.timezone ? <p className="text-xs text-destructive">{fieldErrors.timezone}</p> : null}
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={resetOnboardModal} className="btn-ghost">{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button>
                                <button type="button" onClick={() => {
                                    if (validateStepOne()) setOnboardStep(2);
                                }} className="btn-primary min-w-[120px]">
                                    {locale === 'ar' ? 'التالي' : 'Next'}
                                </button>
                            </div>
                        </div>
                    ) : onboardStep === 2 ? (
                        <div className="space-y-5">
                            <div className="rounded-xl border border-border bg-muted/20 p-4">
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{locale === 'ar' ? 'صانع الباقة' : 'Plan maker'}</div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {locale === 'ar'
                                        ? 'اختر الباقة التي ستبدأ بها الصالة. هذا ليس مجرد اسم - إنه شكل التشغيل الأولي.'
                                        : 'Pick the package the gym starts on. This is the operational setup the tenant launches with.'}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                {PLAN_OPTIONS.map((option) => {
                                    const active = formData.plan_tier === option.value;
                                    return (
                                        <button
                                            type="button"
                                            key={option.value}
                                            onClick={() => updateField('plan_tier', option.value)}
                                            className={`min-h-[180px] rounded-xl border p-4 text-start transition-colors ${
                                                active
                                                    ? 'border-primary bg-primary/10 shadow-sm'
                                                    : 'border-border bg-background/70 hover:border-primary/40'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="text-base font-bold text-foreground">{option.title}</div>
                                                    <div className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">{option.value}</div>
                                                </div>
                                                {active ? <span className="rounded-full bg-primary px-2 py-1 text-[10px] font-bold uppercase text-primary-foreground">{locale === 'ar' ? 'مختارة' : 'Selected'}</span> : null}
                                            </div>
                                            <p className="mt-3 text-sm text-muted-foreground">{option.description}</p>
                                            <ul className="mt-3 space-y-1 text-xs text-foreground">
                                                {option.features.map((feature) => (
                                                    <li key={feature} className="flex items-center gap-2">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                                        {feature}
                                                    </li>
                                                ))}
                                            </ul>
                                        </button>
                                    );
                                })}
                            </div>

                            {fieldErrors.plan_tier ? <p className="text-xs text-destructive">{fieldErrors.plan_tier}</p> : null}

                            <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'انتهاء الاشتراك' : 'Subscription Expiry'}</label>
                                    <input
                                        type="date"
                                        value={formData.subscription_expires_at}
                                        onChange={(e) => updateField('subscription_expires_at', e.target.value)}
                                        className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm"
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                        {locale === 'ar'
                                            ? 'اختياري. إذا تركته فارغاً فلن يطبق القفل التلقائي للاشتراك.'
                                            : 'Optional. Leave blank if you do not want subscription auto-locking yet.'}
                                    </p>
                                    {fieldErrors.subscription_expires_at ? <p className="text-xs text-destructive">{fieldErrors.subscription_expires_at}</p> : null}
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'فترة السماح' : 'Grace Period'}</label>
                                    <div className="w-full rounded border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                                        {locale === 'ar' ? '7 أيام افتراضياً' : '7 days by default'}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                        {locale === 'ar'
                                            ? 'تستخدم المنصة حالياً فترة السماح الافتراضية لكل ناد جديد.'
                                            : 'The platform currently uses the default grace period for each new gym.'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex justify-between gap-3 pt-2">
                                <button type="button" onClick={() => setOnboardStep(1)} className="btn-ghost">{locale === 'ar' ? 'رجوع' : 'Back'}</button>
                                <button type="button" onClick={() => {
                                    if (validateStepTwo()) setOnboardStep(3);
                                }} className="btn-primary min-w-[120px]">
                                    {locale === 'ar' ? 'التالي' : 'Next'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            <div className="rounded-xl border border-border bg-muted/20 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{locale === 'ar' ? 'النادي' : 'Gym'}</div>
                                    <div className="mt-1 font-semibold text-foreground">{formData.name || '--'}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{locale === 'ar' ? 'المسار' : 'Slug'}</div>
                                    <div className="mt-1 font-mono text-foreground">{derivedSlug || '--'}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{locale === 'ar' ? 'الباقة' : 'Package'}</div>
                                    <div className="mt-1 font-semibold text-foreground">{PLAN_OPTIONS.find((option) => option.value === formData.plan_tier)?.title || formData.plan_tier || '--'}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{locale === 'ar' ? 'انتهاء الاشتراك' : 'Subscription expiry'}</div>
                                    <div className="mt-1 font-semibold text-foreground">{formData.subscription_expires_at || '--'}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{locale === 'ar' ? 'الفرع' : 'Branch'}</div>
                                    <div className="mt-1 font-semibold text-foreground">{formData.initial_branch_name || '--'}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{locale === 'ar' ? 'البريد الإلكتروني للمشرف' : 'Admin email'}</div>
                                    <div className="mt-1 font-mono text-foreground">{formData.admin_email || '--'}</div>
                                </div>
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

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'اسم الفرع' : 'Branch Name'}</label>
                                    <input value={formData.initial_branch_name} onChange={(e) => updateField('initial_branch_name', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm" />
                                    {fieldErrors.initial_branch_name ? <p className="text-xs text-destructive">{fieldErrors.initial_branch_name}</p> : null}
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'اسم العرض للفرع' : 'Branch Display Name'}</label>
                                    <input value={formData.initial_branch_display_name} onChange={(e) => updateField('initial_branch_display_name', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm" />
                                    {fieldErrors.initial_branch_display_name ? <p className="text-xs text-destructive">{fieldErrors.initial_branch_display_name}</p> : null}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'مسار الفرع' : 'Branch Slug'}</label>
                                    <input value={formData.initial_branch_slug} onChange={(e) => updateField('initial_branch_slug', e.target.value)} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm font-mono" />
                                    <p className="text-[11px] text-muted-foreground">{locale === 'ar' ? 'المسار النهائي:' : 'Normalized branch slug:'} <span className="font-mono">{derivedBranchSlug || '...'}</span></p>
                                    {fieldErrors.initial_branch_slug ? <p className="text-xs text-destructive">{fieldErrors.initial_branch_slug}</p> : null}
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{locale === 'ar' ? 'رمز الفرع' : 'Branch Code'}</label>
                                    <input value={formData.initial_branch_code} onChange={(e) => updateField('initial_branch_code', e.target.value.toUpperCase())} className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm font-mono" />
                                    <p className="text-[11px] text-muted-foreground">{locale === 'ar' ? 'الرمز النهائي:' : 'Normalized branch code:'} <span className="font-mono">{derivedBranchCode}</span></p>
                                    {fieldErrors.initial_branch_code ? <p className="text-xs text-destructive">{fieldErrors.initial_branch_code}</p> : null}
                                </div>
                            </div>

                            <div className="flex justify-between gap-3 pt-2">
                                    <button type="button" onClick={() => setOnboardStep(2)} className="btn-ghost">{locale === 'ar' ? 'رجوع' : 'Back'}</button>
                                    <div className="flex gap-3">
                                        <button type="button" onClick={resetOnboardModal} className="btn-ghost">{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button>
                                        <button type="submit" disabled={onboarding} className="btn-primary min-w-[120px]">{onboarding ? '...' : (locale === 'ar' ? 'إنشاء' : 'Create')}</button>
                                    </div>
                                </div>
                        </div>
                    )}
                </form>
            </Modal>
        </SystemAdminShell>
    );
}
