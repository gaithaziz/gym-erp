'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Wrench, Plus, RefreshCw, Save, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { useFeedback } from '@/components/FeedbackProvider';
import { BranchSelector } from '@/components/BranchSelector';
import { useBranch } from '@/context/BranchContext';
import { getBranchParams } from '@/lib/branch';

interface AssetItem {
    id: string;
    branch_id?: string | null;
    name: string;
    asset_type: 'MACHINE' | 'FACILITY' | 'ACCESSORY';
    status: 'GOOD' | 'NEED_MAINTENANCE' | 'FIXED';
    fix_expense_amount?: number | null;
    fix_expense_transaction_id?: string | null;
    note?: string | null;
    is_active: boolean;
    updated_at?: string | null;
}

type AssetTypeFilter = 'ALL' | AssetItem['asset_type'];

const EMPTY_ASSET = {
    name: '',
    asset_type: 'MACHINE' as AssetItem['asset_type'],
    status: 'GOOD' as AssetItem['status'],
    fix_expense_amount: '',
    note: '',
    is_active: true,
};

export default function FacilityAdminPage() {
    const { user } = useAuth();
    const { locale, formatDate } = useLocale();
    const { showToast } = useFeedback();
    const { branches, selectedBranchId, setSelectedBranchId } = useBranch();
    const [assets, setAssets] = useState<AssetItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSavingAsset, setIsSavingAsset] = useState(false);
    const [assetForm, setAssetForm] = useState(EMPTY_ASSET);
    const [assetTypeFilter, setAssetTypeFilter] = useState<AssetTypeFilter>('ALL');
    const [editingAssetId, setEditingAssetId] = useState<string | null>(null);

    const txt = useMemo(() => locale === 'ar'
        ? {
            title: 'المرافق والأجهزة',
            subtitle: 'أدخل الأجهزة والمرافق والملحقات مع الحالة وتكلفة الإصلاح، ثم تُسجّل المصروفات تلقائياً.',
            refresh: 'تحديث',
            branch: 'الفرع',
            assets: 'الأصول',
            addAsset: 'إضافة أصل',
            name: 'الاسم',
            type: 'النوع',
            status: 'الحالة',
            fixExpense: 'تكلفة الإصلاح',
            note: 'ملاحظات',
            saveAsset: 'حفظ الأصل',
            active: 'نشط',
            inactive: 'غير نشط',
            all: 'الكل',
            machine: 'جهاز',
            facility: 'مرفق',
            accessory: 'ملحق',
            good: 'جيد',
            needMaintenance: 'يحتاج صيانة',
            fixed: 'تم الإصلاح',
            edit: 'تعديل',
            update: 'تحديث',
            cancel: 'إلغاء',
            expensePosted: 'تم ترحيل المصروف',
            loading: 'جارٍ التحميل...',
            noAssets: 'لا توجد أصول بعد.',
            expenseHint: 'إذا كانت الحالة "تم الإصلاح" وتم إدخال تكلفة، سيُضاف المصروف تلقائياً إلى المالية.',
            addedOrUpdated: 'تاريخ الإضافة / التحديث',
        }
        : {
            title: 'Facilities & Machines',
            subtitle: 'Track machines, facilities, and accessories with status and repair cost so the expense posts automatically.',
            refresh: 'Refresh',
            branch: 'Branch',
            assets: 'Assets',
            addAsset: 'Add Asset',
            name: 'Name',
            type: 'Type',
            status: 'Status',
            fixExpense: 'Fix expense',
            note: 'Note',
            saveAsset: 'Save Asset',
            active: 'Active',
            inactive: 'Inactive',
            all: 'All',
            machine: 'Machine',
            facility: 'Facility',
            accessory: 'Accessory',
            good: 'Good',
            needMaintenance: 'Need maintenance',
            fixed: 'Fixed',
            edit: 'Edit',
            update: 'Update',
            cancel: 'Cancel',
            expensePosted: 'Expense posted',
            loading: 'Loading...',
            noAssets: 'No assets yet.',
            expenseHint: 'If status is Fixed and a cost is entered, the expense will be posted automatically.',
            addedOrUpdated: 'Added / updated',
        }, [locale]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                ...getBranchParams(selectedBranchId),
                ...(assetTypeFilter === 'ALL' ? {} : { asset_type: assetTypeFilter }),
            };
            const response = await api.get('/facility/assets', { params });
            setAssets(response.data?.data || []);
        } catch {
            showToast(locale === 'ar' ? 'فشل في تحميل بيانات المرافق.' : 'Failed to load facility data.', 'error');
        } finally {
            setLoading(false);
        }
    }, [assetTypeFilter, locale, selectedBranchId, showToast]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const saveAsset = async () => {
        if (!assetForm.name.trim()) return;
        if (!selectedBranchId || selectedBranchId === 'all') {
            showToast(locale === 'ar' ? 'اختر فرعاً قبل إضافة الأصل.' : 'Select a branch before adding an asset.', 'error');
            return;
        }
        setIsSavingAsset(true);
        try {
            const payload = {
                name: assetForm.name.trim(),
                asset_type: assetForm.asset_type,
                status: assetForm.status,
                fix_expense_amount: assetForm.fix_expense_amount.trim() ? Number(assetForm.fix_expense_amount) : null,
                note: assetForm.note.trim() || null,
                is_active: assetForm.is_active,
            };
            if (editingAssetId) {
                await api.patch(`/facility/assets/${editingAssetId}`, payload);
            } else {
                await api.post('/facility/assets', payload, { params: getBranchParams(selectedBranchId) });
            }
            if (typeof window !== 'undefined') {
                const notice = JSON.stringify({
                    branchId: selectedBranchId,
                    assetName: assetForm.name.trim(),
                    assetType: assetForm.asset_type,
                    amount: assetForm.fix_expense_amount.trim() || null,
                    at: new Date().toISOString(),
                });
                sessionStorage.setItem('pending_finance_asset_notice', notice);
                localStorage.setItem('pending_finance_asset_notice', notice);
            }
            setAssetForm(EMPTY_ASSET);
            setEditingAssetId(null);
            await loadData();
        } catch {
            showToast(locale === 'ar' ? 'فشل في حفظ الأصل.' : 'Failed to save asset.', 'error');
        } finally {
            setIsSavingAsset(false);
        }
    };

    const startEditingAsset = (asset: AssetItem) => {
        setEditingAssetId(asset.id);
        setAssetForm({
            name: asset.name,
            asset_type: asset.asset_type,
            status: asset.status,
            fix_expense_amount: asset.fix_expense_amount != null ? String(asset.fix_expense_amount) : '',
            note: asset.note || '',
            is_active: asset.is_active,
        });
    };

    const cancelEditing = () => {
        setEditingAssetId(null);
        setAssetForm(EMPTY_ASSET);
    };

    if (!user) return null;

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="section-chip mb-2">{txt.assets}</p>
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

            <div className="kpi-card p-4 flex flex-wrap gap-2">
                {(['ALL', 'MACHINE', 'FACILITY', 'ACCESSORY'] as const).map((value) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => setAssetTypeFilter(value)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                            assetTypeFilter === value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {value === 'ALL' ? txt.all : value === 'MACHINE' ? txt.machine : value === 'FACILITY' ? txt.facility : txt.accessory}
                    </button>
                ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="kpi-card p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <Wrench size={16} className="text-primary" />
                        <h2 className="text-lg font-bold text-foreground">{txt.assets}</h2>
                    </div>
                    <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
                        {assets.length ? assets.map((asset) => (
                            <div key={asset.id} className="rounded-xl border border-border bg-card/50 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-semibold text-foreground">{asset.name}</p>
                                            <span className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                {asset.asset_type === 'MACHINE' ? txt.machine : asset.asset_type === 'FACILITY' ? txt.facility : txt.accessory}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {asset.note || '-'}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${asset.status === 'GOOD' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : asset.status === 'FIXED' ? 'border-blue-500/30 bg-blue-500/10 text-blue-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                                            {asset.status === 'GOOD' ? txt.good : asset.status === 'FIXED' ? txt.fixed : txt.needMaintenance}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => startEditingAsset(asset)}
                                            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                                        >
                                            <Pencil size={11} />
                                            {txt.edit}
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                                    <p>{asset.is_active ? txt.active : txt.inactive}</p>
                                    <p>
                                        {asset.fix_expense_amount != null
                                            ? `${locale === 'ar' ? 'تكلفة الإصلاح' : 'Fix expense'}: ${asset.fix_expense_amount}`
                                            : (locale === 'ar' ? 'لا توجد تكلفة إصلاح' : 'No fix expense')}
                                    </p>
                                </div>
                                {asset.fix_expense_transaction_id && (
                                    <p className="mt-2 text-[11px] text-emerald-400">
                                        {txt.expensePosted}
                                    </p>
                                )}
                                {asset.updated_at && (
                                    <p className="mt-2 text-[11px] text-muted-foreground">
                                        {txt.addedOrUpdated}: {formatDate(asset.updated_at, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                )}
                            </div>
                        )) : (
                            <p className="text-sm text-muted-foreground">{loading ? txt.loading : txt.noAssets}</p>
                        )}
                    </div>
                </div>

                <div className="kpi-card p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <Plus size={16} className="text-primary" />
                        <h2 className="text-lg font-bold text-foreground">{editingAssetId ? txt.edit : txt.addAsset}</h2>
                    </div>
                    <p className="text-xs text-muted-foreground">{txt.expenseHint}</p>
                    <input className="input-dark" placeholder={txt.name} value={assetForm.name} onChange={(e) => setAssetForm((current) => ({ ...current, name: e.target.value }))} />
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.type}</label>
                            <select className="input-dark" value={assetForm.asset_type} onChange={(e) => setAssetForm((current) => ({ ...current, asset_type: e.target.value as AssetItem['asset_type'] }))}>
                                <option value="MACHINE">{txt.machine}</option>
                                <option value="FACILITY">{txt.facility}</option>
                                <option value="ACCESSORY">{txt.accessory}</option>
                            </select>
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.status}</label>
                            <select className="input-dark" value={assetForm.status} onChange={(e) => setAssetForm((current) => ({ ...current, status: e.target.value as AssetItem['status'] }))}>
                                <option value="GOOD">{txt.good}</option>
                                <option value="NEED_MAINTENANCE">{txt.needMaintenance}</option>
                                <option value="FIXED">{txt.fixed}</option>
                            </select>
                        </div>
                    </div>
                    <input
                        className="input-dark"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={txt.fixExpense}
                        value={assetForm.fix_expense_amount}
                        onChange={(e) => setAssetForm((current) => ({ ...current, fix_expense_amount: e.target.value }))}
                    />
                    <textarea className="input-dark min-h-28" placeholder={txt.note} value={assetForm.note} onChange={(e) => setAssetForm((current) => ({ ...current, note: e.target.value }))} />
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input type="checkbox" checked={assetForm.is_active} onChange={(e) => setAssetForm((current) => ({ ...current, is_active: e.target.checked }))} />
                        {txt.active}
                    </label>
                    <div className="flex gap-2">
                        {editingAssetId && (
                            <button type="button" onClick={cancelEditing} className="btn-secondary w-full justify-center">
                                <X size={16} />
                                {txt.cancel}
                            </button>
                        )}
                        <button type="button" onClick={() => void saveAsset()} disabled={isSavingAsset} className="btn-primary w-full justify-center">
                            <Save size={16} />
                            {isSavingAsset ? (locale === 'ar' ? 'جارٍ الحفظ...' : 'Saving...') : editingAssetId ? txt.update : txt.saveAsset}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
