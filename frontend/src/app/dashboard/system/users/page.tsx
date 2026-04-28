'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useFeedback } from '@/components/FeedbackProvider';
import { normalizeApiError, reportSystemTabError } from '@/lib/systemTelemetry';
import { getAccessToken, getRefreshToken, setTokens } from '@/lib/tokenStorage';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, RefreshCcw, Search, Shield, UserCog } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';
import TablePagination from '@/components/TablePagination';
import Modal from '@/components/Modal';
import { SystemAdminAccessDenied, SystemAdminShell } from '@/components/system-admin/SystemAdminShell';

interface UserResult {
    id: string;
    email: string;
    full_name: string;
    role: string;
    is_active: boolean;
    gym_id: string;
    gym_name: string;
    home_branch_id: string | null;
    home_branch_name: string | null;
    last_activity_at: string | null;
    activity_status: 'active' | 'stale' | 'inactive';
}

interface UsersPayload {
    items: UserResult[];
    total: number;
    page: number;
    limit: number;
}

interface GymOption {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
    is_maintenance_mode: boolean;
    plan_tier: string;
}

interface BranchOption {
    id: string;
    gym_id: string;
    gym_name: string;
    name: string;
    display_name: string | null;
    code: string | null;
    is_active: boolean;
}

const PAGE_SIZE = 20;
const ROLE_OPTIONS = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'COACH', 'RECEPTION', 'FRONT_DESK', 'EMPLOYEE', 'CASHIER', 'CUSTOMER'];
const ACTIVITY_OPTIONS: Array<{ value: string; label: { en: string; ar: string } }> = [
    { value: '', label: { en: 'All activity', ar: 'كل النشاط' } },
    { value: 'active', label: { en: 'Active', ar: 'نشط' } },
    { value: 'stale', label: { en: 'Stale', ar: 'قديم' } },
    { value: 'inactive', label: { en: 'Inactive', ar: 'غير نشط' } },
];

