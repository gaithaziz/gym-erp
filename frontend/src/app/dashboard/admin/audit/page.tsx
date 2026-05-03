'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useBranch } from '@/context/BranchContext';
import { BranchSelector } from '@/components/BranchSelector';
import { ShieldAlert, RefreshCw, User, Activity, Clock, Target, Download } from 'lucide-react';
import TablePagination from '@/components/TablePagination';
import { useLocale } from '@/context/LocaleContext';

interface AuditLog {
    id: string;
    user_id: string | null;
    action: string;
    target_id: string | null;
    timestamp: string;
    details: string | null;
}
const AUDIT_PAGE_SIZE = 10;

const ACTION_LABELS: Record<string, { en: string; ar: string }> = {
    CHANGE_PASSWORD: { en: 'Change password', ar: 'تغيير كلمة المرور' },
    CLIENT_TELEMETRY_RECORDED: { en: 'Client telemetry recorded', ar: 'تسجيل بيانات العميل' },
    CORRECT_ATTENDANCE: { en: 'Correct attendance', ar: 'تصحيح الحضور' },
    CREATE_CONTRACT: { en: 'Create contract', ar: 'إنشاء عقد' },
    CREATE_PAYROLL_PAYMENT: { en: 'Create payroll payment', ar: 'إنشاء دفعة رواتب' },
    CREATE_PRODUCT: { en: 'Create product', ar: 'إنشاء منتج' },
    CREATE_SUBSCRIPTION: { en: 'Create subscription', ar: 'إنشاء اشتراك' },
    DEACTIVATE_USER: { en: 'Deactivate user', ar: 'إلغاء تفعيل مستخدم' },
    DELETE_PRODUCT: { en: 'Delete product', ar: 'حذف منتج' },
    DEMO_ACTION: { en: 'Demo action', ar: 'إجراء تجريبي' },
    EXTEND_SUBSCRIPTION: { en: 'Extend subscription', ar: 'تمديد الاشتراك' },
    GLOBAL_MAINTENANCE_TOGGLED: { en: 'Global maintenance toggled', ar: 'تبديل الصيانة العامة' },
    GYM_AUTO_LOCKED: { en: 'Gym auto-locked', ar: 'قفل النادي تلقائيًا' },
    GYM_AUTO_UNLOCKED: { en: 'Gym auto-unlocked', ar: 'فتح النادي تلقائيًا' },
    GYM_MAINTENANCE_TOGGLED: { en: 'Gym maintenance toggled', ar: 'تبديل صيانة النادي' },
    GYM_ONBOARDED: { en: 'Gym onboarded', ar: 'تسجيل النادي' },
    GYM_ONBOARD_BLOCKED: { en: 'Gym onboarding blocked', ar: 'حظر تسجيل النادي' },
    LOST_FOUND_ASSIGNED: { en: 'Lost and found assigned', ar: 'تعيين المفقودات' },
    LOST_FOUND_COMMENT_ADDED: { en: 'Lost and found comment added', ar: 'إضافة تعليق للمفقودات' },
    LOST_FOUND_CREATED: { en: 'Lost and found created', ar: 'إنشاء مفقودات' },
    LOST_FOUND_MEDIA_ADDED: { en: 'Lost and found media added', ar: 'إضافة وسائط للمفقودات' },
    LOST_FOUND_STATUS_UPDATED: { en: 'Lost and found status updated', ar: 'تحديث حالة المفقودات' },
    LOW_STOCK_ACKNOWLEDGED: { en: 'Low stock acknowledged', ar: 'تأكيد انخفاض المخزون' },
    LOW_STOCK_RESTOCK_TARGET_SET: { en: 'Restock target set', ar: 'تحديد هدف إعادة التخزين' },
    LOW_STOCK_SNOOZED: { en: 'Low stock snoozed', ar: 'تأجيل تنبيه المخزون' },
    MANUAL_TRANSACTION: { en: 'Manual transaction', ar: 'عملية يدوية' },
    MOBILE_POS_CHECKOUT: { en: 'Mobile POS checkout', ar: 'دفع من الجوال' },
    MOBILE_REGISTER_MEMBER: { en: 'Mobile register member', ar: 'تسجيل عضو من الجوال' },
    PAYROLL_AUTOMATION_RUN: { en: 'Payroll automation run', ar: 'تشغيل أتمتة الرواتب' },
    REGISTER_USER: { en: 'Register user', ar: 'تسجيل مستخدم' },
    RENEW_SUBSCRIPTION: { en: 'Renew subscription', ar: 'تجديد الاشتراك' },
    RUN_PAYROLL_AUTOMATION: { en: 'Run payroll automation', ar: 'تشغيل أتمتة الرواتب' },
    SELF_DEACTIVATE: { en: 'Self deactivate', ar: 'إلغاء تفعيل ذاتي' },
    SUBSCRIPTIONS_SYNC_TRIGGERED: { en: 'Subscriptions sync triggered', ar: 'تشغيل مزامنة الاشتراكات' },
    UPDATE_CONTRACT: { en: 'Update contract', ar: 'تحديث العقد' },
    UPDATE_PAYROLL: { en: 'Update payroll', ar: 'تحديث الرواتب' },
    UPDATE_PAYROLL_SETTINGS: { en: 'Update payroll settings', ar: 'تحديث إعدادات الرواتب' },
    UPDATE_PAYROLL_STATUS: { en: 'Update payroll status', ar: 'تحديث حالة الرواتب' },
    UPDATE_PRODUCT: { en: 'Update product', ar: 'تحديث المنتج' },
    UPDATE_PROFILE: { en: 'Update profile', ar: 'تحديث الملف الشخصي' },
    UPDATE_PROFILE_PICTURE: { en: 'Update profile picture', ar: 'تحديث صورة الملف الشخصي' },
    UPDATE_SUBSCRIPTION_STATUS: { en: 'Update subscription status', ar: 'تحديث حالة الاشتراك' },
    UPDATE_USER: { en: 'Update user', ar: 'تحديث المستخدم' },
    USER_IMPERSONATED: { en: 'User impersonated', ar: 'انتحال مستخدم' },
};

