'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Lock, PenLine, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import {
    DEFAULT_POLICY_CONTENT,
    POLICY_VERSION,
    PolicyContent,
    PolicyLocale,
    PolicySignature,
    getPolicySignatureKey,
    getLegacyPolicySignatureKey,
    getLocalePolicySignatureKey,
    loadPolicyContent,
} from '@/lib/gymPolicy';

const asPolicyLocale = (locale: string): PolicyLocale => (locale === 'ar' ? 'ar' : 'en');

export default function GymPolicyPage() {
    const { user } = useAuth();
    const { locale, formatDate } = useLocale();
    const router = useRouter();
    const policyLocale = asPolicyLocale(locale);
    const [policy, setPolicy] = useState<PolicyContent>(DEFAULT_POLICY_CONTENT[policyLocale]);
    const [signature, setSignature] = useState<PolicySignature | null>(null);
    const [signerName, setSignerName] = useState(user?.full_name || '');
    const [isSigning, setIsSigning] = useState(false);
    const [signError, setSignError] = useState<string | null>(null);

    const txt = locale === 'ar'
        ? {
            title: 'السياسة والعقد',
            subtitle: 'راجع سياسة النادي وعقد العضوية قبل متابعة أي إجراء مرتبط بالاشتراك.',
            signed: 'موقّع',
            unsigned: 'غير موقّع',
            signNow: 'توقيع العقد',
            signerName: 'اسم الموقّع',
            signatureNote: 'يُستخدم هذا التوقيع لتأكيد الموافقة على نسخة السياسة الحالية.',
            continue: 'العودة إلى الاشتراك',
            adminNote: 'يمكن للمشرف تعديل نسخة السياسة من صفحة الإدارة.',
            effectiveDate: 'تاريخ السريان',
            updatedAt: 'آخر تحديث',
            contractVersion: 'إصدار العقد',
            policyPreview: 'ملخص السياسة',
            signingRequired: 'يجب توقيع العقد قبل إكمال الدفع أو متابعة تغيير الاشتراك.',
            mobileSteps: 'الخطوات السريعة',
            stepReview: '1. اقرأ العقد',
            stepSign: '2. وقّع باسمك',
            stepContinue: '3. عد للاشتراك',
        }
        : {
            title: 'Policy & Contract',
            subtitle: 'Review the gym policy and membership contract before continuing with any subscription-related step.',
            signed: 'Signed',
            unsigned: 'Unsigned',
            signNow: 'Sign Contract',
            signerName: 'Signer Name',
            signatureNote: 'This signature confirms acceptance of the current policy version.',
            continue: 'Back to Subscription',
            adminNote: 'Admins can update the policy version from the admin page.',
            effectiveDate: 'Effective Date',
            updatedAt: 'Last Updated',
            contractVersion: 'Contract Version',
            policyPreview: 'Policy Preview',
            signingRequired: 'The contract must be signed before payment completion or subscription changes.',
            mobileSteps: 'Quick Steps',
            stepReview: '1. Review contract',
            stepSign: '2. Sign with your name',
            stepContinue: '3. Return to subscription',
        };

    useEffect(() => {
        const load = async () => {
            try {
                const [policyRes, signatureRes] = await Promise.all([
                    api.get('/membership/policy', { params: { locale: policyLocale } }),
                    api.get('/membership/policy/signature/me', { params: { locale: policyLocale } }),
                ]);
                const policyData = policyRes.data?.data;
                if (policyData) {
                    setPolicy({
                        version: policyData.version || POLICY_VERSION,
                        title: policyData.title,
                        effectiveDate: policyData.effectiveDate,
                        updatedAt: policyData.updatedAt,
                        intro: policyData.intro,
                        sections: Array.isArray(policyData.sections) ? policyData.sections : [],
                        footerNote: policyData.footerNote,
                    });
                } else {
                    setPolicy(loadPolicyContent(policyLocale));
                }
                const signatureData = signatureRes.data?.data;
                if (signatureData) {
                    setSignature(signatureData);
                }
            } catch {
                setPolicy(loadPolicyContent(policyLocale));
                if (user?.id) {
                    const raw =
                        localStorage.getItem(getPolicySignatureKey(user.id)) ||
                        localStorage.getItem(getLegacyPolicySignatureKey(user.id)) ||
                        localStorage.getItem(getLocalePolicySignatureKey(user.id, 'en')) ||
                        localStorage.getItem(getLocalePolicySignatureKey(user.id, 'ar'));
                    if (raw) {
                        try {
                            setSignature(JSON.parse(raw) as PolicySignature);
                        } catch {
                            setSignature(null);
                        }
                    }
                }
            }
        };
        void load();
        setSignerName(user?.full_name || '');
    }, [policyLocale, user?.full_name, user?.id]);

    const policyVersion = signature?.version || policy.version || POLICY_VERSION;
    const isSigned = Boolean(signature?.accepted);
    const signatureDate = signature?.signedAt ? new Date(signature.signedAt) : null;
    const validSignatureDate = Boolean(signatureDate && !Number.isNaN(signatureDate.getTime()));

    const handleSign = async () => {
        if (!user?.id || !signerName.trim()) return;
        setIsSigning(true);
        setSignError(null);
        try {
            const signed: PolicySignature = {
                version: policyVersion,
                signedAt: new Date().toISOString(),
                signerName: signerName.trim(),
                accepted: true,
            };
            const response = await api.post('/membership/policy/signature', {
                signerName: signed.signerName,
                accepted: true,
            }, { params: { locale: policyLocale } });
            const signatureData = response.data?.data as PolicySignature | undefined;
            const finalSignature = signatureData || signed;
            localStorage.setItem(getPolicySignatureKey(user.id), JSON.stringify(finalSignature));
            localStorage.setItem(getLegacyPolicySignatureKey(user.id), JSON.stringify(finalSignature));
            localStorage.setItem(getLocalePolicySignatureKey(user.id, policyLocale), JSON.stringify(finalSignature));
            window.dispatchEvent(new Event('gym-policy-signature-updated'));
            setSignature(finalSignature);
            router.replace('/dashboard/subscription');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to sign contract.';
            setSignError(message);
        } finally {
            setIsSigning(false);
        }
    };

    const contentMeta = useMemo(() => ({
        badgeClass: isSigned ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        cardClass: isSigned ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5',
    }), [isSigned]);

    if (!user) return null;

    const mobileSteps = [
        txt.stepReview,
        txt.stepSign,
        txt.stepContinue,
    ];

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-24 sm:pb-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="section-chip mb-2">{txt.policyPreview}</p>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{txt.title}</h1>
                    <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{txt.subtitle}</p>
                </div>
                <div className="flex flex-wrap items-start gap-2 sm:flex-col sm:items-start">
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${contentMeta.badgeClass}`}>
                        <ShieldCheck size={14} />
                        {isSigned ? txt.signed : txt.unsigned}
                    </span>
                    <button
                        type="button"
                        onClick={() => router.push('/dashboard/subscription')}
                        className="btn-ghost"
                    >
                        {txt.continue}
                    </button>
                </div>
            </div>

            <div className={`kpi-card p-6 ${contentMeta.cardClass}`}>
                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-border bg-card/50 p-4">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{txt.contractVersion}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{policyVersion}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card/50 p-4">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{txt.effectiveDate}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                            {formatDate(policy.effectiveDate, { year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card/50 p-4">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{txt.updatedAt}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                            {formatDate(policy.updatedAt, { year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                    </div>
                </div>

                <div className="mt-5 flex items-start gap-3 rounded-xl border border-border bg-background/60 p-4">
                    <Lock size={18} className="mt-0.5 text-primary" />
                    <p className="text-sm text-foreground">{txt.signingRequired}</p>
                </div>

                <div className="mt-4 grid gap-3 rounded-xl border border-border bg-background/60 p-4 sm:grid-cols-3">
                    <div className="sm:col-span-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{txt.mobileSteps}</p>
                    </div>
                    <div className="sm:col-span-2 grid gap-2 sm:grid-cols-3">
                        {mobileSteps.map((step) => (
                            <div key={step} className="rounded-lg border border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
                                {step}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4">
                    <div className="kpi-card p-6">
                        <h2 className="text-lg font-bold text-foreground">{policy.title}</h2>
                        <p className="mt-2 text-sm text-muted-foreground">{policy.intro}</p>
                    </div>

                    {policy.sections.map((section) => (
                        <div key={section.title} className="kpi-card p-6">
                            <h3 className="text-base font-bold text-foreground">{section.title}</h3>
                            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                                {section.points.map((point) => (
                                    <li key={point} className="flex items-start gap-2">
                                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-primary" />
                                        <span>{point}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}

                    <div className="kpi-card p-6">
                        <h3 className="text-base font-bold text-foreground">{txt.adminNote}</h3>
                        <p className="mt-2 text-sm text-muted-foreground">{policy.footerNote}</p>
                    </div>
                </div>

                <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
                    <div className="kpi-card p-6">
                        <div className="flex items-center gap-2">
                            <PenLine size={18} className="text-primary" />
                            <h2 className="text-lg font-bold text-foreground">{txt.signNow}</h2>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{txt.signatureNote}</p>
                        {signError && (
                            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                {signError}
                            </div>
                        )}

                        <div className="mt-5 space-y-4">
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.signerName}</label>
                                <input
                                    type="text"
                                    className="input-dark"
                                    value={signerName}
                                    onChange={(event) => setSignerName(event.target.value)}
                                    disabled={isSigned}
                                />
                            </div>

                            <button
                                type="button"
                                onClick={handleSign}
                                disabled={isSigned || isSigning || !signerName.trim()}
                                className="btn-primary w-full justify-center"
                            >
                                <PenLine size={16} />
                                {isSigned ? txt.signed : txt.signNow}
                            </button>
                        </div>

                        {isSigned && (
                            <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
                                <p className="font-semibold text-emerald-400">{txt.signed}</p>
                                <p className="mt-1 text-muted-foreground">
                                    {signature?.signerName}
                                    {validSignatureDate ? ` - ${formatDate(signatureDate!, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:hidden">
                <div className="mx-auto flex max-w-5xl items-center gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isSigned ? txt.signed : txt.unsigned}</p>
                        <p className="truncate text-sm text-foreground">{isSigned ? txt.signingRequired : txt.signNow}</p>
                    </div>
                    <button
                        type="button"
                        onClick={handleSign}
                        disabled={isSigned || isSigning || !signerName.trim()}
                        className="btn-primary shrink-0"
                    >
                        <PenLine size={16} />
                        {isSigned ? txt.signed : txt.signNow}
                    </button>
                </div>
            </div>
        </div>
    );
}
