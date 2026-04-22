'use client';

import { api } from '@/lib/api';
import { normalizeApiError, reportSystemTabError } from '@/lib/systemTelemetry';
import { setTokens, getAccessToken, getRefreshToken } from '@/lib/tokenStorage';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, Search, Mail, Shield, UserCog, RefreshCcw } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';
import TablePagination from '@/components/TablePagination';

interface UserResult {
    id: string;
    email: string;
    full_name: string;
    role: string;
    gym_id: string;
    gym_name: string;
    home_branch_id: string | null;
    last_activity_at: string | null;
}

interface UsersPayload {
    items: UserResult[];
    total: number;
    page: number;
    limit: number;
}

const PAGE_SIZE = 20;

export default function GlobalUserSearchPage() {
    const { locale, formatDate } = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const initialQuery = useMemo(() => searchParams.get('q') || '', [searchParams]);
    const initialPage = useMemo(() => {
        const raw = Number(searchParams.get('page') || '1');
        return Number.isFinite(raw) && raw > 0 ? raw : 1;
    }, [searchParams]);

    const [queryInput, setQueryInput] = useState(initialQuery);
    const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
    const [page, setPage] = useState(initialPage);

    const [results, setResults] = useState<UserResult[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedQuery(queryInput.trim());
            setPage(1);
        }, 250);
        return () => window.clearTimeout(timer);
    }, [queryInput]);

    useEffect(() => {
        const params = new URLSearchParams();
        if (debouncedQuery) params.set('q', debouncedQuery);
        if (page > 1) params.set('page', String(page));
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, [debouncedQuery, page, pathname, router]);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const resp = await api.get('/system/users/search', {
                params: {
                    q: debouncedQuery,
                    page,
                    limit: PAGE_SIZE,
                },
            });
            const payload = resp.data?.data as UsersPayload | undefined;
            if (payload && Array.isArray(payload.items)) {
                setResults(payload.items);
                setTotal(Number(payload.total || 0));
                return;
            }

            // backward compatibility for old array shape
            const legacy = Array.isArray(resp.data) ? (resp.data as UserResult[]) : [];
            setResults(legacy);
            setTotal(legacy.length);
        } catch (err) {
            const message = normalizeApiError(err);
            setError(message);
            setResults([]);
            setTotal(0);
            await reportSystemTabError('system_users', 'fetch_users', err, {
                query: debouncedQuery,
                page,
                limit: PAGE_SIZE,
            });
        } finally {
            setLoading(false);
        }
    }, [debouncedQuery, page]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleImpersonate = async (userId: string) => {
        try {
            const currentAccess = getAccessToken();
            const currentRefresh = getRefreshToken();

            const resp = await api.post(`/system/users/${userId}/impersonate`);
            const { access_token, refresh_token } = resp.data;

            if (currentAccess) sessionStorage.setItem('admin_access_token', currentAccess);
            if (currentRefresh) sessionStorage.setItem('admin_refresh_token', currentRefresh);

            setTokens(access_token, refresh_token);
            window.location.href = '/dashboard';
        } catch (err) {
            await reportSystemTabError('system_users', 'impersonate', err, { userId });
            alert(locale === 'ar' ? 'فشل تسجيل الدخول بالنيابة عن المستخدم.' : 'Failed to impersonate user.');
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">
                    {locale === 'ar' ? 'البحث العام عن المستخدمين' : 'Global User Search'}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    {locale === 'ar' ? 'عرض أحدث المستخدمين أو البحث عبر كل الصالات' : 'Browse recent users or search across all platform tenants'}
                </p>
            </div>

            <div className="max-w-2xl">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        setDebouncedQuery(queryInput.trim());
                        setPage(1);
                    }}
                    className="flex gap-2"
                >
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                        <input
                            type="text"
                            value={queryInput}
                            onChange={(e) => setQueryInput(e.target.value)}
                            placeholder={locale === 'ar' ? 'ابحث بالبريد الإلكتروني أو الاسم...' : 'Search by email or name...'}
                            className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2 text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
                        />
                    </div>
                    <button type="button" onClick={() => fetchUsers()} className="btn-ghost !px-3" disabled={loading}>
                        <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                </form>
            </div>

            {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3">
                    <span>{error}</span>
                    <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => fetchUsers()}>
                        {locale === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                    </button>
                </div>
            )}

            {loading && results.length === 0 ? (
                <div className="kpi-card p-10 text-center text-muted-foreground">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-3" />
                    {locale === 'ar' ? 'جاري تحميل المستخدمين...' : 'Loading users...'}
                </div>
            ) : results.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {results.map((r) => (
                        <div key={r.id} className="kpi-card p-4 hover:border-primary transition-colors group">
                            <div className="flex items-start gap-4">
                                <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                                    <Users size={20} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-foreground truncate">{r.full_name || r.email}</h3>
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                        <Mail size={12} />
                                        <span className="truncate">{r.email}</span>
                                    </div>
                                    <div className="mt-2 text-[11px] text-muted-foreground">
                                        {locale === 'ar' ? 'المنشأة' : 'Gym'}: {r.gym_name}
                                    </div>
                                    <div className="mt-1 text-[11px] text-muted-foreground">
                                        {locale === 'ar' ? 'آخر نشاط' : 'Last Activity'}:{' '}
                                        {r.last_activity_at ? formatDate(new Date(r.last_activity_at)) : (locale === 'ar' ? 'غير متوفر' : 'N/A')}
                                    </div>
                                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                                        <div className="flex items-center gap-1.5">
                                            <Shield size={12} className="text-primary" />
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{r.role}</span>
                                        </div>
                                        <button
                                            onClick={() => handleImpersonate(r.id)}
                                            className="text-primary hover:text-primary/80 transition-colors flex items-center gap-1 text-[10px] font-bold uppercase"
                                        >
                                            <UserCog size={14} />
                                            {locale === 'ar' ? 'دخول كمسؤول' : 'Support Log-in'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="col-span-full py-12 text-center border border-dashed border-border rounded-lg">
                    <p className="text-muted-foreground font-mono">
                        {debouncedQuery
                            ? (locale === 'ar' ? 'لم يتم العثور على نتائج مطابقة' : 'No users found for this query')
                            : (locale === 'ar' ? 'لا يوجد مستخدمون بعد' : 'No users available yet')}
                    </p>
                </div>
            )}

            <TablePagination
                page={page}
                totalPages={totalPages}
                onPrevious={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
            />
        </div>
    );
}