export default function AuditLogsPage() {
    const { t, formatDate, locale } = useLocale();
    const { branches, selectedBranchId, setSelectedBranchId } = useBranch();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const auditText = locale === 'ar'
        ? {
            title: 'سجلات التدقيق',
            subtitle: 'نشاط النظام ومسار الأمان',
            exportCsv: 'تصدير CSV',
            refresh: 'تحديث',
            totalLogs: 'إجمالي السجلات',
            uniqueActors: 'المستخدمون الفريدون',
            topAction: 'أكثر إجراء',
            topActions: 'أهم الإجراءات',
            noActivity: 'لا يوجد نشاط تدقيق حتى الآن.',
            loading: 'جارٍ التحميل',
            empty: 'لا توجد سجلات تدقيق.',
            actionTotal: 'الإجمالي',
            timestamp: 'الوقت',
            action: 'الإجراء',
            userId: 'معرّف المستخدم',
            targetId: 'معرّف الهدف',
            details: 'التفاصيل',
            system: 'النظام',
        }
        : {
            title: 'Audit Logs',
            subtitle: 'System activity and security trail',
            exportCsv: 'Export CSV',
            refresh: 'Refresh',
            totalLogs: 'Total logs',
            uniqueActors: 'Unique actors',
            topAction: 'Top action',
            topActions: 'Top actions',
            noActivity: 'No audit activity yet.',
            loading: 'Loading',
            empty: 'No audit logs.',
            actionTotal: 'Total',
            timestamp: 'Timestamp',
            action: 'Action',
            userId: 'User ID',
            targetId: 'Target ID',
            details: 'Details',
            system: 'System',
        };

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const params: Record<string, string | number> = { limit: 100 };
            if (selectedBranchId && selectedBranchId !== 'all') params.branch_id = selectedBranchId;

            const logsRes = await api.get('/audit/logs', { params });
            setLogs(logsRes.data.data || []);
        } catch (err) {
            console.error('Failed to fetch audit logs:', err);
            setLoadError(locale === 'ar' ? 'فشل تحميل سجلات التدقيق.' : 'Failed to load audit logs.');
        } finally {
            setLoading(false);
        }
    }, [locale, selectedBranchId]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    useEffect(() => {
        setPage(1);
    }, [logs.length]);

    const formatTime = (isoString: string) => {
        try {
            return formatDate(new Date(isoString), {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return isoString;
        }
    };

    const getActionColor = (action: string) => {
        if (action.includes('CREATE')) return 'text-green-500 bg-green-500/10 border-green-500/20';
        if (action.includes('DELETE') || action.includes('DEACTIVATE')) return 'text-red-500 bg-red-500/10 border-red-500/20';
        if (action.includes('UPDATE')) return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
        if (action.includes('SALE') || action.includes('TRANSACTION')) return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
        return 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20';
    };

    const formatActionLabel = (action: string) => {
        const entry = ACTION_LABELS[action];
        if (entry) {
            return locale === 'ar' ? entry.ar : entry.en;
        }
        return action
            .toLowerCase()
            .split('_')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    };

    const totalPages = Math.max(1, Math.ceil(logs.length / AUDIT_PAGE_SIZE));
    const visibleLogs = logs.slice((page - 1) * AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE);
    const uniqueActors = new Set(logs.map((log) => log.user_id || 'SYSTEM')).size;
    const topActions = Object.entries(
        logs.reduce<Record<string, number>>((acc, log) => {
            acc[log.action] = (acc[log.action] || 0) + 1;
            return acc;
        }, {}),
    )
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3);

    const exportLogs = async () => {
        try {
            const params: Record<string, string | number> = { limit: 500 };
            if (selectedBranchId && selectedBranchId !== 'all') params.branch_id = selectedBranchId;
            const response = await api.get('/audit/logs/export', {
                params,
                responseType: 'blob',
            });
            const blob = response.data as Blob;
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to export audit logs:', err);
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight flex items-center gap-2">
                        <ShieldAlert className="text-primary" />
                        {auditText.title}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">{auditText.subtitle}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <BranchSelector
                        branches={branches}
                        selectedBranchId={selectedBranchId}
                        onSelect={setSelectedBranchId}
                    />
                    <button
                        onClick={exportLogs}
                        disabled={loading || logs.length === 0}
                        className="btn-ghost group inline-flex items-center gap-2 border border-border"
                    >
                        <Download size={16} />
                        {auditText.exportCsv}
                    </button>
                    <button
                    onClick={fetchLogs}
                    disabled={loading}
                    className="btn-primary group"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
                    {auditText.refresh}
                </button>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-muted/10 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{auditText.totalLogs}</p>
                    <p className="mt-2 text-2xl font-bold text-foreground font-mono">{logs.length}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/10 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{auditText.uniqueActors}</p>
                    <p className="mt-2 text-2xl font-bold text-foreground font-mono">{uniqueActors}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/10 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{auditText.topAction}</p>
                    <p className="mt-2 text-2xl font-bold text-foreground font-mono">{topActions[0] ? formatActionLabel(topActions[0][0]) : '-'}</p>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
                {topActions.length > 0 ? topActions.map(([action, count]) => (
                    <div key={action} className="rounded-xl border border-border bg-muted/10 p-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{formatActionLabel(action)}</p>
                        <p className="mt-2 text-2xl font-bold text-foreground font-mono">{count}</p>
                    </div>
                )) : (
                    <div className="rounded-xl border border-border bg-muted/10 p-4 md:col-span-3">
                        <p className="text-sm text-muted-foreground">{auditText.noActivity}</p>
                    </div>
                )}
            </div>

            <div className="kpi-card p-0 overflow-hidden">
                {loadError ? (
                    <div className="flex items-center justify-between gap-3 border-b border-border bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        <span>{loadError}</span>
                        <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => void fetchLogs()}>
                            {auditText.refresh}
                        </button>
                    </div>
                ) : null}
                <div className="overflow-x-auto">
                    <table className="w-full text-start border-collapse table-dark">
                        <thead>
                            <tr>
                                <th><div className="flex items-center gap-2"><Clock size={14} /> {auditText.timestamp}</div></th>
                                <th><div className="flex items-center gap-2"><Activity size={14} /> {auditText.action}</div></th>
                                <th><div className="flex items-center gap-2"><User size={14} /> {auditText.userId}</div></th>
                                <th><div className="flex items-center gap-2"><Target size={14} /> {auditText.targetId}</div></th>
                                <th>{auditText.details}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-12">
                                        <RefreshCw size={24} className="animate-spin text-primary mx-auto" />
                                        <p className="text-muted-foreground mt-2 text-sm">{auditText.loading}</p>
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-12 text-muted-foreground text-sm font-mono">
                                        {auditText.empty}
                                    </td>
                                </tr>
                            ) : (
                                visibleLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                                            {formatTime(log.timestamp)}
                                        </td>
                                        <td className="whitespace-nowrap">
                                            <span className={`px-2 py-1 border rounded-sm text-[10px] font-bold uppercase tracking-wider font-mono ${getActionColor(log.action)}`}>
                                                {formatActionLabel(log.action)}
                                            </span>
                                        </td>
                                        <td className="font-mono text-xs text-muted-foreground" title={log.user_id || t('audit.system')}>
                                            {log.user_id ? log.user_id.split('-')[0] + '...' : auditText.system}
                                        </td>
                                        <td className="font-mono text-xs text-muted-foreground" title={log.target_id || '-'}>
                                            {log.target_id ? log.target_id.split('-')[0] + '...' : '-'}
                                        </td>
                                        <td className="text-sm max-w-md truncate" title={log.details || ''}>
                                            {log.details || '-'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <TablePagination
                    page={page}
                    totalPages={totalPages}
                    onPrevious={() => setPage((prev) => Math.max(1, prev - 1))}
                    onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                />
            </div>
        </div>
    );
}
