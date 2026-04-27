'use client';

import { ShieldCheck, ShieldQuestion, ShieldX, Lock, Sparkles, ShieldAlert } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';

interface SecurityAuditSummary {
    overall_status: 'pass' | 'warn' | 'fail' | 'not_applicable';
    passed: number;
    warnings: number;
    failed: number;
    not_applicable: number;
}

interface SecurityCheck {
    id: string;
    category: string;
    title: string;
    status: 'pass' | 'warn' | 'fail' | 'not_applicable';
    summary: string;
    details: string[];
    evidence: string[];
    recommended_action: string | null;
}

interface SecurityAudit {
    summary: SecurityAuditSummary;
    checks: SecurityCheck[];
    generated_at: string;
}

interface SecurityAuditPanelProps {
    securityAudit: SecurityAudit | null;
}

export function SecurityAuditPanel({ securityAudit }: SecurityAuditPanelProps) {
    const { t, formatDate } = useLocale();

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

    const getSecurityStatusColor = (status: SecurityCheck['status'] | SecurityAuditSummary['overall_status']) => {
        if (status === 'pass') return 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20';
        if (status === 'fail') return 'text-red-600 bg-red-500/10 border-red-500/20';
        if (status === 'warn') return 'text-amber-600 bg-amber-500/10 border-amber-500/20';
        return 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20';
    };

    const getSecurityIcon = (status: SecurityCheck['status'] | SecurityAuditSummary['overall_status']) => {
        if (status === 'pass') return <ShieldCheck size={16} />;
        if (status === 'fail') return <ShieldX size={16} />;
        return <ShieldQuestion size={16} />;
    };

    const securitySummaryCards = securityAudit ? [
        { label: t('audit.security.passCount'), value: securityAudit.summary.passed },
        { label: t('audit.security.warnCount'), value: securityAudit.summary.warnings },
        { label: t('audit.security.failCount'), value: securityAudit.summary.failed },
        { label: t('audit.security.naCount'), value: securityAudit.summary.not_applicable },
    ] : [];

    return (
        <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.35)]">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
                <div className="absolute left-0 top-1/2 h-44 w-44 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" />
            </div>

            <div className="relative space-y-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-200">
                            <Sparkles size={12} />
                            Super-Admin Control
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-inner">
                                <ShieldAlert className="text-emerald-300" size={22} />
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold tracking-tight text-white">{t('audit.security.title')}</h2>
                                <p className="max-w-2xl text-sm leading-6 text-slate-300">
                                    {t('audit.security.subtitle')} This view is restricted to platform operators and surfaces hardening signals across the stack.
                                </p>
                            </div>
                        </div>
                    </div>

                    {securityAudit ? (
                        <div className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] ${getSecurityStatusColor(securityAudit.summary.overall_status)}`}>
                            {getSecurityIcon(securityAudit.summary.overall_status)}
                            {t(`audit.security.status.${securityAudit.summary.overall_status}` as never)}
                        </div>
                    ) : null}
                </div>

            {securityAudit ? (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {securitySummaryCards.map((card) => (
                            <div key={card.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 backdrop-blur-sm">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-300">{card.label}</p>
                                <p className="mt-2 text-2xl font-semibold text-white">{card.value}</p>
                            </div>
                        ))}
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-start table-dark">
                                <thead>
                                    <tr>
                                        <th>{t('audit.security.check')}</th>
                                        <th>{t('audit.security.category')}</th>
                                        <th>{t('audit.security.statusLabel')}</th>
                                        <th>{t('audit.security.summaryLabel')}</th>
                                        <th>{t('audit.security.action')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {securityAudit.checks.map((check) => (
                                        <tr key={check.id} className="align-top hover:bg-muted/20 transition-colors">
                                            <td className="min-w-[180px]">
                                                <div className="font-semibold text-sm text-white">{check.title}</div>
                                                {check.evidence.length > 0 ? (
                                                    <div className="mt-2 space-y-1 text-xs text-slate-300">
                                                        {check.evidence.slice(0, 2).map((item) => (
                                                            <div key={item}>{item}</div>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </td>
                                            <td className="font-mono text-xs text-slate-300">{check.category}</td>
                                            <td>
                                                <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${getSecurityStatusColor(check.status)}`}>
                                                    {getSecurityIcon(check.status)}
                                                    {t(`audit.security.status.${check.status}` as never)}
                                                </span>
                                            </td>
                                            <td className="min-w-[260px]">
                                                <div className="text-sm text-white">{check.summary}</div>
                                                {check.details.length > 0 ? (
                                                    <div className="mt-2 space-y-1 text-xs text-slate-300">
                                                        {check.details.slice(0, 3).map((item) => (
                                                            <div key={item}>{item}</div>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </td>
                                            <td className="min-w-[240px]">
                                                <div className="text-sm text-slate-300">
                                                    {check.recommended_action || t('audit.security.unavailable')}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
                        <span className="inline-flex items-center gap-2">
                            <Lock size={12} />
                            Platform security snapshot
                        </span>
                        {t('audit.security.generatedAt')}: {formatTime(securityAudit.generated_at)}
                    </div>
                </>
            ) : (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-300">
                    <div className="flex items-center gap-2 font-medium text-white">
                        <Lock size={14} />
                        {t('audit.security.unavailable')}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                        {t('audit.security.subtitle')} If this is unexpected, verify the backend can reach the audit endpoint.
                    </p>
                </div>
            )}
            </div>
        </div>
    );
}
