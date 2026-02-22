'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, RefreshCw, Save, Trash2 } from 'lucide-react';

import { api } from '@/lib/api';
import { useFeedback } from '@/components/FeedbackProvider';

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
        trigger_name: 'No Check-In For 7 Days',
        template_key: 'inactive_7_days',
        message_template: 'Hi {{member_name}}, we missed you this week. Come back and continue your progress.',
    },
    {
        event_type: 'EXPIRED_30_DAYS_NO_RENEWAL',
        trigger_name: '30 Days After Expiry Without Renewal',
        template_key: 'expired_30_days_no_renewal',
        message_template: 'Hi {{member_name}}, your subscription expired one month ago. Renew now to regain full access.',
    },
    {
        event_type: 'EXPIRES_IN_3_DAYS',
        trigger_name: '3 Days Before Subscription Expiry',
        template_key: 'expires_in_3_days',
        message_template: 'Hi {{member_name}}, your subscription expires in 3 days. Renew early to avoid interruption.',
    },
] as const;

const MESSAGE_PLACEHOLDERS = ['{{member_name}}', '{{plan_name}}', '{{status}}', '{{scan_time}}', '{{kiosk_id}}'];

export default function WhatsAppAutomationPage() {
    const { showToast } = useFeedback();
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
            showToast('Failed to load WhatsApp automation settings.', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

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
            showToast(`Saved ${rule.event_type}`, 'success');
            await loadAll();
        } catch {
            showToast(`Failed to save ${rule.event_type}`, 'error');
        } finally {
            setSavingEventType(null);
        }
    };

    const createRule = async () => {
        if (!newRule.event_type.trim() || !newRule.trigger_name.trim() || !newRule.template_key.trim()) {
            showToast('Event type, trigger name, and template key are required.', 'error');
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
            showToast('Automation rule created', 'success');
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
            showToast(detail || 'Failed to create automation rule', 'error');
        } finally {
            setCreating(false);
        }
    };

    const applyPresetToNewRule = (preset: typeof RULE_PRESETS[number]) => {
        setNewRule({
            event_type: preset.event_type,
            trigger_name: preset.trigger_name,
            template_key: preset.template_key,
            message_template: preset.message_template,
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
                ? `Delete system rule "${rule.event_type}"? This requires force deletion and can disable core notifications.`
                : `Delete rule "${rule.event_type}"?`
        );
        if (!confirmation) return;

        setDeletingEventType(rule.event_type);
        try {
            await api.delete(`/admin/notifications/automation-rules/${rule.event_type}`, {
                params: { force: isSystemRule ? true : undefined },
            });
            showToast(`Deleted ${rule.event_type}`, 'success');
            await loadAll();
        } catch (err) {
            const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            showToast(detail || `Failed to delete ${rule.event_type}`, 'error');
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
                    <h1 className="text-2xl font-bold text-foreground">WhatsApp Automation</h1>
                    <p className="text-sm text-muted-foreground mt-1">Customize every automated message type and its trigger behavior.</p>
                </div>
                <button className="btn-ghost !py-2 !px-3 text-xs flex items-center gap-1.5" onClick={loadAll}>
                    <RefreshCw size={14} />
                    Refresh
                </button>
            </div>

            <div className="space-y-4">
                <div className="kpi-card p-5 space-y-4">
                    <div>
                        <p className="text-sm font-bold text-foreground">Create New Rule</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Define a trigger and message. Example client-name usage: <code>Hi {'{{member_name}}'}, ...</code>
                        </p>
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Quick Presets (your requested patterns)</p>
                        <div className="flex flex-wrap gap-2">
                            {RULE_PRESETS.map((preset) => (
                                <button
                                    key={preset.event_type}
                                    type="button"
                                    className="btn-ghost !py-1.5 !px-2.5 text-[11px]"
                                    onClick={() => applyPresetToNewRule(preset)}
                                >
                                    {preset.trigger_name}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Event Type</label>
                            <input
                                value={newRule.event_type}
                                className="input-dark"
                                placeholder="EXAMPLE_EVENT_TYPE"
                                onChange={(e) => setNewRule((prev) => ({ ...prev, event_type: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Trigger Name</label>
                            <input
                                value={newRule.trigger_name}
                                className="input-dark"
                                placeholder="Human readable trigger"
                                onChange={(e) => setNewRule((prev) => ({ ...prev, trigger_name: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Template Key</label>
                            <input
                                value={newRule.template_key}
                                className="input-dark"
                                placeholder="template_key_name"
                                onChange={(e) => setNewRule((prev) => ({ ...prev, template_key: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Message Template</label>
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
                            Enabled on creation
                        </label>
                        <button className="btn-primary !py-2 !px-3 text-xs flex items-center gap-1.5" onClick={createRule} disabled={creating}>
                            <Save size={14} />
                            {creating ? 'Creating...' : 'Create Rule'}
                        </button>
                    </div>
                </div>

                {rules.map((rule) => (
                    <div key={rule.id} className="kpi-card p-5 space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between gap-3">
                            <div>
                                <p className="text-sm font-bold text-foreground">{rule.event_type}</p>
                                <p className="text-xs text-muted-foreground mt-1">Trigger: {rule.trigger_name}</p>
                            </div>
                            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                                <input
                                    type="checkbox"
                                    checked={rule.is_enabled}
                                    onChange={(e) => updateRule(rule.event_type, { is_enabled: e.target.checked })}
                                />
                                Enabled
                            </label>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Trigger Name</label>
                                <input
                                    value={rule.trigger_name}
                                    className="input-dark"
                                    onChange={(e) => updateRule(rule.event_type, { trigger_name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Template Key</label>
                                <input
                                    value={rule.template_key}
                                    className="input-dark"
                                    onChange={(e) => updateRule(rule.event_type, { template_key: e.target.value })}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Message Template</label>
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
                                Example: <code>Hi {'{{member_name}}'}, your subscription expires in 3 days.</code>
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
                                    {savingEventType === rule.event_type ? 'Saving...' : 'Save Rule'}
                                </button>
                                <button
                                    className="btn-ghost !py-2 !px-3 text-xs flex items-center gap-1.5 text-destructive"
                                    onClick={() => deleteRule(rule)}
                                    disabled={savingEventType === rule.event_type || deletingEventType === rule.event_type}
                                >
                                    <Trash2 size={14} />
                                    {deletingEventType === rule.event_type ? 'Deleting...' : 'Delete Rule'}
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="kpi-card p-5">
                <div className="flex items-center gap-2 mb-3">
                    <MessageSquare size={16} className="text-primary" />
                    <p className="text-sm font-bold text-foreground">Recent WhatsApp Delivery Logs</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left table-dark min-w-[640px]">
                        <thead>
                            <tr>
                                <th>Event Type</th>
                                <th>Status</th>
                                <th>Error</th>
                                <th>Created At</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="text-center py-6 text-sm text-muted-foreground">No delivery logs yet.</td>
                                </tr>
                            )}
                            {logs.map((log) => (
                                <tr key={log.id}>
                                    <td className="font-mono text-xs text-foreground">{log.event_type}</td>
                                    <td className="font-mono text-xs text-muted-foreground">{log.status}</td>
                                    <td className="text-xs text-muted-foreground">{log.error_message || '-'}</td>
                                    <td className="text-xs text-muted-foreground">{log.created_at ? new Date(log.created_at).toLocaleString() : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
