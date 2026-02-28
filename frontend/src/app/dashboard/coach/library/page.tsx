'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useFeedback } from '@/components/FeedbackProvider';
import Modal from '@/components/Modal';
import { Plus, Pencil, Trash2, Utensils, Dumbbell, Save } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';

type LibraryScope = 'all' | 'global' | 'mine';
type ActiveTab = 'WORKOUT' | 'DIET';

interface WorkoutLibraryItem {
    id: string;
    name: string;
    category?: string | null;
    muscle_group?: string | null;
    equipment?: string | null;
    tags: string[];
    default_video_url?: string | null;
    is_global: boolean;
    owner_coach_id?: string | null;
}

interface DietLibraryItem {
    id: string;
    name: string;
    description?: string | null;
    content: string;
    is_global: boolean;
    owner_coach_id?: string | null;
    created_at: string;
    updated_at: string;
}

const emptyWorkoutForm = {
    id: '',
    name: '',
    category: '',
    muscle_group: '',
    equipment: '',
    tags: '',
    default_video_url: '',
    is_global: false,
};

const emptyDietForm = {
    id: '',
    name: '',
    description: '',
    content: '',
    is_global: false,
};

export default function WorkoutDietLibraryPage() {
    const { locale } = useLocale();
    const { user } = useAuth();
    const { showToast, confirm: confirmAction } = useFeedback();
    const txt = locale === 'ar' ? {
        title: 'مكتبة التمارين والتغذية',
        subtitle: 'قوالب قابلة لإعادة الاستخدام للمدربين والإدارة',
        addItem: 'إضافة عنصر',
        workoutLibrary: 'مكتبة التمارين',
        dietLibrary: 'مكتبة التغذية',
        searchPlaceholder: 'ابحث في المكتبة...',
        itemsCount: 'عنصر',
        noMetadata: 'لا توجد بيانات إضافية',
        global: 'عام',
        mine: 'خاص بي',
        tags: 'الوسوم:',
        edit: 'تعديل',
        delete: 'حذف',
        noWorkoutItems: 'لم يتم العثور على عناصر في مكتبة التمارين.',
        noDietItems: 'لم يتم العثور على عناصر في مكتبة التغذية.',
        noDescription: 'بدون وصف',
        toPlan: 'إلى خطة',
        editWorkoutTitle: 'تعديل عنصر مكتبة التمارين',
        addWorkoutTitle: 'إضافة عنصر إلى مكتبة التمارين',
        namePlaceholder: 'الاسم',
        categoryPlaceholder: 'الفئة',
        muscleGroupPlaceholder: 'المجموعة العضلية',
        equipmentPlaceholder: 'المعدات',
        tagsPlaceholder: 'وسوم (مفصولة بفواصل)',
        defaultVideoPlaceholder: 'رابط الفيديو الافتراضي (اختياري)',
        makeGlobal: 'اجعل هذا عامًا',
        cancel: 'إلغاء',
        save: 'حفظ',
        editDietTitle: 'تعديل عنصر مكتبة التغذية',
        addDietTitle: 'إضافة عنصر إلى مكتبة التغذية',
        descriptionPlaceholder: 'الوصف',
        contentPlaceholder: 'محتوى التغذية',
        infoText: 'استخدم هذه الصفحة لإضافة عناصر مكتبة التمارين والتغذية وتعديلها وتنظيمها، ثم اخترها عند إنشاء الخطط.',
        allScope: 'الكل',
        globalScope: 'عام',
        mineScope: 'خاص بي',
        loadFailed: 'فشل تحميل عناصر المكتبة.',
        workoutSaved: 'تم حفظ عنصر مكتبة التمارين.',
        workoutSaveFailed: 'فشل حفظ عنصر مكتبة التمارين.',
        dietSaved: 'تم حفظ عنصر مكتبة التغذية.',
        dietSaveFailed: 'فشل حفظ عنصر مكتبة التغذية.',
        deleteWorkoutTitle: 'حذف عنصر مكتبة التمارين',
        deleteWorkoutDescription: 'هل تريد حذف عنصر مكتبة التمارين هذا؟',
        deleteDietTitle: 'حذف عنصر مكتبة التغذية',
        deleteDietDescription: 'هل تريد حذف عنصر مكتبة التغذية هذا؟',
        workoutDeleted: 'تم حذف عنصر مكتبة التمارين.',
        workoutDeleteFailed: 'فشل حذف عنصر مكتبة التمارين.',
        dietDeleted: 'تم حذف عنصر مكتبة التغذية.',
        dietDeleteFailed: 'فشل حذف عنصر مكتبة التغذية.',
        toPlanSuccess: 'تم إنشاء خطة غذائية من القالب.',
        toPlanFailed: 'فشل إنشاء خطة غذائية من القالب.',
    } : {
        title: 'Workout & Diet Library',
        subtitle: 'Reusable templates for coaches and admins',
        addItem: 'Add Item',
        workoutLibrary: 'Workout Library',
        dietLibrary: 'Diet Library',
        searchPlaceholder: 'Search library...',
        itemsCount: 'item(s)',
        noMetadata: 'No metadata',
        global: 'GLOBAL',
        mine: 'MINE',
        tags: 'Tags:',
        edit: 'Edit',
        delete: 'Delete',
        noWorkoutItems: 'No workout library items found.',
        noDietItems: 'No diet library items found.',
        noDescription: 'No description',
        toPlan: 'To Plan',
        editWorkoutTitle: 'Edit Workout Library Item',
        addWorkoutTitle: 'Add Workout Library Item',
        namePlaceholder: 'Name',
        categoryPlaceholder: 'Category',
        muscleGroupPlaceholder: 'Muscle Group',
        equipmentPlaceholder: 'Equipment',
        tagsPlaceholder: 'Tags (comma separated)',
        defaultVideoPlaceholder: 'Default video URL (optional)',
        makeGlobal: 'Make this global',
        cancel: 'Cancel',
        save: 'Save',
        editDietTitle: 'Edit Diet Library Item',
        addDietTitle: 'Add Diet Library Item',
        descriptionPlaceholder: 'Description',
        contentPlaceholder: 'Diet content',
        infoText: 'Use this page to add, edit, and organize workout and diet library items. Then pick them from plan builders when creating programs.',
        allScope: 'ALL',
        globalScope: 'GLOBAL',
        mineScope: 'MINE',
        loadFailed: 'Failed to load library items.',
        workoutSaved: 'Workout library item saved.',
        workoutSaveFailed: 'Failed to save workout library item.',
        dietSaved: 'Diet library item saved.',
        dietSaveFailed: 'Failed to save diet library item.',
        deleteWorkoutTitle: 'Delete Workout Library Item',
        deleteWorkoutDescription: 'Delete this workout library item?',
        deleteDietTitle: 'Delete Diet Library Item',
        deleteDietDescription: 'Delete this diet library item?',
        workoutDeleted: 'Workout library item deleted.',
        workoutDeleteFailed: 'Failed to delete workout library item.',
        dietDeleted: 'Diet library item deleted.',
        dietDeleteFailed: 'Failed to delete diet library item.',
        toPlanSuccess: 'Diet plan created from template.',
        toPlanFailed: 'Failed to create diet plan from template.',
    };

    const [activeTab, setActiveTab] = useState<ActiveTab>('WORKOUT');
    const [scope, setScope] = useState<LibraryScope>('all');
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);

    const [workoutItems, setWorkoutItems] = useState<WorkoutLibraryItem[]>([]);
    const [dietItems, setDietItems] = useState<DietLibraryItem[]>([]);

    const [showWorkoutModal, setShowWorkoutModal] = useState(false);
    const [showDietModal, setShowDietModal] = useState(false);
    const [workoutForm, setWorkoutForm] = useState(emptyWorkoutForm);
    const [dietForm, setDietForm] = useState(emptyDietForm);

    const isAdmin = user?.role === 'ADMIN';

    const fetchWorkoutItems = useCallback(async () => {
        const res = await api.get('/fitness/exercise-library', {
            params: { scope, query: query.trim() || undefined },
        });
        setWorkoutItems(res.data?.data || []);
    }, [scope, query]);

    const fetchDietItems = useCallback(async () => {
        const res = await api.get('/fitness/diet-library', {
            params: { scope, query: query.trim() || undefined },
        });
        setDietItems(res.data?.data || []);
    }, [scope, query]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            await Promise.all([fetchWorkoutItems(), fetchDietItems()]);
        } catch {
            showToast(txt.loadFailed, 'error');
        }
        setLoading(false);
    }, [fetchDietItems, fetchWorkoutItems, showToast]);

    useEffect(() => {
        setTimeout(() => fetchData(), 0);
    }, [fetchData]);

    const openCreate = () => {
        if (activeTab === 'WORKOUT') {
            setWorkoutForm(emptyWorkoutForm);
            setShowWorkoutModal(true);
        } else {
            setDietForm(emptyDietForm);
            setShowDietModal(true);
        }
    };

    const openEditWorkout = (item: WorkoutLibraryItem) => {
        setWorkoutForm({
            id: item.id,
            name: item.name,
            category: item.category || '',
            muscle_group: item.muscle_group || '',
            equipment: item.equipment || '',
            tags: (item.tags || []).join(', '),
            default_video_url: item.default_video_url || '',
            is_global: item.is_global,
        });
        setShowWorkoutModal(true);
    };

    const openEditDiet = (item: DietLibraryItem) => {
        setDietForm({
            id: item.id,
            name: item.name,
            description: item.description || '',
            content: item.content,
            is_global: item.is_global,
        });
        setShowDietModal(true);
    };

    const saveWorkoutItem = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                name: workoutForm.name,
                category: workoutForm.category || null,
                muscle_group: workoutForm.muscle_group || null,
                equipment: workoutForm.equipment || null,
                tags: workoutForm.tags
                    .split(',')
                    .map(tag => tag.trim())
                    .filter(Boolean),
                default_video_url: workoutForm.default_video_url || null,
                is_global: isAdmin ? workoutForm.is_global : false,
            };
            if (workoutForm.id) {
                await api.put(`/fitness/exercise-library/${workoutForm.id}`, payload);
            } else {
                await api.post('/fitness/exercise-library', payload);
            }
            setShowWorkoutModal(false);
            setWorkoutForm(emptyWorkoutForm);
            fetchWorkoutItems();
            showToast(txt.workoutSaved, 'success');
        } catch {
            showToast(txt.workoutSaveFailed, 'error');
        }
    };

    const saveDietItem = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                name: dietForm.name,
                description: dietForm.description || null,
                content: dietForm.content,
                is_global: isAdmin ? dietForm.is_global : false,
            };
            if (dietForm.id) {
                await api.put(`/fitness/diet-library/${dietForm.id}`, payload);
            } else {
                await api.post('/fitness/diet-library', payload);
            }
            setShowDietModal(false);
            setDietForm(emptyDietForm);
            fetchDietItems();
            showToast(txt.dietSaved, 'success');
        } catch {
            showToast(txt.dietSaveFailed, 'error');
        }
    };

    const deleteWorkoutItem = async (id: string) => {
        const confirmed = await confirmAction({
            title: txt.deleteWorkoutTitle,
            description: txt.deleteWorkoutDescription,
            confirmText: txt.delete,
            destructive: true,
        });
        if (!confirmed) return;
        try {
            await api.delete(`/fitness/exercise-library/${id}`);
            fetchWorkoutItems();
            showToast(txt.workoutDeleted, 'success');
        } catch {
            showToast(txt.workoutDeleteFailed, 'error');
        }
    };

    const deleteDietItem = async (id: string) => {
        const confirmed = await confirmAction({
            title: txt.deleteDietTitle,
            description: txt.deleteDietDescription,
            confirmText: txt.delete,
            destructive: true,
        });
        if (!confirmed) return;
        try {
            await api.delete(`/fitness/diet-library/${id}`);
            fetchDietItems();
            showToast(txt.dietDeleted, 'success');
        } catch {
            showToast(txt.dietDeleteFailed, 'error');
        }
    };

    const createPlanFromDietItem = async (id: string) => {
        try {
            await api.post(`/fitness/diet-library/${id}/to-plan`);
            showToast(txt.toPlanSuccess, 'success');
        } catch {
            showToast(txt.toPlanFailed, 'error');
        }
    };

    const visibleItemsCount = useMemo(() => {
        return activeTab === 'WORKOUT' ? workoutItems.length : dietItems.length;
    }, [activeTab, dietItems.length, workoutItems.length]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{txt.title}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{txt.subtitle}</p>
                </div>
                <button type="button" onClick={openCreate} className="btn-primary min-h-11">
                    <Plus size={16} /> {txt.addItem}
                </button>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => setActiveTab('WORKOUT')}
                    className={`min-h-11 rounded-sm border px-3 py-2 text-xs font-medium ${activeTab === 'WORKOUT' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                >
                    {txt.workoutLibrary}
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('DIET')}
                    className={`min-h-11 rounded-sm border px-3 py-2 text-xs font-medium ${activeTab === 'DIET' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                >
                    {txt.dietLibrary}
                </button>
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex flex-wrap gap-2">
                    {(['all', 'global', 'mine'] as LibraryScope[]).map(nextScope => (
                        <button
                            key={nextScope}
                            type="button"
                            onClick={() => setScope(nextScope)}
                            className={`min-h-11 rounded-sm border px-3 py-2 text-xs font-medium ${scope === nextScope ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                        >
                            {nextScope === 'all' ? txt.allScope : nextScope === 'global' ? txt.globalScope : txt.mineScope}
                        </button>
                    ))}
                </div>
                <input
                    type="text"
                    className="input-dark md:max-w-sm"
                    placeholder={txt.searchPlaceholder}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />
            </div>

            {loading ? (
                <div className="flex h-40 items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
            ) : (
                <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">{visibleItemsCount} {txt.itemsCount}</p>
                    {activeTab === 'WORKOUT' ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {workoutItems.map(item => (
                                <div key={item.id} className="rounded-sm border border-border bg-card p-4 space-y-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="font-semibold text-foreground truncate">{item.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {[item.category, item.muscle_group, item.equipment].filter(Boolean).join(' | ') || txt.noMetadata}
                                            </p>
                                        </div>
                                        <span className={`badge ${item.is_global ? 'badge-green' : 'badge-gray'}`}>{item.is_global ? txt.global : txt.mine}</span>
                                    </div>
                                    {item.tags?.length > 0 && (
                                        <p className="text-xs text-muted-foreground">{txt.tags} {item.tags.join(', ')}</p>
                                    )}
                                    {item.default_video_url && (
                                        <a className="text-xs text-primary hover:underline break-all" href={item.default_video_url} target="_blank" rel="noreferrer">
                                            {item.default_video_url}
                                        </a>
                                    )}
                                    <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                                        <button type="button" className="btn-ghost text-xs min-h-11" onClick={() => openEditWorkout(item)}>
                                            <Pencil size={14} /> {txt.edit}
                                        </button>
                                        <button type="button" className="btn-ghost text-xs min-h-11 text-destructive hover:text-destructive" onClick={() => deleteWorkoutItem(item.id)}>
                                            <Trash2 size={14} /> {txt.delete}
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {workoutItems.length === 0 && (
                                <div className="col-span-full rounded-sm border border-border border-dashed p-8 text-center text-sm text-muted-foreground">
                                    {txt.noWorkoutItems}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {dietItems.map(item => (
                                <div key={item.id} className="rounded-sm border border-border bg-card p-4 space-y-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="font-semibold text-foreground truncate">{item.name}</p>
                                            <p className="text-xs text-muted-foreground line-clamp-2">{item.description || txt.noDescription}</p>
                                        </div>
                                        <span className={`badge ${item.is_global ? 'badge-green' : 'badge-gray'}`}>{item.is_global ? txt.global : txt.mine}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-5">{item.content}</p>
                                    <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                                        <button type="button" className="btn-ghost text-xs min-h-11" onClick={() => openEditDiet(item)}>
                                            <Pencil size={14} /> {txt.edit}
                                        </button>
                                        <button type="button" className="btn-ghost text-xs min-h-11" onClick={() => createPlanFromDietItem(item.id)}>
                                            <Utensils size={14} /> {txt.toPlan}
                                        </button>
                                        <button type="button" className="btn-ghost text-xs min-h-11 text-destructive hover:text-destructive" onClick={() => deleteDietItem(item.id)}>
                                            <Trash2 size={14} /> {txt.delete}
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {dietItems.length === 0 && (
                                <div className="col-span-full rounded-sm border border-border border-dashed p-8 text-center text-sm text-muted-foreground">
                                    {txt.noDietItems}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <Modal isOpen={showWorkoutModal} onClose={() => setShowWorkoutModal(false)} title={workoutForm.id ? txt.editWorkoutTitle : txt.addWorkoutTitle} maxWidthClassName="max-w-2xl">
                <form onSubmit={saveWorkoutItem} className="space-y-4">
                    <input type="text" required className="input-dark" placeholder={txt.namePlaceholder} value={workoutForm.name} onChange={e => setWorkoutForm(prev => ({ ...prev, name: e.target.value }))} />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input type="text" className="input-dark" placeholder={txt.categoryPlaceholder} value={workoutForm.category} onChange={e => setWorkoutForm(prev => ({ ...prev, category: e.target.value }))} />
                        <input type="text" className="input-dark" placeholder={txt.muscleGroupPlaceholder} value={workoutForm.muscle_group} onChange={e => setWorkoutForm(prev => ({ ...prev, muscle_group: e.target.value }))} />
                        <input type="text" className="input-dark" placeholder={txt.equipmentPlaceholder} value={workoutForm.equipment} onChange={e => setWorkoutForm(prev => ({ ...prev, equipment: e.target.value }))} />
                    </div>
                    <input type="text" className="input-dark" placeholder={txt.tagsPlaceholder} value={workoutForm.tags} onChange={e => setWorkoutForm(prev => ({ ...prev, tags: e.target.value }))} />
                    <input type="url" className="input-dark" placeholder={txt.defaultVideoPlaceholder} value={workoutForm.default_video_url} onChange={e => setWorkoutForm(prev => ({ ...prev, default_video_url: e.target.value }))} />
                    {isAdmin && (
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input type="checkbox" checked={workoutForm.is_global} onChange={e => setWorkoutForm(prev => ({ ...prev, is_global: e.target.checked }))} />
                            {txt.makeGlobal}
                        </label>
                    )}
                    <div className="flex justify-end gap-2 border-t border-border pt-4">
                        <button type="button" className="btn-ghost" onClick={() => setShowWorkoutModal(false)}>{txt.cancel}</button>
                        <button type="submit" className="btn-primary"><Save size={16} /> {txt.save}</button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={showDietModal} onClose={() => setShowDietModal(false)} title={dietForm.id ? txt.editDietTitle : txt.addDietTitle} maxWidthClassName="max-w-2xl">
                <form onSubmit={saveDietItem} className="space-y-4">
                    <input type="text" required className="input-dark" placeholder={txt.namePlaceholder} value={dietForm.name} onChange={e => setDietForm(prev => ({ ...prev, name: e.target.value }))} />
                    <input type="text" className="input-dark" placeholder={txt.descriptionPlaceholder} value={dietForm.description} onChange={e => setDietForm(prev => ({ ...prev, description: e.target.value }))} />
                    <textarea required rows={6} className="input-dark resize-none" placeholder={txt.contentPlaceholder} value={dietForm.content} onChange={e => setDietForm(prev => ({ ...prev, content: e.target.value }))} />
                    {isAdmin && (
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input type="checkbox" checked={dietForm.is_global} onChange={e => setDietForm(prev => ({ ...prev, is_global: e.target.checked }))} />
                            {txt.makeGlobal}
                        </label>
                    )}
                    <div className="flex justify-end gap-2 border-t border-border pt-4">
                        <button type="button" className="btn-ghost" onClick={() => setShowDietModal(false)}>{txt.cancel}</button>
                        <button type="submit" className="btn-primary"><Save size={16} /> {txt.save}</button>
                    </div>
                </form>
            </Modal>

            <div className="rounded-sm border border-border bg-muted/10 p-3 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                    <Dumbbell size={14} className="mt-0.5 text-primary" />
                    <p>{txt.infoText}</p>
                </div>
            </div>
        </div>
    );
}