export default function GlobalUserSearchPage() {
    const { user } = useAuth();
    const { showToast, confirm } = useFeedback();
    const { locale, formatDate } = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const initialQuery = useMemo(() => searchParams.get('q') || '', [searchParams]);
    const initialPage = useMemo(() => {
        const raw = Number(searchParams.get('page') || '1');
        return Number.isFinite(raw) && raw > 0 ? raw : 1;
    }, [searchParams]);
    const initialRole = useMemo(() => searchParams.get('role') || '', [searchParams]);
    const initialGym = useMemo(() => searchParams.get('gym') || '', [searchParams]);
    const initialBranch = useMemo(() => searchParams.get('branch') || '', [searchParams]);
    const initialActivity = useMemo(() => searchParams.get('activity') || '', [searchParams]);

    const [queryInput, setQueryInput] = useState(initialQuery);
    const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
    const [page, setPage] = useState(initialPage);
    const [roleFilter, setRoleFilter] = useState(initialRole);
    const [gymFilter, setGymFilter] = useState(initialGym);
    const [branchFilter, setBranchFilter] = useState(initialBranch);
    const [activityFilter, setActivityFilter] = useState(initialActivity);

    const [results, setResults] = useState<UserResult[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [gyms, setGyms] = useState<GymOption[]>([]);
    const [branches, setBranches] = useState<BranchOption[]>([]);
    const [impersonationTarget, setImpersonationTarget] = useState<UserResult | null>(null);
    const [supportReason, setSupportReason] = useState('');

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedQuery(queryInput.trim());
            setPage(1);
        }, 250);
        return () => window.clearTimeout(timer);
    }, [queryInput]);

    useEffect(() => {
        setQueryInput(initialQuery);
        setDebouncedQuery(initialQuery);
        setPage(initialPage);
        setRoleFilter(initialRole);
        setGymFilter(initialGym);
        setBranchFilter(initialBranch);
        setActivityFilter(initialActivity);
    }, [initialActivity, initialBranch, initialGym, initialPage, initialQuery, initialRole]);

    useEffect(() => {
        const params = new URLSearchParams();
        if (debouncedQuery) params.set('q', debouncedQuery);
        if (page > 1) params.set('page', String(page));
        if (roleFilter) params.set('role', roleFilter);
        if (gymFilter) params.set('gym', gymFilter);
        if (branchFilter) params.set('branch', branchFilter);
        if (activityFilter) params.set('activity', activityFilter);
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [activityFilter, branchFilter, debouncedQuery, gymFilter, page, pathname, roleFilter, router]);

    const fetchGyms = useCallback(async () => {
        try {
            const resp = await api.get('/system/gyms');
            const items = Array.isArray(resp.data)
                ? resp.data
                : (Array.isArray(resp.data?.data) ? resp.data.data : []);
            setGyms(
                items.map((gym: {
                    id: string;
                    name: string;
                    slug?: string | null;
                    is_active?: boolean | null;
                    is_maintenance_mode?: boolean | null;
                    plan_tier?: string | null;
                }) => ({
                    id: gym.id,
                    name: gym.name,
                    slug: gym.slug || '',
                    is_active: Boolean(gym.is_active),
                    is_maintenance_mode: Boolean(gym.is_maintenance_mode),
                    plan_tier: gym.plan_tier || '',
                }))
            );
        } catch {
            setGyms([]);
        }
    }, []);

    const fetchBranches = useCallback(async (gymId?: string) => {
        try {
            const resp = await api.get('/system/branches', {
                params: gymId ? { gym_id: gymId } : undefined,
            });
            setBranches(Array.isArray(resp.data) ? resp.data : []);
        } catch {
            setBranches([]);
        }
    }, []);

    const fetchUsers = useCallback(async (opts?: { silent?: boolean }) => {
        const silent = opts?.silent ?? false;
        if (silent) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        setError(null);
        try {
            const resp = await api.get('/system/users/search', {
                params: {
                    q: debouncedQuery,
                    page,
                    limit: PAGE_SIZE,
                    role: roleFilter || undefined,
                    gym_id: gymFilter || undefined,
                    branch_id: branchFilter || undefined,
                    activity_status: activityFilter || undefined,
                },
            });
            const payload = resp.data?.data as UsersPayload | undefined;
            if (payload && Array.isArray(payload.items)) {
                setResults(payload.items);
                setTotal(Number(payload.total || 0));
                setLastUpdated(new Date());
                return;
            }

            const legacy = Array.isArray(resp.data) ? (resp.data as UserResult[]) : [];
            setResults(legacy);
            setTotal(legacy.length);
            setLastUpdated(new Date());
        } catch (err) {
            const message = normalizeApiError(err);
            setError(message);
            setResults([]);
            setTotal(0);
            showToast(message, 'error');
            await reportSystemTabError('system_users', 'fetch_users', err, {
                query: debouncedQuery,
                page,
                role: roleFilter,
                gym_id: gymFilter,
                branch_id: branchFilter,
                activity_status: activityFilter,
                limit: PAGE_SIZE,
            });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [activityFilter, branchFilter, debouncedQuery, gymFilter, page, roleFilter, showToast]);

    useEffect(() => {
        if (user?.role === 'SUPER_ADMIN') {
            void fetchGyms();
        }
    }, [fetchGyms, user]);

    useEffect(() => {
        if (user?.role === 'SUPER_ADMIN') {
            void fetchBranches(gymFilter || undefined);
        }
    }, [fetchBranches, gymFilter, user]);

    useEffect(() => {
        if (user?.role === 'SUPER_ADMIN') {
            void fetchUsers();
        } else if (user) {
            setLoading(false);
        }
    }, [fetchUsers, user]);

    useEffect(() => {
        if (branchFilter && branches.length > 0 && !branches.some((branch) => branch.id === branchFilter)) {
            setBranchFilter('');
        }
    }, [branchFilter, branches]);

    const openImpersonationModal = (target: UserResult) => {
        setImpersonationTarget(target);
        setSupportReason('');
    };

    const handleImpersonate = async () => {
        if (!impersonationTarget) return;

        const accepted = await confirm({
            title: locale === 'ar' ? 'تأكيد الدخول بالنيابة' : 'Confirm impersonation',
            description: `${impersonationTarget.full_name || impersonationTarget.email} • ${impersonationTarget.gym_name}`,
            confirmText: locale === 'ar' ? 'متابعة' : 'Continue',
            destructive: false,
        });
        if (!accepted) return;

        try {
            const currentAccess = getAccessToken();
            const currentRefresh = getRefreshToken();

            const resp = await api.post(`/system/users/${impersonationTarget.id}/impersonate`, {
                reason: supportReason.trim() || null,
            });
            const { access_token, refresh_token } = resp.data;

            if (currentAccess) sessionStorage.setItem('admin_access_token', currentAccess);
            if (currentRefresh) sessionStorage.setItem('admin_refresh_token', currentRefresh);
            if (supportReason.trim()) sessionStorage.setItem('admin_support_reason', supportReason.trim());
            sessionStorage.setItem('pending_toast_message', locale === 'ar' ? 'تم الدخول بالنيابة عن المستخدم.' : 'Impersonation started.');
            sessionStorage.setItem('pending_toast_kind', 'success');

            setTokens(access_token, refresh_token);
            window.location.href = '/dashboard';
        } catch (err) {
            await reportSystemTabError('system_users', 'impersonate', err, {
                userId: impersonationTarget.id,
                reason: supportReason.trim() || null,
            });
            showToast(locale === 'ar' ? 'فشل تسجيل الدخول بالنيابة عن المستخدم.' : 'Failed to impersonate user.', 'error');
        } finally {
            setImpersonationTarget(null);
            setSupportReason('');
        }
    };

    const summary = useMemo(() => {
        const active = results.filter((item) => item.activity_status === 'active').length;
        const stale = results.filter((item) => item.activity_status === 'stale').length;
        const inactive = results.filter((item) => item.activity_status === 'inactive').length;
        return { active, stale, inactive };
    }, [results]);

    if (loading && results.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        );
    }

    if (user && user.role !== 'SUPER_ADMIN') {
        return <SystemAdminAccessDenied />;
    }

    const selectedGym = gyms.find((gym) => gym.id === gymFilter) || null;

    return (
        <SystemAdminShell
            activeTab="users"
            title={locale === 'ar' ? 'البحث العام عن المستخدمين' : 'Global User Search'}
            description={locale === 'ar' ? 'عرض أحدث المستخدمين أو البحث عبر كل الصالات' : 'Browse recent users or search across all platform tenants'}
            lastUpdated={lastUpdated}
            refreshing={refreshing}
            onRefresh={() => fetchUsers({ silent: true })}
            actionSlot={
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            setQueryInput('');
                            setDebouncedQuery('');
                            setPage(1);
                            setRoleFilter('');
                            setGymFilter('');
                            setBranchFilter('');
                            setActivityFilter('');
                        }}
                        className="btn-ghost border border-border"
                    >
                        {locale === 'ar' ? 'إعادة ضبط' : 'Reset'}
                    </button>
                </div>
            }
        >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{locale === 'ar' ? 'إجمالي النتائج' : 'Results'}</div>
                    <div className="mt-2 text-2xl font-bold text-foreground font-mono">{total}</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{locale === 'ar' ? 'نشط' : 'Active'}</div>
                    <div className="mt-2 text-2xl font-bold text-emerald-500 font-mono">{summary.active}</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{locale === 'ar' ? 'قديم / غير نشط' : 'Stale / Inactive'}</div>
                    <div className="mt-2 text-2xl font-bold text-amber-500 font-mono">{summary.stale + summary.inactive}</div>
                </div>
            </div>

            <div className="kpi-card p-4">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
                    <div className="lg:col-span-2">
                        <label className="text-xs font-semibold text-muted-foreground">{locale === 'ar' ? 'البحث' : 'Search'}</label>
                        <div className="relative mt-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                            <input
                                type="search"
                                value={queryInput}
                                onChange={(e) => setQueryInput(e.target.value)}
                                placeholder={locale === 'ar' ? 'ابحث بالبريد الإلكتروني أو الاسم...' : 'Search by email or name...'}
                                className="input-dark w-full pl-10"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground">{locale === 'ar' ? 'الدور' : 'Role'}</label>
                        <select className="input-dark w-full mt-1" value={roleFilter} onChange={(e) => { setPage(1); setRoleFilter(e.target.value); }}>
                            <option value="">{locale === 'ar' ? 'الكل' : 'All roles'}</option>
                            {ROLE_OPTIONS.map((role) => (
                                <option key={role} value={role}>{role}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground">{locale === 'ar' ? 'النادي' : 'Gym'}</label>
                        <select className="input-dark w-full mt-1" value={gymFilter} onChange={(e) => { setPage(1); setGymFilter(e.target.value); setBranchFilter(''); }}>
                            <option value="">{locale === 'ar' ? 'الكل' : 'All gyms'}</option>
                            {gyms.map((gym) => (
                                <option key={gym.id} value={gym.id}>
                                    {gym.name}
                                    {gym.slug ? ` (${gym.slug})` : ''}
                                    {!gym.is_active ? (locale === 'ar' ? ' - معلق' : ' - Suspended') : ''}
                                    {gym.is_maintenance_mode ? (locale === 'ar' ? ' - صيانة' : ' - Maintenance') : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground">{locale === 'ar' ? 'الفرع' : 'Branch'}</label>
                        <select className="input-dark w-full mt-1" value={branchFilter} onChange={(e) => { setPage(1); setBranchFilter(e.target.value); }}>
                            <option value="">{locale === 'ar' ? 'الكل' : 'All branches'}</option>
                            {branches.map((branch) => (
                                <option key={branch.id} value={branch.id}>
                                    {branch.display_name || branch.name} {selectedGym ? '' : `(${branch.gym_name})`}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground">{locale === 'ar' ? 'النشاط' : 'Activity'}</label>
                        <select className="input-dark w-full mt-1" value={activityFilter} onChange={(e) => { setPage(1); setActivityFilter(e.target.value); }}>
                            {ACTIVITY_OPTIONS.map((option) => (
                                <option key={option.value || 'all'} value={option.value}>
                                    {locale === 'ar' ? option.label.ar : option.label.en}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3">
                    <span>{error}</span>
                    <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => fetchUsers()}>
                        {locale === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                    </button>
                </div>
            )}

            <div className="kpi-card p-0 overflow-hidden hidden md:block">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1100px] text-start table-dark">
                        <thead>
                            <tr>
                                <th>{locale === 'ar' ? 'المستخدم' : 'User'}</th>
                                <th>{locale === 'ar' ? 'الدور' : 'Role'}</th>
                                <th>{locale === 'ar' ? 'النادي' : 'Gym'}</th>
                                <th>{locale === 'ar' ? 'الفرع' : 'Branch'}</th>
                                <th>{locale === 'ar' ? 'النشاط' : 'Activity'}</th>
                                <th>{locale === 'ar' ? 'الحالة' : 'Account'}</th>
                                <th className="text-end">{locale === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.length > 0 ? (
                                results.map((row) => {
                                    const isActiveStatus = row.activity_status === 'active';
                                    return (
                                        <tr key={row.id} className="hover:bg-muted/30 transition-colors align-top">
                                            <td className="py-4">
                                                <div className="min-w-0">
                                                    <div className="font-bold text-foreground">{row.full_name || row.email}</div>
                                                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                                        <Mail size={12} />
                                                        <span className="truncate">{row.email}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="inline-flex rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-extrabold text-primary uppercase tracking-wider font-mono">
                                                    {row.role}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="text-sm font-semibold text-foreground">{row.gym_name}</div>
                                            </td>
                                            <td>
                                                <div className="text-sm text-foreground">{row.home_branch_name || (locale === 'ar' ? 'غير متوفر' : 'N/A')}</div>
                                            </td>
                                            <td>
                                                <span
                                                    className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider font-mono ${
                                                        row.activity_status === 'active'
                                                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                                                            : row.activity_status === 'stale'
                                                                ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                                                                : 'border-border bg-muted/30 text-muted-foreground'
                                                    }`}
                                                >
                                                    {row.activity_status}
                                                </span>
                                                <div className="mt-2 text-[11px] text-muted-foreground">
                                                    {row.last_activity_at ? formatDate(new Date(row.last_activity_at)) : (locale === 'ar' ? 'لا يوجد نشاط' : 'No activity yet')}
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider font-mono ${row.is_active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>
                                                    {row.is_active ? (locale === 'ar' ? 'نشط' : 'Active') : (locale === 'ar' ? 'معطل' : 'Inactive')}
                                                </span>
                                            </td>
                                            <td className="text-end">
                                                <div className="flex items-center justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => openImpersonationModal(row)}
                                                        className="text-primary hover:text-primary/80 transition-colors flex items-center gap-1 text-[10px] font-bold uppercase"
                                                    >
                                                        <UserCog size={14} />
                                                        {locale === 'ar' ? 'دخول كمسؤول' : 'Support Log-in'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={7} className="py-12 text-center text-muted-foreground font-mono">
                                        {debouncedQuery || roleFilter || gymFilter || branchFilter || activityFilter
                                            ? (locale === 'ar' ? 'لم يتم العثور على نتائج مطابقة.' : 'No users matched the current filters.')
                                            : (locale === 'ar' ? 'لا يوجد مستخدمون بعد.' : 'No users available yet.')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="md:hidden space-y-3">
                {results.length > 0 ? (
                    results.map((row) => (
                        <div key={row.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="font-bold text-foreground">{row.full_name || row.email}</div>
                                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Mail size={12} />
                                        <span className="truncate">{row.email}</span>
                                    </div>
                                </div>
                                <span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider font-mono ${row.is_active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>
                                    {row.is_active ? (locale === 'ar' ? 'نشط' : 'Active') : (locale === 'ar' ? 'معطل' : 'Inactive')}
                                </span>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'الدور' : 'Role'}</div>
                                    <div className="mt-1 font-mono text-xs text-foreground">{row.role}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'النشاط' : 'Activity'}</div>
                                    <div className={`mt-1 inline-flex rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider font-mono ${
                                        row.activity_status === 'active'
                                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                                            : row.activity_status === 'stale'
                                                ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                                                : 'border-border bg-muted/30 text-muted-foreground'
                                    }`}>
                                        {row.activity_status}
                                    </div>
                                </div>
                                <div className="col-span-2">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'النادي' : 'Gym'}</div>
                                    <div className="mt-1 font-semibold text-foreground">{row.gym_name}</div>
                                </div>
                                <div className="col-span-2">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'الفرع' : 'Branch'}</div>
                                    <div className="mt-1 text-foreground">{row.home_branch_name || (locale === 'ar' ? 'غير متوفر' : 'N/A')}</div>
                                </div>
                                <div className="col-span-2">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'آخر نشاط' : 'Last activity'}</div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                        {row.last_activity_at ? formatDate(new Date(row.last_activity_at)) : (locale === 'ar' ? 'لا يوجد نشاط' : 'No activity yet')}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => openImpersonationModal(row)}
                                    className="text-primary hover:text-primary/80 transition-colors flex items-center gap-1 text-[10px] font-bold uppercase"
                                >
                                    <UserCog size={14} />
                                    {locale === 'ar' ? 'دخول كمسؤول' : 'Support Log-in'}
                                </button>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground font-mono">
                        {debouncedQuery || roleFilter || gymFilter || branchFilter || activityFilter
                            ? (locale === 'ar' ? 'لم يتم العثور على نتائج مطابقة.' : 'No users matched the current filters.')
                            : (locale === 'ar' ? 'لا يوجد مستخدمون بعد.' : 'No users available yet.')}
                    </div>
                )}
            </div>

            <TablePagination
                page={page}
                totalPages={totalPages}
                onPrevious={() => setPage((prev) => Math.max(1, prev - 1))}
                onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            />

            <Modal
                isOpen={Boolean(impersonationTarget)}
                onClose={() => {
                    setImpersonationTarget(null);
                    setSupportReason('');
                }}
                title={locale === 'ar' ? 'تأكيد الدخول بالنيابة' : 'Confirm impersonation'}
            >
                {impersonationTarget && (
                    <div className="space-y-4">
                        <div className="rounded-lg border border-border bg-muted/20 p-4">
                            <div className="font-bold text-foreground">{impersonationTarget.full_name || impersonationTarget.email}</div>
                            <div className="mt-1 text-sm text-muted-foreground">{impersonationTarget.email}</div>
                            <div className="mt-2 text-xs text-muted-foreground">{impersonationTarget.gym_name} {impersonationTarget.home_branch_name ? `• ${impersonationTarget.home_branch_name}` : ''}</div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                {locale === 'ar' ? 'سبب الدعم' : 'Support reason'}
                            </label>
                            <textarea
                                value={supportReason}
                                onChange={(e) => setSupportReason(e.target.value)}
                                rows={4}
                                className="input-dark w-full"
                                placeholder={locale === 'ar' ? 'اختياري: اكتب سبب هذه الجلسة' : 'Optional: describe why support access is needed'}
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => { setImpersonationTarget(null); setSupportReason(''); }} className="btn-ghost">
                                {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button type="button" onClick={() => void handleImpersonate()} className="btn-primary">
                                {locale === 'ar' ? 'دخول' : 'Impersonate'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </SystemAdminShell>
    );
}
