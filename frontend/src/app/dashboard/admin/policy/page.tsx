'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import {
    DEFAULT_POLICY_CONTENT,
    POLICY_VERSION,
    PolicyContent,
    PolicyLocale,
    loadPolicyContent,
    savePolicyContent,
} from '@/lib/gymPolicy';
import { BRANCH_ADMIN_ROLES } from '@/lib/roles';

const asPolicyLocale = (locale: string): PolicyLocale => (locale === 'ar' ? 'ar' : 'en');

export default function AdminPolicyPage() {
    const { user } = useAuth();
    const { locale, formatDate } = useLocale();
    const [editorLocale, setEditorLocale] = useState<PolicyLocale>(asPolicyLocale(locale));
    const [draft, setDraft] = useState<PolicyContent>(DEFAULT_POLICY_CONTENT[editorLocale]);
    const [isSaving, setIsSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<string | null>(null);

    const txt = locale === 'ar'
        ? {
            title: 'إدارة سياسة النادي',
            subtitle: 'عدّل نسخة السياسة الحالية لكل لغة ثم احفظها.',
            localeLabel: 'اللغة',
            english: 'English',
            arabic: 'العربية',
            version: 'الإصدار',
            effectiveDate: 'تاريخ السريان',
            updatedAt: 'آخر تحديث',
            titleField: 'العنوان',
            introField: 'المقدمة',
            footerField: 'ملاحظة ختامية',
            sectionsField: 'الأقسام',
            addSection: 'إضافة قسم',
            addPoint: 'إضافة نقطة',
            save: 'حفظ السياسة',
            saving: 'جارٍ الحفظ...',
            preview: 'معاينة',
        }
        : {
            title: 'Gym Policy Management',
            subtitle: 'Edit the current policy copy per language and save it for the member contract flow.',
            localeLabel: 'Language',
            english: 'English',
            arabic: 'Arabic',
            version: 'Version',
            effectiveDate: 'Effective Date',
            updatedAt: 'Updated At',
            titleField: 'Title',
            introField: 'Intro',
            footerField: 'Footer Note',
            sectionsField: 'Sections',
            addSection: 'Add Section',
            addPoint: 'Add Point',
            save: 'Save Policy',
            saving: 'Saving...',
            preview: 'Preview',
        };

    useEffect(() => {
        const load = async () => {
            try {
                const response = await api.get('/membership/policy', { params: { locale: editorLocale } });
                const payload = response.data?.data;
                if (payload) {
                    setDraft({
                        title: payload.title,
                        effectiveDate: payload.effectiveDate,
                        updatedAt: payload.updatedAt,
                        intro: payload.intro,
                        sections: Array.isArray(payload.sections) ? payload.sections : [],
                        footerNote: payload.footerNote,
                    });
                    return;
                }
            } catch {
                // Fall back to local copy below.
            }
            setDraft(loadPolicyContent(editorLocale));
        };
        void load();
    }, [editorLocale]);

    const canEdit = Boolean(user && [...BRANCH_ADMIN_ROLES, 'SUPER_ADMIN'].includes(user.role));
    const contentSummary = useMemo(() => ({
        sectionCount: draft.sections.length,
        pointCount: draft.sections.reduce((sum, section) => sum + section.points.length, 0),
    }), [draft.sections]);

    if (!user || !canEdit) {
        return (
            <div className="max-w-3xl mx-auto rounded-2xl border border-border bg-card p-6 text-center">
                <ShieldCheck size={28} className="mx-auto text-destructive" />
                <h1 className="mt-3 text-xl font-bold text-foreground">
                    {locale === 'ar' ? 'هذه الصفحة للمشرفين فقط' : 'Admin access required'}
                </h1>
            </div>
        );
    }

    const updateSection = (sectionIndex: number, value: string) => {
        setDraft((current) => {
            const nextSections = [...current.sections];
            const section = { ...nextSections[sectionIndex] };
            section.title = value;
            nextSections[sectionIndex] = section;
            return { ...current, sections: nextSections };
        });
    };

    const updatePoint = (sectionIndex: number, pointIndex: number, value: string) => {
        setDraft((current) => {
            const nextSections = [...current.sections];
            const section = { ...nextSections[sectionIndex] };
            section.points = [...section.points];
            section.points[pointIndex] = value;
            nextSections[sectionIndex] = section;
            return { ...current, sections: nextSections };
        });
    };

    const addSection = () => {
        setDraft((current) => ({
            ...current,
            sections: [...current.sections, { title: locale === 'ar' ? 'قسم جديد' : 'New Section', points: [locale === 'ar' ? 'نقطة جديدة' : 'New bullet point'] }],
        }));
    };

    const addPoint = (sectionIndex: number) => {
        setDraft((current) => {
            const nextSections = [...current.sections];
            const section = { ...nextSections[sectionIndex] };
            section.points = [...section.points, locale === 'ar' ? 'نقطة جديدة' : 'New bullet point'];
            nextSections[sectionIndex] = section;
            return { ...current, sections: nextSections };
        });
    };

    const removeSection = (sectionIndex: number) => {
        setDraft((current) => ({
            ...current,
            sections: current.sections.filter((_, index) => index !== sectionIndex),
        }));
    };

    const removePoint = (sectionIndex: number, pointIndex: number) => {
        setDraft((current) => {
            const nextSections = [...current.sections];
            const section = { ...nextSections[sectionIndex] };
            section.points = section.points.filter((_, index) => index !== pointIndex);
            nextSections[sectionIndex] = section;
            return { ...current, sections: nextSections };
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const nextDraft: PolicyContent = {
                ...draft,
                updatedAt: new Date().toISOString(),
            };
            const response = await api.put('/membership/policy', nextDraft, { params: { locale: editorLocale } });
            const payload = response.data?.data;
            const finalDraft = payload
                ? {
                    title: payload.title,
                    effectiveDate: payload.effectiveDate,
                    updatedAt: payload.updatedAt,
                    intro: payload.intro,
                    sections: Array.isArray(payload.sections) ? payload.sections : [],
                    footerNote: payload.footerNote,
                }
                : nextDraft;
            savePolicyContent(editorLocale, finalDraft);
            setDraft(finalDraft);
            setSavedAt(finalDraft.updatedAt);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="section-chip mb-2">{txt.version} {POLICY_VERSION}</p>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{txt.title}</h1>
                    <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{txt.subtitle}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setEditorLocale('en')}
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold ${editorLocale === 'en' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                    >
                        {txt.english}
                    </button>
                    <button
                        type="button"
                        onClick={() => setEditorLocale('ar')}
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold ${editorLocale === 'ar' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                    >
                        {txt.arabic}
                    </button>
                    <button type="button" onClick={handleSave} disabled={isSaving} className="btn-primary">
                        <Save size={16} />
                        {isSaving ? txt.saving : txt.save}
                    </button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="kpi-card p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{txt.localeLabel}</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{editorLocale === 'ar' ? txt.arabic : txt.english}</p>
                </div>
                <div className="kpi-card p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{txt.effectiveDate}</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                        {formatDate(draft.effectiveDate, { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                </div>
                <div className="kpi-card p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{txt.updatedAt}</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                        {savedAt ? formatDate(savedAt, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : formatDate(draft.updatedAt, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
                <div className="space-y-4">
                    <div className="kpi-card p-6 space-y-4">
                        <div className="grid gap-4">
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.titleField}</label>
                                <input
                                    type="text"
                                    className="input-dark"
                                    value={draft.title}
                                    onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.introField}</label>
                                <textarea
                                    className="input-dark min-h-28"
                                    value={draft.intro}
                                    onChange={(event) => setDraft((current) => ({ ...current, intro: event.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.footerField}</label>
                                <textarea
                                    className="input-dark min-h-24"
                                    value={draft.footerNote}
                                    onChange={(event) => setDraft((current) => ({ ...current, footerNote: event.target.value }))}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <p className="section-chip">{txt.sectionsField} ({contentSummary.sectionCount}, {contentSummary.pointCount})</p>
                        <button type="button" onClick={addSection} className="btn-secondary">
                            <Plus size={16} />
                            {txt.addSection}
                        </button>
                    </div>

                    <div className="space-y-4">
                        {draft.sections.map((section, sectionIndex) => (
                            <div key={`${section.title}-${sectionIndex}`} className="kpi-card p-6 space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1">
                                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.titleField}</label>
                                            <input
                                                type="text"
                                                className="input-dark"
                                                value={section.title}
                                                onChange={(event) => updateSection(sectionIndex, event.target.value)}
                                            />
                                    </div>
                                    <button type="button" onClick={() => removeSection(sectionIndex)} className="btn-ghost !px-2 !py-2 text-destructive">
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {section.points.map((point, pointIndex) => (
                                        <div key={`${sectionIndex}-${pointIndex}`} className="flex items-start gap-2">
                                            <CheckCircle2 size={16} className="mt-3 text-primary shrink-0" />
                                            <textarea
                                                className="input-dark min-h-16 flex-1"
                                                value={point}
                                                onChange={(event) => updatePoint(sectionIndex, pointIndex, event.target.value)}
                                            />
                                            <button type="button" onClick={() => removePoint(sectionIndex, pointIndex)} className="btn-ghost !px-2 !py-2 text-destructive">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <button type="button" onClick={() => addPoint(sectionIndex)} className="btn-ghost">
                                    <Plus size={16} />
                                    {txt.addPoint}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="kpi-card p-6">
                        <div className="flex items-center gap-2">
                            <ShieldCheck size={18} className="text-primary" />
                            <h2 className="text-lg font-bold text-foreground">{txt.preview}</h2>
                        </div>
                        <div className="mt-4 space-y-4">
                            <div>
                                <p className="text-xs uppercase tracking-wider text-muted-foreground">{draft.title}</p>
                                <p className="mt-2 text-sm text-muted-foreground">{draft.intro}</p>
                            </div>
                            {draft.sections.slice(0, 4).map((section) => (
                                <div key={section.title} className="rounded-xl border border-border bg-background/60 p-4">
                                    <p className="font-semibold text-foreground">{section.title}</p>
                                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                                        {section.points.slice(0, 3).map((point) => (
                                            <li key={point}>- {point}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
