'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wrench, Clock3, Plus, RefreshCw, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { useFeedback } from '@/components/FeedbackProvider';
import { BranchSelector } from '@/components/BranchSelector';
import { useBranch } from '@/context/BranchContext';
import { getBranchParams } from '@/lib/branch';

interface MachineItem {
    id: string;
    branch_id?: string | null;
    machine_name: string;
    accessories_summary?: string | null;
    condition_notes?: string | null;
    maintenance_notes?: string | null;
    is_active: boolean;
    updated_at?: string | null;
}

interface SectionItem {
    id: string;
    branch_id?: string | null;
    section_key: string;
    title: string;
    body: string;
    sort_order: number;
    is_active: boolean;
    updated_at?: string | null;
}

const EMPTY_MACHINE = {
    machine_name: '',
    accessories_summary: '',
    condition_notes: '',
    maintenance_notes: '',
    is_active: true,
};

const EMPTY_SECTION = {
    section_key: '',
    title: '',
    body: '',
    sort_order: '0',
    is_active: true,
};

export default function FacilityAdminPage() {
    const { user } = useAuth();
    const { locale, formatDate } = useLocale();
    const { showToast } = useFeedback();
    const { branches, selectedBranchId, setSelectedBranchId } = useBranch();
    const [machines, setMachines] = useState<MachineItem[]>([]);
    const [sections, setSections] = useState<SectionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSavingMachine, setIsSavingMachine] = useState(false);
    const [isSavingSection, setIsSavingSection] = useState(false);
    const [machineForm, setMachineForm] = useState(EMPTY_MACHINE);
    const [sectionForm, setSectionForm] = useState(EMPTY_SECTION);

    const txt = useMemo(() => locale === 'ar'
        ? {
            title: 'المرافق والأجهزة',
            subtitle: 'أدخل ملحقات الأجهزة، وملاحظات الحالة، وساعات العمل أو الأقسام المهمة.',
            refresh: 'تحديث',
            branch: 'الفرع',
            machines: 'الأجهزة',
            sections: 'ساعات / Uptime',
            addMachine: 'إضافة جهاز',
            addSection: 'إضافة قسم',
            name: 'الاسم',
            accessories: 'الملحقات',
            condition: 'الحالة',
            maintenance: 'الصيانة',
            saveMachine: 'حفظ الجهاز',
            saveSection: 'حفظ القسم',
            active: 'نشط',
            inactive: 'غير نشط',
            key: 'المفتاح',
            sectionTitle: 'العنوان',
            body: 'النص',
            sortOrder: 'الترتيب',
            loading: 'جارٍ التحميل...',
            noMachines: 'لا توجد أجهزة بعد.',
            noSections: 'لا توجد أقسام بعد.',
        }
        : {
            title: 'Facilities & Machines',
            subtitle: 'Capture machine accessories, condition notes, and opening/hourly uptime sections.',
            refresh: 'Refresh',
            branch: 'Branch',
            machines: 'Machines',
            sections: 'Hours / Uptime',
            addMachine: 'Add Machine',
            addSection: 'Add Section',
            name: 'Name',
            accessories: 'Accessories',
            condition: 'Condition',
            maintenance: 'Maintenance',
            saveMachine: 'Save Machine',
            saveSection: 'Save Section',
            active: 'Active',
            inactive: 'Inactive',
            key: 'Key',
            sectionTitle: 'Title',
            body: 'Body',
            sortOrder: 'Sort Order',
            loading: 'Loading...',
            noMachines: 'No machines yet.',
            noSections: 'No sections yet.',
        }, [locale]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const params = getBranchParams(selectedBranchId);
            const [machinesRes, sectionsRes] = await Promise.all([
                api.get('/facility/machines', { params }),
                api.get('/facility/sections', { params }),
            ]);
            setMachines(machinesRes.data?.data || []);
            setSections(sectionsRes.data?.data || []);
        } catch {
            showToast(locale === 'ar' ? 'فشل في تحميل بيانات المرافق.' : 'Failed to load facility data.', 'error');
        } finally {
            setLoading(false);
        }
    }, [locale, selectedBranchId, showToast]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const saveMachine = async () => {
        if (!machineForm.machine_name.trim()) return;
        if (!selectedBranchId || selectedBranchId === 'all') {
            showToast(locale === 'ar' ? 'اختر فرعاً قبل إضافة الجهاز.' : 'Select a branch before adding a machine.', 'error');
            return;
        }
        setIsSavingMachine(true);
        try {
            await api.post('/facility/machines', {
                machine_name: machineForm.machine_name.trim(),
                accessories_summary: machineForm.accessories_summary.trim() || null,
                condition_notes: machineForm.condition_notes.trim() || null,
                maintenance_notes: machineForm.maintenance_notes.trim() || null,
                is_active: machineForm.is_active,
            }, { params: getBranchParams(selectedBranchId) });
            setMachineForm(EMPTY_MACHINE);
            await loadData();
        } catch {
            showToast(locale === 'ar' ? 'فشل في حفظ الجهاز.' : 'Failed to save machine.', 'error');
        } finally {
            setIsSavingMachine(false);
        }
    };

    const saveSection = async () => {
        if (!sectionForm.section_key.trim() || !sectionForm.title.trim() || !sectionForm.body.trim()) return;
        if (!selectedBranchId || selectedBranchId === 'all') {
            showToast(locale === 'ar' ? 'اختر فرعاً قبل إضافة القسم.' : 'Select a branch before adding a section.', 'error');
            return;
        }
        setIsSavingSection(true);
        try {
            await api.post('/facility/sections', {
                section_key: sectionForm.section_key.trim(),
                title: sectionForm.title.trim(),
                body: sectionForm.body.trim(),
                sort_order: Number(sectionForm.sort_order || 0),
                is_active: sectionForm.is_active,
            }, { params: getBranchParams(selectedBranchId) });
            setSectionForm(EMPTY_SECTION);
            await loadData();
        } catch {
            showToast(locale === 'ar' ? 'فشل في حفظ القسم.' : 'Failed to save section.', 'error');
        } finally {
            setIsSavingSection(false);
        }
    };

    if (!user) return null;

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="section-chip mb-2">{txt.sections}</p>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{txt.title}</h1>
                    <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{txt.subtitle}</p>
                </div>
                <div className="flex items-center gap-2">
                    <BranchSelector branches={branches} selectedBranchId={selectedBranchId} onSelect={setSelectedBranchId} />
                    <button type="button" onClick={() => void loadData()} className="btn-secondary">
                        <RefreshCw size={16} />
                        {txt.refresh}
                    </button>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="kpi-card p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <Wrench size={16} className="text-primary" />
                        <h2 className="text-lg font-bold text-foreground">{txt.machines}</h2>
                    </div>
                    <div className="space-y-3">
                        {machines.length ? machines.map((machine) => (
                            <div key={machine.id} className="rounded-xl border border-border bg-card/50 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">{machine.machine_name}</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {machine.accessories_summary || '-'}
                                        </p>
                                    </div>
                                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${machine.is_active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-border bg-muted/30 text-muted-foreground'}`}>
                                        {machine.is_active ? txt.active : txt.inactive}
                                    </span>
                                </div>
                                {(machine.condition_notes || machine.maintenance_notes) && (
                                    <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                                        {machine.condition_notes && <p>{machine.condition_notes}</p>}
                                        {machine.maintenance_notes && <p>{machine.maintenance_notes}</p>}
                                    </div>
                                )}
                                {machine.updated_at && (
                                    <p className="mt-2 text-[11px] text-muted-foreground">
                                        {formatDate(machine.updated_at, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                )}
                            </div>
                        )) : (
                            <p className="text-sm text-muted-foreground">{loading ? txt.loading : txt.noMachines}</p>
                        )}
                    </div>

                    <div className="rounded-xl border border-border bg-background/60 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <Plus size={14} className="text-primary" />
                            <h3 className="text-sm font-semibold text-foreground">{txt.addMachine}</h3>
                        </div>
                        <input className="input-dark" placeholder={txt.name} value={machineForm.machine_name} onChange={(e) => setMachineForm((current) => ({ ...current, machine_name: e.target.value }))} />
                        <textarea className="input-dark min-h-24" placeholder={txt.accessories} value={machineForm.accessories_summary} onChange={(e) => setMachineForm((current) => ({ ...current, accessories_summary: e.target.value }))} />
                        <textarea className="input-dark min-h-24" placeholder={txt.condition} value={machineForm.condition_notes} onChange={(e) => setMachineForm((current) => ({ ...current, condition_notes: e.target.value }))} />
                        <textarea className="input-dark min-h-24" placeholder={txt.maintenance} value={machineForm.maintenance_notes} onChange={(e) => setMachineForm((current) => ({ ...current, maintenance_notes: e.target.value }))} />
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input type="checkbox" checked={machineForm.is_active} onChange={(e) => setMachineForm((current) => ({ ...current, is_active: e.target.checked }))} />
                            {txt.active}
                        </label>
                        <button type="button" onClick={() => void saveMachine()} disabled={isSavingMachine} className="btn-primary w-full justify-center">
                            <Save size={16} />
                            {isSavingMachine ? (locale === 'ar' ? 'جارٍ الحفظ...' : 'Saving...') : txt.saveMachine}
                        </button>
                    </div>
                </div>

                <div className="kpi-card p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <Clock3 size={16} className="text-primary" />
                        <h2 className="text-lg font-bold text-foreground">{txt.sections}</h2>
                    </div>
                    <div className="space-y-3">
                        {sections.length ? sections.map((section) => (
                            <div key={section.id} className="rounded-xl border border-border bg-card/50 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs uppercase tracking-wider text-muted-foreground">{section.section_key}</p>
                                        <h3 className="mt-1 text-sm font-semibold text-foreground">{section.title}</h3>
                                    </div>
                                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${section.is_active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-border bg-muted/30 text-muted-foreground'}`}>
                                        {section.is_active ? txt.active : txt.inactive}
                                    </span>
                                </div>
                                <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">{section.body}</p>
                                <p className="mt-2 text-[11px] text-muted-foreground">#{section.sort_order}</p>
                                {section.updated_at && (
                                    <p className="mt-2 text-[11px] text-muted-foreground">
                                        {formatDate(section.updated_at, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                )}
                            </div>
                        )) : (
                            <p className="text-sm text-muted-foreground">{loading ? txt.loading : txt.noSections}</p>
                        )}
                    </div>

                    <div className="rounded-xl border border-border bg-background/60 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <Plus size={14} className="text-primary" />
                            <h3 className="text-sm font-semibold text-foreground">{txt.addSection}</h3>
                        </div>
                        <input className="input-dark" placeholder={txt.key} value={sectionForm.section_key} onChange={(e) => setSectionForm((current) => ({ ...current, section_key: e.target.value }))} />
                        <input className="input-dark" placeholder={txt.sectionTitle} value={sectionForm.title} onChange={(e) => setSectionForm((current) => ({ ...current, title: e.target.value }))} />
                        <textarea className="input-dark min-h-28" placeholder={txt.body} value={sectionForm.body} onChange={(e) => setSectionForm((current) => ({ ...current, body: e.target.value }))} />
                        <input className="input-dark" type="number" placeholder={txt.sortOrder} value={sectionForm.sort_order} onChange={(e) => setSectionForm((current) => ({ ...current, sort_order: e.target.value }))} />
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input type="checkbox" checked={sectionForm.is_active} onChange={(e) => setSectionForm((current) => ({ ...current, is_active: e.target.checked }))} />
                            {txt.active}
                        </label>
                        <button type="button" onClick={() => void saveSection()} disabled={isSavingSection} className="btn-primary w-full justify-center">
                            <Save size={16} />
                            {isSavingSection ? (locale === 'ar' ? 'جارٍ الحفظ...' : 'Saving...') : txt.saveSection}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
