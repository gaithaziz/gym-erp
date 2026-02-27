'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquare, RefreshCw, Save, Trash2 } from 'lucide-react';

import { api } from '@/lib/api';
import { useFeedback } from '@/components/FeedbackProvider';
import { useLocale } from '@/context/LocaleContext';

interface AutomationRule {
    id: string;
    event_type: string;
    trigger_name: string;
    template_key: string;
    message_template: string | null;
    is_enabled: boolean;
    updated_at?: string | null;
}

interface DeliveryLog {
    id: string;
    event_type: string;
    status: string;
    error_message: string | null;
    created_at: string | null;
}

const RULE_PRESETS = [
    {
        event_type: 'INACTIVE_7_DAYS',
        trigger_name_en: 'No Check-In For 7 Days',
        trigger_name_ar: 'لا يوجد دخول خلال 7 أيام',
        template_key: 'inactive_7_days',
        message_template_en: 'Hi {{member_name}}, we missed you this week. Come back and continue your progress.',
        message_template_ar: 'مرحباً {{member_name}}، اشتقنا لك هذا الأسبوع. عُد لمتابعة تقدمك.',
    },
    {
        event_type: 'EXPIRED_30_DAYS_NO_RENEWAL',
        trigger_name_en: '30 Days After Expiry Without Renewal',
        trigger_name_ar: 'بعد 30 يوماً من الانتهاء بدون تجديد',
        template_key: 'expired_30_days_no_renewal',
        message_template_en: 'Hi {{member_name}}, your subscription expired one month ago. Renew now to regain full access.',
        message_template_ar: 'مرحباً {{member_name}}، اشتراكك انتهى منذ شهر. جدده الآن لاستعادة الوصول الكامل.',
    },
    {
        event_type: 'EXPIRES_IN_3_DAYS',
        trigger_name_en: '3 Days Before Subscription Expiry',
        trigger_name_ar: 'قبل انتهاء الاشتراك بـ 3 أيام',
        template_key: 'expires_in_3_days',
        message_template_en: 'Hi {{member_name}}, your subscription expires in 3 days. Renew early to avoid interruption.',
        message_template_ar: 'مرحباً {{member_name}}، ينتهي اشتراكك خلال 3 أيام. جدد مبكراً لتجنب الانقطاع.',
    },
] as const;

const MESSAGE_PLACEHOLDERS = ['{{member_name}}', '{{plan_name}}', '{{status}}', '{{scan_time}}', '{{kiosk_id}}'];

export default function WhatsAppAutomationPage() {
    const { showToast } = useFeedback();
    const { locale, formatDate } = useLocale();
    const [rules, setRules] = useState<AutomationRule[]>([]);
    const [logs, setLogs] = useState<DeliveryLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingEventType, setSavingEventType] = useState<string | null>(null);
    const [deletingEventType, setDeletingEventType] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [newRule, setNewRule] = useState({
        event_type: '',
        trigger_name: '',
        template_key: '',
        message_template: '',
        is_enabled: true,
    });

    const txt = useMemo(
        () =>
            locale === 'ar'
                ? {
                    loadFailed: 'فشل في تحميل إعدادات أتمتة واتساب.',
                    saveDone: 'تم حفظ القاعدة',
                    saveFailed: 'فشل في حفظ القاعدة',
                    requiredFields: 'نوع الحدث واسم المشغل ومفتاح القالب حقول مطلوبة.',
                    createDone: 'تم إنشاء قاعدة الأتمتة',
                    createFailed: 'فشل في إنشاء قاعدة الأتمتة',
                    deleteDone: 'تم حذف القاعدة',
                    deleteFailed: 'فشل في حذف القاعدة',
                    deleteSystemConfirmPrefix: 'حذف قاعدة النظام',
                    deleteSystemConfirmSuffix: 'يتطلب هذا حذفاً إجبارياً وقد يعطل إشعارات أساسية.',
                    deleteRuleConfirmPrefix: 'حذف القاعدة',
                    title: 'أتمتة واتساب',
                    subtitle: 'خصص كل نوع رسالة تلقائية وسلوك تشغيلها.',
                    refresh: 'تحديث',
                    createNewRule: 'إنشاء قاعدة جديدة',
                    createHelp: 'عرّف المشغل والرسالة. مثال استخدام اسم العميل:',
                    quickPresets: 'نماذج سريعة',
                    eventType: 'نوع الحدث',
                    triggerName: 'اسم المشغل',
                    templateKey: 'مفتاح القالب',
                    messageTemplate: 'قالب الرسالة',
                    enabledOnCreate: 'مفعل عند الإنشاء',
                    creating: 'جارٍ الإنشاء...',
                    createRule: 'إنشاء القاعدة',
                    triggerPrefix: 'المشغل',
                    enabled: 'مفعل',
                    example: 'مثال',
                    saving: 'جارٍ الحفظ...',
                    saveRule: 'حفظ القاعدة',
                    deleting: 'جارٍ الحذف...',
                    deleteRule: 'حذف القاعدة',
                    recentLogs: 'آخر سجلات تسليم واتساب',
                    status: 'الحالة',
                    error: 'الخطأ',
                    createdAt: 'وقت الإنشاء',
                    noLogs: 'لا توجد سجلات تسليم بعد.',
                    humanReadableTrigger: 'اسم واضح للمشغل',
                    ruleNamePlaceholder: 'EVENT_TYPE_EXAMPLE',
                }
                : {
                    loadFailed: 'Failed to load WhatsApp automation settings.',
                    saveDone: 'Saved rule',
                    saveFailed: 'Failed to save rule',
                    requiredFields: 'Event type, trigger name, and template key are required.',
                    createDone: 'Automation rule created',
                    createFailed: 'Failed to create automation rule',
                    deleteDone: 'Deleted rule',
                    deleteFailed: 'Failed to delete rule',
                    deleteSystemConfirmPrefix: 'Delete system rule',
                    deleteSystemConfirmSuffix: 'This requires force deletion and can disable core notifications.',
                    deleteRuleConfirmPrefix: 'Delete rule',
                    title: 'WhatsApp Automation',
                    subtitle: 'Customize every automated message type and its trigger behavior.',
                    refresh: 'Refresh',
                    createNewRule: 'Create New Rule',
                    createHelp: 'Define a trigger and message. Example client-name usage:',
                    quickPresets: 'Quick Presets',
                    eventType: 'Event Type',
                    triggerName: 'Trigger Name',
                    templateKey: 'Template Key',
                    messageTemplate: 'Message Template',
                    enabledOnCreate: 'Enabled on creation',
                    creating: 'Creating...',
                    createRule: 'Create Rule',
                    triggerPrefix: 'Trigger',
                    enabled: 'Enabled',
                    example: 'Example',
                    saving: 'Saving...',
                    saveRule: 'Save Rule',
                    deleting: 'Deleting...',
                    deleteRule: 'Delete Rule',
                    recentLogs: 'Recent WhatsApp Delivery Logs',
                    status: 'Status',
                    error: 'Error',
                    createdAt: 'Created At',
                    noLogs: 'No delivery logs yet.',
                    humanReadableTrigger: 'Human readable trigger',
                    ruleNamePlaceholder: 'EVENT_TYPE_EXAMPLE',
                },
        [locale]
    );

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [rulesRes, logsRes] = await Promise.all([
                api.get('/admin/notifications/automation-rules'),
                api.get('/admin/notifications/whatsapp-logs', { params: { limit: 12 } }),
            ]);
            setRules(rulesRes.data.data || []);
            setLogs(logsRes.data.data || []);
        } catch {
            showToast(txt.loadFailed, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast, txt.loadFailed]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const updateRule = (eventType: string, patch: Partial<AutomationRule>) => {
        setRules((prev) => prev.map((rule) => (rule.event_type === eventType ? { ...rule, ...patch } : rule)));
    };

    const saveRule = async (rule: AutomationRule) => {
        setSavingEventType(rule.event_type);
        try {
            await api.put(`/admin/notifications/automation-rules/${rule.event_type}`, {
                trigger_name: rule.trigger_name,
                template_key: rule.template_key,
                message_template: rule.message_template,
                is_enabled: rule.is_enabled,
            });
            showToast(`${txt.saveDone}: ${rule.event_type}`, 'success');
            await loadAll();
        } catch {
            showToast(`${txt.saveFailed}: ${rule.event_type}`, 'error');
        } finally {
            setSavingEventType(null);
        }
    };

    const createRule = async () => {
        if (!newRule.event_type.trim() || !newRule.trigger_name.trim() || !newRule.template_key.trim()) {
            showToast(txt.requiredFields, 'error');
            return;
        }

        setCreating(true);
        try {
            await api.post('/admin/notifications/automation-rules', {
                event_type: newRule.event_type.trim().toUpperCase(),
                trigger_name: newRule.trigger_name.trim(),
                template_key: newRule.template_key.trim(),
                message_template: newRule.message_template.trim() || null,
                is_enabled: newRule.is_enabled,
            });
            showToast(txt.createDone, 'success');
            setNewRule({
                event_type: '',
                trigger_name: '',
                template_key: '',
                message_template: '',
                is_enabled: true,
            });
            await loadAll();
        } catch (err) {
            const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            showToast(detail || txt.createFailed, 'error');
        } finally {
            setCreating(false);
        }
    };

    const applyPresetToNewRule = (preset: (typeof RULE_PRESETS)[number]) => {
        setNewRule({
            event_type: preset.event_type,
            trigger_name: locale === 'ar' ? preset.trigger_name_ar : preset.trigger_name_en,
            template_key: preset.template_key,
            message_template: locale === 'ar' ? preset.message_template_ar : preset.message_template_en,
            is_enabled: true,
        });
    };

    const appendPlaceholderToNewRule = (placeholder: string) => {
        setNewRule((prev) => ({
            ...prev,
            message_template: `${prev.message_template}${prev.message_template ? ' ' : ''}${placeholder}`,
        }));
    };

    const appendPlaceholderToRule = (eventType: string, placeholder: string) => {
        const targetRule = rules.find((rule) => rule.event_type === eventType);
        if (!targetRule) return;
        const current = targetRule.message_template || '';
        updateRule(eventType, { message_template: `${current}${current ? ' ' : ''}${placeholder}` });
    };

    const deleteRule = async (rule: AutomationRule) => {
        const isSystemRule = ['ACCESS_GRANTED', 'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_RENEWED', 'SUBSCRIPTION_STATUS_CHANGED'].includes(rule.event_type);
        const confirmation = window.confirm(
            isSystemRule
                ? `${txt.deleteSystemConfirmPrefix} "${rule.event_type}"? ${txt.deleteSystemConfirmSuffix}`
                : `${txt.deleteRuleConfirmPrefix} "${rule.event_type}"?`
        );
        if (!confirmation) return;

        setDeletingEventType(rule.event_type);
        try {
            await api.delete(`/admin/notifications/automation-rules/${rule.event_type}`, {
                params: { force: isSystemRule ? true : undefined },
            });
            showToast(`${txt.deleteDone}: ${rule.event_type}`, 'success');
            await loadAll();
        } catch (err) {
            const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            showToast(detail || `${txt.deleteFailed}: ${rule.event_type}`, 'error');
        } finally {
            setDeletingEventType(null);
        }
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{txt.title}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{txt.subtitle}</p>
                </div>
                <button className="btn-ghost !py-2 !px-3 text-xs flex items-center gap-1.5" onClick={loadAll}>
                    <RefreshCw size={14} />
                    {txt.refresh}
                </button>
            </div>

            <div className="space-y-4">
                <div className="kpi-card p-5 space-y-4">
                    <div>
                        <p className="text-sm font-bold text-foreground">{txt.createNewRule}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {txt.createHelp} <code>Hi {'{{member_name}}'}, ...</code>
                        </p>
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">{txt.quickPresets}</p>
                        <div className="flex flex-wrap gap-2">
                            {RULE_PRESETS.map((preset) => (
                                <button
                                    key={preset.event_type}
                                    type="button"
                                    className="btn-ghost !py-1.5 !px-2.5 text-[11px]"
                                    onClick={() => applyPresetToNewRule(preset)}
                                >
                                    {locale === 'ar' ? preset.trigger_name_ar : preset.trigger_name_en}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.eventType}</label>
                            <input
                                value={newRule.event_type}
                                className="input-dark"
                                placeholder={txt.ruleNamePlaceholder}
                                onChange={(e) => setNewRule((prev) => ({ ...prev, event_type: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.triggerName}</label>
                            <input
                                value={newRule.trigger_name}
                                className="input-dark"
                                placeholder={txt.humanReadableTrigger}
                                onChange={(e) => setNewRule((prev) => ({ ...prev, trigger_name: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.templateKey}</label>
                            <input
                                value={newRule.template_key}
                                className="input-dark"
                                placeholder="template_key_name"
                                onChange={(e) => setNewRule((prev) => ({ ...prev, template_key: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.messageTemplate}</label>
                        <textarea
                            value={newRule.message_template}
                            className="input-dark min-h-20"
                            onChange={(e) => setNewRule((prev) => ({ ...prev, message_template: e.target.value }))}
                        />
                        <div className="flex flex-wrap gap-2 mt-2">
                            {MESSAGE_PLACEHOLDERS.map((placeholder) => (
                                <button
                                    key={`new-${placeholder}`}
                                    type="button"
                                    className="btn-ghost !py-1 !px-2 text-[10px]"
                                    onClick={() => appendPlaceholderToNewRule(placeholder)}
                                >
                                    {placeholder}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={newRule.is_enabled}
                                onChange={(e) => setNewRule((prev) => ({ ...prev, is_enabled: e.target.checked }))}
                            />
                            {txt.enabledOnCreate}
                        </label>
                        <button className="btn-primary !py-2 !px-3 text-xs flex items-center gap-1.5" onClick={createRule} disabled={creating}>
                            <Save size={14} />
                            {creating ? txt.creating : txt.createRule}
                        </button>
                    </div>
                </div>

                {rules.map((rule) => (
                    <div key={rule.id} className="kpi-card p-5 space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between gap-3">
                            <div>
                                <p className="text-sm font-bold text-foreground">{rule.event_type}</p>
                                <p className="text-xs text-muted-foreground mt-1">{txt.triggerPrefix}: {rule.trigger_name}</p>
                            </div>
                            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                                <input
                                    type="checkbox"
                                    checked={rule.is_enabled}
                                    onChange={(e) => updateRule(rule.event_type, { is_enabled: e.target.checked })}
                                />
                                {txt.enabled}
                            </label>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.triggerName}</label>
                                <input
                                    value={rule.trigger_name}
                                    className="input-dark"
                                    onChange={(e) => updateRule(rule.event_type, { trigger_name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.templateKey}</label>
                                <input
                                    value={rule.template_key}
                                    className="input-dark"
                                    onChange={(e) => updateRule(rule.event_type, { template_key: e.target.value })}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.messageTemplate}</label>
                            <textarea
                                value={rule.message_template || ''}
                                className="input-dark min-h-24"
                                onChange={(e) => updateRule(rule.event_type, { message_template: e.target.value })}
                            />
                            <div className="flex flex-wrap gap-2 mt-2">
                                {MESSAGE_PLACEHOLDERS.map((placeholder) => (
                                    <button
                                        key={`${rule.event_type}-${placeholder}`}
                                        type="button"
                                        className="btn-ghost !py-1 !px-2 text-[10px]"
                                        onClick={() => appendPlaceholderToRule(rule.event_type, placeholder)}
                                    >
                                        {placeholder}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1">
                                {txt.example}: <code>Hi {'{{member_name}}'}, your subscription expires in 3 days.</code>
                            </p>
                        </div>
                        <div className="flex justify-end">
                            <div className="flex gap-2">
                                <button
                                    className="btn-primary !py-2 !px-3 text-xs flex items-center gap-1.5"
                                    onClick={() => saveRule(rule)}
                                    disabled={savingEventType === rule.event_type || deletingEventType === rule.event_type}
                                >
                                    <Save size={14} />
                                    {savingEventType === rule.event_type ? txt.saving : txt.saveRule}
                                </button>
                                <button
                                    className="btn-ghost !py-2 !px-3 text-xs flex items-center gap-1.5 text-destructive"
                                    onClick={() => deleteRule(rule)}
                                    disabled={savingEventType === rule.event_type || deletingEventType === rule.event_type}
                                >
                                    <Trash2 size={14} />
                                    {deletingEventType === rule.event_type ? txt.deleting : txt.deleteRule}
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="kpi-card p-5">
                <div className="flex items-center gap-2 mb-3">
                    <MessageSquare size={16} className="text-primary" />
                    <p className="text-sm font-bold text-foreground">{txt.recentLogs}</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left table-dark min-w-[640px]">
                        <thead>
                            <tr>
                                <th>{txt.eventType}</th>
                                <th>{txt.status}</th>
                                <th>{txt.error}</th>
                                <th>{txt.createdAt}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="text-center py-6 text-sm text-muted-foreground">{txt.noLogs}</td>
                                </tr>
                            )}
                            {logs.map((log) => (
                                <tr key={log.id}>
                                    <td className="font-mono text-xs text-foreground">{log.event_type}</td>
                                    <td className="font-mono text-xs text-muted-foreground">{log.status}</td>
                                    <td className="text-xs text-muted-foreground">{log.error_message || '-'}</td>
                                    <td className="text-xs text-muted-foreground">
                                        {log.created_at ? formatDate(log.created_at, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
