'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { Plus, Dumbbell, Trash2, Archive, UserPlus, Pencil, Save, X, Video, PlayCircle, RefreshCw, Send } from 'lucide-react';
import Modal from '@/components/Modal';
import { useFeedback } from '@/components/FeedbackProvider';
import MemberSearchSelect from '@/components/MemberSearchSelect';
import PlanCardShell from '@/components/PlanCardShell';
import PlanDetailsToggle from '@/components/PlanDetailsToggle';
import PlanSectionHeader from '@/components/PlanSectionHeader';
import AssignPlanSummaryPanel from '@/components/AssignPlanSummaryPanel';
import { useLocale } from '@/context/LocaleContext';

interface Member {
    id: string;
    full_name: string;
    email: string;
}

type VideoType = 'EMBED' | 'UPLOAD' | '';

interface WorkoutExerciseItem {
    exercise_id?: string;
    exercise_name?: string;
    section_name?: string;
    sets: number;
    reps: number;
    order: number;
    video_type?: 'EMBED' | 'UPLOAD' | null;
    video_url?: string | null;
    uploaded_video_url?: string | null;
    exercise?: { name: string; id: string };
}

interface Plan {
    id: string;
    name: string;
    description: string;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    version: number;
    parent_plan_id?: string | null;
    expected_sessions_per_30d?: number;
    exercises: WorkoutExerciseItem[];
    member_id?: string | null;
}

interface PlanSummary {
    id: string;
    name: string;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    version: number;
    total_sections: number;
    total_exercises: number;
    total_videos: number;
    preview_sections: { section_name: string; exercise_names: string[] }[];
}

interface ExerciseLibraryItem {
    id: string;
    name: string;
    category?: string | null;
    muscle_group?: string | null;
    equipment?: string | null;
    tags: string[];
    default_video_url?: string | null;
    is_global: boolean;
}

interface PlanAdherenceRow {
    plan_id: string;
    plan_name: string;
    assigned_members: number;
    adherent_members: number;
    adherence_percent: number;
}

interface BulkAssignAdherenceSnapshot {
    planId: string;
    planName: string;
    assignedMembers: number;
    adherentMembers: number;
    adherencePercent: number;
    capturedAt: string;
}

interface SectionDraft {
    id: string;
    name: string;
    exercises: WorkoutExerciseItem[];
}

const makeId = () => Math.random().toString(36).slice(2, 10);

const getErrorMessage = (error: unknown, fallback: string) => {
    const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return typeof detail === 'string' && detail.trim() ? detail : fallback;
};

export default function WorkoutPlansPage() {
    const { locale } = useLocale();
    const { showToast, confirm: confirmAction } = useFeedback();
    const txt = locale === 'ar'
        ? {
            pageTitle: 'خطط التمرين',
            pageSubtitle: 'أنشئ تقسيمات تمرين حسب الأقسام مع تمارين وفيديوهات',
            openLibrary: 'فتح المكتبة',
            refresh: 'تحديث',
            createPlan: 'إنشاء خطة',
            loadingError: 'فشل تحميل خطط التمرين.',
            minSectionError: 'يلزم قسم واحد على الأقل.',
            exerciseNameRequired: 'اسم التمرين مطلوب.',
            chooseVideo: 'اختر ملف فيديو للرفع.',
            uploadFail: 'فشل رفع الفيديو.',
            embedRequired: 'رابط التضمين مطلوب عند اختيار تضمين.',
            savedReusable: 'تم الحفظ في مكتبتك القابلة لإعادة الاستخدام.',
            saveReusableFail: 'فشل حفظ التمرين القابل لإعادة الاستخدام.',
            deletePlan: 'حذف خطة التمرين',
            deleteConfirm: 'هل أنت متأكد أنك تريد حذف هذه الخطة؟',
            delete: 'حذف',
            cancel: 'إلغاء',
            assignPlan: 'تعيين الخطة',
            assignMembersLabel: 'الأعضاء (يدعم التعيين الجماعي)',
            searchMember: 'ابحث عن عضو بالاسم/البريد...',
            noAssignedPlans: 'لا توجد خطط نشطة معيّنة للأعضاء.',
            noTemplates: 'لا توجد قوالب للحالة المحددة.',
            noTemplatesYet: 'لا توجد قوالب بعد. أنشئ أول قالب لك.',
            watch: 'مشاهدة',
            open: 'فتح',
            exercises: 'تمارين',
            moreSections: 'أقسام إضافية',
            templates: 'القوالب',
            templatesSubtitle: 'خطط تمرين قابلة لإعادة الاستخدام حسب الحالة.',
            assignedPlansTitle: 'الخطط المعينة',
            assignedPlansSubtitle: 'خطط تمرين نشطة معيّنة للأعضاء.',
            edit: 'تعديل',
            assign: 'تعيين',
            publish: 'نشر',
            archive: 'أرشفة',
            unassign: 'إلغاء التعيين',
            step1: 'الخطوة 1: أساسيات الخطة',
            step2: 'الخطوة 2: منشئ التمرين',
            planName: 'اسم الخطة',
            description: 'الوصف',
            draft: 'مسودة',
            published: 'منشورة',
            archived: 'مؤرشفة',
            expectedSessions: 'الجلسات المتوقعة / 30 يوم',
            unassignedTemplate: 'غير معيّن (قالب)',
            searchMemberLong: 'ابحث عن عضو بالاسم أو البريد...',
            sectionName: 'اسم القسم',
            addSection: 'إضافة قسم',
            exerciseBuilder: 'منشئ التمارين',
            hideLibrary: 'إخفاء المكتبة',
            addFromLibrary: 'أضف من المكتبة',
            fullLibraryQuestion: 'تحتاج إدارة كاملة للمكتبة؟',
            openWorkoutDietLibrary: 'افتح مكتبة التمارين والتغذية',
            searchLibrary: 'ابحث بالاسم أو العضلة أو المعدة...',
            search: 'بحث',
            recent: 'الأخيرة',
            noLibraryItems: 'لا توجد عناصر في المكتبة.',
            exerciseName: 'اسم التمرين',
            noVideo: 'بدون فيديو',
            embedUrl: 'رابط تضمين',
            uploadVideo: 'رفع فيديو',
            addExercise: 'إضافة تمرين',
            noExercisesInSection: 'لا توجد تمارين في هذا القسم بعد.',
            added: 'تمت الإضافة',
            saveReusable: 'حفظ كقابل لإعادة الاستخدام',
            back: 'رجوع',
            next: 'التالي',
            closeVideo: 'إغلاق الفيديو',
            cannotPreview: 'تعذر معاينة هذا المصدر في النافذة المنبثقة.',
            openSource: 'فتح المصدر',
            replaceActiveNote: 'وضع استبدال النشط مفعّل: سيتم أرشفة الخطط النشطة الحالية للأعضاء المحددين.',
            assignPrefix: 'تعيين:',
            adherent30d: 'ملتزم (30 يوم)',
            lastBulkAssignCheck: 'آخر فحص تعيين جماعي',
            assignedLabel: 'المعين:',
            adherentLabel: ' | الملتزم (30 يوم):',
            scoreLabel: ' | النسبة:',
            sections: 'أقسام',
            warningDraftAssign: 'تحذير: أنت تقوم بتعيين خطة مسودة.',
            archivedCannotAssign: 'لا يمكن تعيين الخطط المؤرشفة.',
            summarySectionsExercisesVideos: 'أقسام | تمارين | فيديوهات',
        }
        : {
            pageTitle: 'Workout Plans',
            pageSubtitle: 'Create section-based workout splits with manual exercises and videos',
            openLibrary: 'Open Library',
            refresh: 'Refresh',
            createPlan: 'Create Plan',
            loadingError: 'Failed to load workout plans.',
            minSectionError: 'At least one section is required.',
            exerciseNameRequired: 'Exercise name is required.',
            chooseVideo: 'Please choose a video file to upload.',
            uploadFail: 'Failed to upload video.',
            embedRequired: 'Embed URL is required when video type is Embed.',
            savedReusable: 'Saved to your reusable library.',
            saveReusableFail: 'Failed to save reusable exercise.',
            deletePlan: 'Delete Workout Plan',
            deleteConfirm: 'Are you sure you want to delete this plan?',
            delete: 'Delete',
            cancel: 'Cancel',
            assignPlan: 'Assign Plan',
            assignMembersLabel: 'Members (bulk assign supported)',
            searchMember: 'Search member by name/email...',
            noAssignedPlans: 'No active plans assigned to members.',
            noTemplates: 'No templates for selected status.',
            noTemplatesYet: 'No workout templates yet. Create your first one!',
            watch: 'Watch',
            open: 'Open',
            exercises: 'exercises',
            moreSections: 'more section(s)',
            templates: 'Templates',
            templatesSubtitle: 'Reusable workout plans by status.',
            assignedPlansTitle: 'Assigned Plans',
            assignedPlansSubtitle: 'Active workout plans assigned to members.',
            edit: 'Edit',
            assign: 'Assign',
            publish: 'Publish',
            archive: 'Archive',
            unassign: 'Unassign',
            step1: 'Step 1: Plan Basics',
            step2: 'Step 2: Workout Builder',
            planName: 'Plan Name',
            description: 'Description',
            draft: 'Draft',
            published: 'Published',
            archived: 'Archived',
            expectedSessions: 'Expected sessions / 30d',
            unassignedTemplate: 'Unassigned (template)',
            searchMemberLong: 'Search member by name or email...',
            sectionName: 'Section name',
            addSection: 'Add Section',
            exerciseBuilder: 'Exercise Builder',
            hideLibrary: 'Hide Library',
            addFromLibrary: 'Add from Library',
            fullLibraryQuestion: 'Need full library management?',
            openWorkoutDietLibrary: 'Open Workout & Diet Library',
            searchLibrary: 'Search by name, muscle, equipment...',
            search: 'Search',
            recent: 'Recent',
            noLibraryItems: 'No library items found.',
            exerciseName: 'Exercise name',
            noVideo: 'No Video',
            embedUrl: 'Embed URL',
            uploadVideo: 'Upload Video',
            addExercise: 'Add Exercise',
            noExercisesInSection: 'No exercises in this section yet.',
            added: 'Added',
            saveReusable: 'Save reusable',
            back: 'Back',
            next: 'Next',
            closeVideo: 'Close video',
            cannotPreview: 'Unable to preview this source in popup.',
            openSource: 'Open Source',
            replaceActiveNote: 'Replace-active mode is enabled: existing active plans for selected members will be archived.',
            assignPrefix: 'Assign:',
            adherent30d: 'adherent (30d)',
            lastBulkAssignCheck: 'Last Bulk Assign Check',
            assignedLabel: 'Assigned:',
            adherentLabel: ' | Adherent (30d):',
            scoreLabel: ' | Score:',
            sections: 'sections',
            warningDraftAssign: 'Warning: you are assigning a draft plan.',
            archivedCannotAssign: 'Archived plans cannot be assigned.',
            summarySectionsExercisesVideos: 'sections | exercises | videos',
        };
    const [plans, setPlans] = useState<Plan[]>([]);
    const [planSummaries, setPlanSummaries] = useState<PlanSummary[]>([]);
    const [adherenceRows, setAdherenceRows] = useState<PlanAdherenceRow[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [showModal, setShowModal] = useState(false);
    const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
    const [modalStep, setModalStep] = useState<1 | 2>(1);
    const [expandedTemplatePlanId, setExpandedTemplatePlanId] = useState<string | null>(null);
    const [expandedAssignedPlanId, setExpandedAssignedPlanId] = useState<string | null>(null);
    const [videoPopup, setVideoPopup] = useState<{
        title: string;
        youtubeEmbedUrl?: string;
        videoUrl?: string;
        externalUrl?: string;
    } | null>(null);

    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [assigningPlan, setAssigningPlan] = useState<Plan | null>(null);
    const [bulkAssignMemberIds, setBulkAssignMemberIds] = useState<string[]>([]);
    const [memberSearch, setMemberSearch] = useState('');
    const [lastBulkAssignSnapshot, setLastBulkAssignSnapshot] = useState<BulkAssignAdherenceSnapshot | null>(null);
    const [selectedTemplateStatus, setSelectedTemplateStatus] = useState<'ALL' | Plan['status']>('ALL');

    const [planName, setPlanName] = useState('');
    const [planDesc, setPlanDesc] = useState('');
    const [planStatus, setPlanStatus] = useState<Plan['status']>('DRAFT');
    const [expectedSessions30d, setExpectedSessions30d] = useState(12);
    const [assignedMemberId, setAssignedMemberId] = useState('');

    const [sections, setSections] = useState<SectionDraft[]>([{ id: makeId(), name: 'General', exercises: [] }]);
    const [activeSectionId, setActiveSectionId] = useState('');
    const [sectionNameInput, setSectionNameInput] = useState('');

    const [currentExerciseName, setCurrentExerciseName] = useState('');
    const [currentSets, setCurrentSets] = useState(3);
    const [currentReps, setCurrentReps] = useState(10);
    const [currentVideoType, setCurrentVideoType] = useState<VideoType>('');
    const [currentVideoUrl, setCurrentVideoUrl] = useState('');
    const [currentVideoFile, setCurrentVideoFile] = useState<File | null>(null);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [libraryQuery, setLibraryQuery] = useState('');
    const [libraryItems, setLibraryItems] = useState<ExerciseLibraryItem[]>([]);
    const [recentLibraryItems, setRecentLibraryItems] = useState<ExerciseLibraryItem[]>([]);

    const configuredApiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
    const apiOrigin = configuredApiUrl.endsWith('/api/v1')
        ? configuredApiUrl.slice(0, -'/api/v1'.length)
        : configuredApiUrl;

    const resolveVideoUrl = (exercise: WorkoutExerciseItem) => {
        if (exercise.video_type === 'EMBED' && exercise.video_url) return exercise.video_url;
        if (exercise.video_type === 'UPLOAD' && exercise.uploaded_video_url) {
            return exercise.uploaded_video_url.startsWith('http')
                ? exercise.uploaded_video_url
                : `${apiOrigin}${exercise.uploaded_video_url}`;
        }
        return null;
    };

    const getYouTubeEmbedUrl = (url: string) => {
        try {
            const parsed = new URL(url);
            const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
            const isValidYouTubeId = (value: string) => /^[a-zA-Z0-9_-]{11}$/.test(value);
            const toEmbed = (id: string) => `https://www.youtube-nocookie.com/embed/${id}`;
            if (host === 'youtube.com' || host === 'm.youtube.com') {
                const id = parsed.searchParams.get('v');
                if (id && isValidYouTubeId(id)) return toEmbed(id);
                const shorts = parsed.pathname.match(/^\/shorts\/([^/?]+)/);
                if (shorts?.[1] && isValidYouTubeId(shorts[1])) return toEmbed(shorts[1]);
                const live = parsed.pathname.match(/^\/live\/([^/?]+)/);
                if (live?.[1] && isValidYouTubeId(live[1])) return toEmbed(live[1]);
                const embed = parsed.pathname.match(/^\/embed\/([^/?]+)/);
                if (embed?.[1] && isValidYouTubeId(embed[1])) return toEmbed(embed[1]);
                const generic = parsed.pathname.match(/([a-zA-Z0-9_-]{11})/);
                if (generic?.[1]) return toEmbed(generic[1]);
                return null;
            }
            if (host === 'youtu.be') {
                const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
                return id && isValidYouTubeId(id) ? toEmbed(id) : null;
            }
            if (host === 'youtube-nocookie.com') {
                const match = parsed.pathname.match(/\/embed\/([^/?]+)/);
                return match?.[1] && isValidYouTubeId(match[1]) ? toEmbed(match[1]) : null;
            }
            return null;
        } catch {
            return null;
        }
    };

    const getExerciseDisplayName = (exercise: WorkoutExerciseItem) => {
        return exercise.exercise_name || exercise.exercise?.name || 'Exercise';
    };

    const groupExercises = (exercises: WorkoutExerciseItem[]) => {
        const sorted = [...exercises].sort((a, b) => a.order - b.order);
        const grouped: Record<string, WorkoutExerciseItem[]> = {};
        sorted.forEach((ex) => {
            const section = ex.section_name || 'General';
            if (!grouped[section]) grouped[section] = [];
            grouped[section].push(ex);
        });
        return grouped;
    };

    const fetchData = useCallback(async () => {
        setRefreshing(true);
        try {
            const [plansRes, summariesRes, adherenceRes] = await Promise.all([
                api.get('/fitness/plans'),
                api.get('/fitness/plan-summaries').catch(() => ({ data: { data: [] } })),
                api.get('/fitness/plans/adherence', { params: { window_days: 30 } }).catch(() => ({ data: { data: [] } })),
            ]);
            setPlans(plansRes.data.data);
            setPlanSummaries(summariesRes.data.data || []);
            setAdherenceRows(adherenceRes.data.data || []);
            try {
                const membersRes = await api.get('/hr/members');
                setMembers(membersRes.data.data || []);
            } catch {
                setMembers([]);
            }
        } catch {
            showToast(txt.loadingError, 'error');
        }
        setLoading(false);
        setRefreshing(false);
    }, [showToast]);

    const fetchExerciseLibrary = useCallback(async (query?: string) => {
        try {
            const [itemsRes, recentRes] = await Promise.all([
                api.get('/fitness/exercise-library', { params: { scope: 'all', query: query || undefined } }),
                api.get('/fitness/exercise-library/recent').catch(() => ({ data: { data: [] } })),
            ]);
            setLibraryItems(itemsRes.data.data || []);
            setRecentLibraryItems(recentRes.data.data || []);
        } catch {
            setLibraryItems([]);
            setRecentLibraryItems([]);
        }
    }, []);

    const applyLibraryItem = async (item: ExerciseLibraryItem) => {
        setCurrentExerciseName(item.name);
        if (item.default_video_url) {
            setCurrentVideoType('EMBED');
            setCurrentVideoUrl(item.default_video_url);
        }
        try {
            await api.post(`/fitness/exercise-library/${item.id}/quick-add`);
        } catch {
            // best effort
        }
    };

    useEffect(() => {
        setTimeout(() => fetchData(), 0);
        return () => undefined;
    }, [fetchData]);

    const resetForm = () => {
        const defaultSection = { id: makeId(), name: 'General', exercises: [] };
        setEditingPlan(null);
        setModalStep(1);
        setPlanName('');
        setPlanDesc('');
        setPlanStatus('DRAFT');
        setExpectedSessions30d(12);
        setAssignedMemberId('');
        setSections([defaultSection]);
        setActiveSectionId(defaultSection.id);
        setSectionNameInput('');
        setCurrentExerciseName('');
        setCurrentSets(3);
        setCurrentReps(10);
        setCurrentVideoType('');
        setCurrentVideoUrl('');
        setCurrentVideoFile(null);
    };

    const handleOpenCreateModal = () => {
        resetForm();
        setShowModal(true);
        fetchExerciseLibrary();
    };

    const addSection = () => {
        const name = sectionNameInput.trim();
        if (!name) return;
        const existing = sections.find(s => s.name.toLowerCase() === name.toLowerCase());
        if (existing) {
            setActiveSectionId(existing.id);
            setSectionNameInput('');
            return;
        }
        const newSection = { id: makeId(), name, exercises: [] };
        setSections(prev => [...prev, newSection]);
        setActiveSectionId(newSection.id);
        setSectionNameInput('');
    };

    const removeSection = (sectionId: string) => {
        if (sections.length === 1) {
            showToast(txt.minSectionError, 'error');
            return;
        }
        const next = sections.filter(s => s.id !== sectionId);
        setSections(next);
        if (activeSectionId === sectionId && next.length > 0) {
            setActiveSectionId(next[0].id);
        }
    };

    const uploadVideo = async (file: File) => {
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.post('/fitness/exercise-videos/upload', fd, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return res.data.data.video_url as string;
    };

    const addExerciseToSection = async () => {
        const targetSection = sections.find(s => s.id === activeSectionId) || sections[0];
        if (!targetSection) return;
        const name = currentExerciseName.trim();
        if (!name) { showToast(txt.exerciseNameRequired, 'error'); return; }

        let uploadedVideoUrl: string | null = null;
        if (currentVideoType === 'UPLOAD') {
            if (!currentVideoFile) { showToast(txt.chooseVideo, 'error'); return; }
            try { uploadedVideoUrl = await uploadVideo(currentVideoFile); }
            catch { showToast(txt.uploadFail, 'error'); return; }
        }
        if (currentVideoType === 'EMBED' && !currentVideoUrl.trim()) {
            showToast(txt.embedRequired, 'error');
            return;
        }

        const nextExercise: WorkoutExerciseItem = {
            exercise_name: name,
            section_name: targetSection.name,
            sets: currentSets,
            reps: currentReps,
            order: 0,
            video_type: currentVideoType ? currentVideoType : null,
            video_url: currentVideoType === 'EMBED' ? currentVideoUrl.trim() : null,
            uploaded_video_url: currentVideoType === 'UPLOAD' ? uploadedVideoUrl : null,
        };

        setSections(prev => prev.map(section => (
            section.id === targetSection.id ? { ...section, exercises: [...section.exercises, nextExercise] } : section
        )));

        setCurrentExerciseName('');
        setCurrentSets(3);
        setCurrentReps(10);
        setCurrentVideoType('');
        setCurrentVideoUrl('');
        setCurrentVideoFile(null);
        setLibraryOpen(false);
    };

    const removeExerciseFromSection = (sectionId: string, idx: number) => {
        setSections(prev => prev.map(section => (
            section.id === sectionId ? { ...section, exercises: section.exercises.filter((_, i) => i !== idx) } : section
        )));
    };

    const saveExerciseAsReusable = async (exercise: WorkoutExerciseItem) => {
        const name = getExerciseDisplayName(exercise).trim();
        if (!name) return;
        try {
            await api.post('/fitness/exercise-library', {
                name,
                category: exercise.section_name || null,
                default_video_url: resolveVideoUrl(exercise) || null,
                is_global: false,
                tags: [],
            });
            showToast(txt.savedReusable, 'success');
            fetchExerciseLibrary(libraryQuery);
        } catch {
            showToast(txt.saveReusableFail, 'error');
        }
    };

    const flattenExercises = () => {
        const all: WorkoutExerciseItem[] = [];
        sections.forEach(section => section.exercises.forEach(exercise => all.push({ ...exercise, section_name: section.name })));
        return all.map((exercise, index) => ({ ...exercise, order: index + 1 }));
    };

    const handleEditClick = async (plan: Plan) => {
        if (plan.status === 'PUBLISHED') {
            const confirmed = await confirmAction({
                title: 'Published Plan',
                description: 'Published plans are read-only. Create a draft copy to edit?',
                confirmText: 'Create Draft',
            });
            if (!confirmed) return;
            try {
                await api.post(`/fitness/plans/${plan.id}/fork-draft`);
                showToast('Draft created from published plan.', 'success');
                fetchData();
            } catch {
                showToast('Failed to create draft.', 'error');
            }
            return;
        }
        if (plan.status === 'ARCHIVED') {
            showToast('Archived plans cannot be edited.', 'error');
            return;
        }
        setEditingPlan(plan);
        setPlanName(plan.name);
        setPlanDesc(plan.description || '');
        setPlanStatus(plan.status || 'DRAFT');
        setExpectedSessions30d(plan.expected_sessions_per_30d || 12);
        setAssignedMemberId(plan.member_id || '');
        const grouped = groupExercises(plan.exercises);
        const mappedSections: SectionDraft[] = Object.entries(grouped).map(([name, exercises]) => ({
            id: makeId(),
            name,
            exercises: exercises.map(ex => ({ ...ex, exercise_name: getExerciseDisplayName(ex) })),
        }));
        const nextSections = mappedSections.length > 0 ? mappedSections : [{ id: makeId(), name: 'General', exercises: [] }];
        setSections(nextSections);
        setActiveSectionId(nextSections[0].id);
        setModalStep(1);
        setShowModal(true);
        fetchExerciseLibrary();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const exercises = flattenExercises();
        if (!planName.trim()) {
            showToast('Plan name is required.', 'error');
            return;
        }
        if (expectedSessions30d < 1 || expectedSessions30d > 60) {
            showToast('Expected sessions must be between 1 and 60.', 'error');
            return;
        }
        if (exercises.length === 0) { showToast('Add at least one exercise before saving.', 'error'); return; }
        try {
            const payload = {
                name: planName,
                description: planDesc,
                member_id: assignedMemberId || undefined,
                status: planStatus,
                expected_sessions_per_30d: expectedSessions30d,
                exercises: exercises.map(ex => ({
                    exercise_id: ex.exercise_id,
                    exercise_name: ex.exercise_name,
                    section_name: ex.section_name,
                    sets: ex.sets,
                    reps: ex.reps,
                    order: ex.order,
                    video_type: ex.video_type || undefined,
                    video_url: ex.video_url || undefined,
                    uploaded_video_url: ex.uploaded_video_url || undefined,
                }))
            };
            if (editingPlan) await api.put(`/fitness/plans/${editingPlan.id}`, payload);
            else await api.post('/fitness/plans', payload);
            setShowModal(false);
            fetchData();
        } catch { showToast(`Failed to ${editingPlan ? 'update' : 'create'} plan`, 'error'); }
    };

    const goToBuilderStep = () => {
        if (!planName.trim()) {
            showToast('Plan name is required.', 'error');
            return;
        }
        if (expectedSessions30d < 1 || expectedSessions30d > 60) {
            showToast('Expected sessions must be between 1 and 60.', 'error');
            return;
        }
        setModalStep(2);
    };

    const handleModalSubmit = (e: React.FormEvent) => {
        if (modalStep === 1) {
            e.preventDefault();
            goToBuilderStep();
            return;
        }
        handleSubmit(e);
    };

    const openAssign = (plan: Plan) => {
        setAssigningPlan(plan);
        setBulkAssignMemberIds([]);
        setMemberSearch('');
        setAssignModalOpen(true);
    };

    const handleAssignSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assigningPlan) return;
        if (assigningPlan.status === 'ARCHIVED') {
            showToast('Cannot assign archived plan.', 'error');
            return;
        }
        const memberIds = bulkAssignMemberIds;
        if (memberIds.length === 0) {
            showToast('Select at least one member.', 'error');
            return;
        }
        try {
            await api.post(`/fitness/plans/${assigningPlan.id}/bulk-assign`, {
                member_ids: memberIds,
                replace_active: true,
            });
            try {
                const adherenceRes = await api.get(`/fitness/plans/${assigningPlan.id}/adherence`, {
                    params: { window_days: 30 },
                });
                const row = adherenceRes.data?.data;
                if (row) {
                    setLastBulkAssignSnapshot({
                        planId: row.plan_id,
                        planName: row.plan_name,
                        assignedMembers: row.assigned_members,
                        adherentMembers: row.adherent_members,
                        adherencePercent: row.adherence_percent,
                        capturedAt: new Date().toISOString(),
                    });
                }
            } catch {
                // non-blocking snapshot fetch
            }
            setAssignModalOpen(false);
            showToast(`Plan assigned to ${memberIds.length} member(s). Existing active plans were replaced.`, 'success');
            fetchData();
        } catch { showToast('Failed to assign plan.', 'error'); }
    };

    const handleDelete = async (planId: string) => {
        const confirmed = await confirmAction({ title: txt.deletePlan, description: txt.deleteConfirm, confirmText: txt.delete, destructive: true });
        if (!confirmed) return;
        try { await api.delete(`/fitness/plans/${planId}`); showToast('Plan deleted.', 'success'); fetchData(); }
        catch (error) { showToast(getErrorMessage(error, 'Failed to delete plan'), 'error'); }
    };

    const handlePublish = async (planId: string) => {
        try {
            await api.post(`/fitness/plans/${planId}/publish`);
            showToast('Plan published.', 'success');
            fetchData();
        } catch {
            showToast('Failed to publish plan.', 'error');
        }
    };

    const handleArchive = async (planId: string) => {
        const confirmed = await confirmAction({ title: 'Archive Plan', description: 'Archive this plan? It will be hidden from active lists.', confirmText: 'Archive', destructive: true });
        if (!confirmed) return;
        try {
            await api.post(`/fitness/plans/${planId}/archive`);
            showToast('Plan archived.', 'success');
            fetchData();
        } catch {
            showToast('Failed to archive plan.', 'error');
        }
    };

    const renderExerciseLine = (
        ex: WorkoutExerciseItem,
        key: string | number,
        options?: { showSectionTag?: string; compact?: boolean }
    ) => {
        const videoUrl = resolveVideoUrl(ex);
        const youtubeEmbedUrl = videoUrl ? getYouTubeEmbedUrl(videoUrl) : null;
        const isDirectVideoFile = Boolean(videoUrl && /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(videoUrl));
        const canOpenPopup = Boolean(videoUrl);
        const isCompact = options?.compact;

        return (
            <div key={key} className="rounded-sm border border-border bg-muted/25">
                <div className={`flex items-center justify-between gap-2 ${isCompact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}>
                    <div className="min-w-0 flex-1">
                        {options?.showSectionTag && (
                            <p className="mb-1 text-[10px] uppercase tracking-wider text-primary/90 font-semibold">{options.showSectionTag}</p>
                        )}
                        <p className="text-foreground font-medium text-xs sm:text-sm truncate">{getExerciseDisplayName(ex)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        <span className="text-muted-foreground font-mono text-xs">{ex.sets}x{ex.reps}</span>
                        {videoUrl && (
                            canOpenPopup ? (
                                <button
                                    type="button"
                                    onClick={() => setVideoPopup({
                                        title: getExerciseDisplayName(ex),
                                        youtubeEmbedUrl: youtubeEmbedUrl || undefined,
                                        videoUrl: !youtubeEmbedUrl && (ex.video_type === 'UPLOAD' || isDirectVideoFile) ? videoUrl : undefined,
                                        externalUrl: videoUrl,
                                    })}
                                    className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20"
                                    title={locale === 'ar' ? 'تشغيل فيديو التمرين' : 'Play exercise video'}
                                >
                                    <PlayCircle size={14} />
                                    {txt.watch}
                                </button>
                            ) : (
                                <a
                                    href={videoUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20"
                                    title={locale === 'ar' ? 'فتح فيديو التمرين' : 'Open exercise video'}
                                >
                                    <Video size={14} />
                                    {txt.open}
                                </a>
                            )
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderGroupedPreview = (plan: Plan, expanded: boolean) => {
        const grouped = groupExercises(plan.exercises);
        const entries = Object.entries(grouped);
        const visibleEntries = expanded ? entries : entries.slice(0, 2);

        return (
            <div className="space-y-2">
                {visibleEntries.map(([sectionName, exercises]) => (
                    <div key={`${plan.id}-${sectionName}`} className="rounded-sm border border-border bg-muted/20 px-3 py-2 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] uppercase tracking-wider text-primary font-semibold">{sectionName}</p>
                            <span className="text-[11px] font-mono text-muted-foreground">{exercises.length} {txt.exercises}</span>
                        </div>
                        {expanded && exercises.map((exercise, index) => (
                            renderExerciseLine(exercise, `${plan.id}-${sectionName}-${index}`, { compact: true })
                        ))}
                    </div>
                ))}
                {!expanded && entries.length > 2 && (
                    <p className="text-xs text-primary font-medium">+{entries.length - 2} {txt.moreSections}</p>
                )}
            </div>
        );
    };

    const templatePlans = useMemo(() => plans.filter(p => !p.member_id), [plans]);
    const assignedPlans = useMemo(() => plans.filter(p => p.member_id), [plans]);
    const templateStatusFilters: Array<'ALL' | Plan['status']> = ['ALL', 'PUBLISHED', 'DRAFT', 'ARCHIVED'];
    const filteredTemplatePlans = useMemo(() => {
        if (selectedTemplateStatus === 'ALL') return templatePlans;
        return templatePlans.filter(plan => plan.status === selectedTemplateStatus);
    }, [selectedTemplateStatus, templatePlans]);
    const assignedPlanGroups = useMemo(() => {
        const grouped: Record<string, Plan[]> = {};
        assignedPlans.forEach(plan => {
            const rootId = plan.parent_plan_id || plan.id;
            if (!grouped[rootId]) grouped[rootId] = [];
            grouped[rootId].push(plan);
        });
        return Object.entries(grouped)
            .map(([rootId, plansInGroup]) => {
                const rootPlan = plans.find(p => p.id === rootId) || plansInGroup[0];
                return {
                    rootId,
                    rootPlanName: rootPlan?.name || 'Assigned Plan',
                    members: [...plansInGroup].sort((a, b) => {
                        const aName = members.find(m => m.id === a.member_id)?.full_name || '';
                        const bName = members.find(m => m.id === b.member_id)?.full_name || '';
                        return aName.localeCompare(bName);
                    }),
                };
            })
            .sort((a, b) => b.members.length - a.members.length || a.rootPlanName.localeCompare(b.rootPlanName));
    }, [assignedPlans, members, plans]);
    const filteredMembers = useMemo(() => {
        const q = memberSearch.trim().toLowerCase();
        if (!q) return members;
        return members.filter(m => m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
    }, [members, memberSearch]);
    const getPlanSummary = (planId: string) => planSummaries.find(s => s.id === planId);
    const statusBadgeClass = (status: Plan['status']) => {
        if (status === 'PUBLISHED') return 'badge-green';
        if (status === 'ARCHIVED') return 'badge-gray';
        return 'badge-orange';
    };

    if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{txt.pageTitle}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{txt.pageSubtitle}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Link href="/dashboard/coach/library" className="btn-ghost min-h-11">
                        {txt.openLibrary}
                    </Link>
                    <button onClick={fetchData} className="btn-ghost min-h-11" title={txt.refresh}>
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> {txt.refresh}
                    </button>
                    <button onClick={handleOpenCreateModal} className="btn-primary min-h-11"><Plus size={18} /> {txt.createPlan}</button>
                </div>
            </div>

            {adherenceRows.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {adherenceRows.slice(0, 3).map(row => (
                        <div key={row.plan_id} className="rounded-sm border border-border bg-muted/20 p-3">
                            <p className="text-sm font-semibold text-foreground truncate">{row.plan_name}</p>
                            <p className="text-xs text-muted-foreground mt-1">{row.adherent_members}/{row.assigned_members} {txt.adherent30d}</p>
                            <p className="text-lg font-bold text-primary mt-1">{row.adherence_percent}%</p>
                        </div>
                    ))}
                </div>
            )}

            {lastBulkAssignSnapshot && (
                <div className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <p className="text-sm font-semibold text-foreground">{txt.lastBulkAssignCheck}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        {lastBulkAssignSnapshot.planName} | {new Date(lastBulkAssignSnapshot.capturedAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-foreground mt-2">
                        {txt.assignedLabel} <span className="font-semibold">{lastBulkAssignSnapshot.assignedMembers}</span>{txt.adherentLabel} <span className="font-semibold">{lastBulkAssignSnapshot.adherentMembers}</span>{txt.scoreLabel} <span className="font-semibold text-primary">{lastBulkAssignSnapshot.adherencePercent}%</span>
                    </p>
                </div>
            )}

            <div className="space-y-3">
                <PlanSectionHeader title={txt.templates} subtitle={txt.templatesSubtitle} />
                <div className="flex flex-wrap gap-2">
                    {templateStatusFilters.map(status => (
                        <button
                            key={status}
                            type="button"
                            onClick={() => setSelectedTemplateStatus(status)}
                            className={`px-3 py-2 min-h-11 text-xs rounded-sm border transition-colors ${
                                selectedTemplateStatus === status
                                    ? 'border-primary text-primary bg-primary/10'
                                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-white/5'
                            }`}
                        >
                            {status === 'ALL' ? 'All Statuses' : status}
                        </button>
                    ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filteredTemplatePlans.map((plan) => (
                        <PlanCardShell
                            key={plan.id}
                            header={(
                                <div className="flex justify-between items-start gap-2">
                                    <div className="min-w-0">
                                        <div className="h-11 w-11 rounded-sm bg-primary/10 flex items-center justify-center border border-primary/20 mb-3">
                                            <Dumbbell size={20} className="text-primary" />
                                        </div>
                                        <h3 className="font-bold text-lg text-foreground mb-1 group-hover:text-primary transition-colors">
                                            {plan.name} <span className="text-xs text-muted-foreground">v{plan.version}</span>
                                        </h3>
                                        <p className="text-muted-foreground text-sm line-clamp-2">{plan.description || 'No description'}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <span className={`badge ${statusBadgeClass(plan.status)} rounded-sm`}>{plan.status}</span>
                                        <span className="badge badge-orange rounded-sm">{plan.exercises?.length || 0}</span>
                                    </div>
                                </div>
                            )}
                            body={renderGroupedPreview(plan, expandedTemplatePlanId === plan.id)}
                            actions={(
                                <>
                                    <button disabled={plan.status === 'ARCHIVED'} onClick={() => handleEditClick(plan)} className="btn-ghost text-xs min-h-11 disabled:opacity-40"><Pencil size={14} /> {txt.edit}</button>
                                    <button disabled={plan.status === 'ARCHIVED'} onClick={() => openAssign(plan)} className="btn-ghost text-xs min-h-11 disabled:opacity-40"><UserPlus size={14} /> {txt.assign}</button>
                                    {plan.status === 'DRAFT' && <button onClick={() => handlePublish(plan.id)} className="btn-ghost text-xs min-h-11"><Send size={14} /> {txt.publish}</button>}
                                    {plan.status !== 'ARCHIVED' && <button onClick={() => handleArchive(plan.id)} className="btn-ghost text-xs min-h-11"><Archive size={14} /> {txt.archive}</button>}
                                    <button onClick={() => handleDelete(plan.id)} className="btn-ghost text-xs min-h-11 text-destructive hover:text-destructive/80"><Trash2 size={14} /> {txt.delete}</button>
                                </>
                            )}
                            footer={(
                                <PlanDetailsToggle
                                    expanded={expandedTemplatePlanId === plan.id}
                                    onClick={() => setExpandedTemplatePlanId((prev) => (prev === plan.id ? null : plan.id))}
                                />
                            )}
                        />
                    ))}
                    {filteredTemplatePlans.length === 0 && (
                        <div className="text-center py-16 chart-card border-dashed border-border col-span-full">
                            <Dumbbell size={40} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                            <p className="text-muted-foreground text-sm">
                                {templatePlans.length === 0
                                    ? 'No workout templates yet. Create your first one!'
                                    : 'No templates for selected status.'}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-4">
                <PlanSectionHeader title={txt.assignedPlansTitle} subtitle={txt.assignedPlansSubtitle} />
                <div className="space-y-4">
                    {assignedPlanGroups.map(group => (
                        <div key={group.rootId} className="kpi-card">
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div>
                                    <p className="text-base font-semibold text-foreground">{group.rootPlanName}</p>
                                    <p className="text-xs text-muted-foreground">{group.members.length} {locale === 'ar' ? 'عضو معيّن' : `assigned member${group.members.length > 1 ? 's' : ''}`}</p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {group.members.map(plan => {
                                    const memberName = members.find(m => m.id === plan.member_id)?.full_name || 'Unknown Member';
                                    return (
                                        <div key={plan.id} className="rounded-sm border border-border p-3 bg-muted/15">
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-foreground truncate">{memberName}</p>
                                                    <p className="text-[11px] text-muted-foreground">{plan.exercises?.length || 0} {txt.exercises} {locale === 'ar' ? '| الإصدار ' : '| v'}{plan.version}</p>
                                                </div>
                                                <span className={`badge ${statusBadgeClass(plan.status)} rounded-sm`}>{plan.status}</span>
                                            </div>
                                            <div className="rounded-sm p-2 text-sm text-muted-foreground max-h-44 overflow-y-auto bg-muted/30 border border-border space-y-1.5">
                                                {renderGroupedPreview(plan, expandedAssignedPlanId === plan.id)}
                                            </div>
                                            <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-border">
                                                {plan.status !== 'ARCHIVED' && <button onClick={() => handleArchive(plan.id)} className="btn-ghost text-xs min-h-11"><Archive size={14} /> {txt.archive}</button>}
                                                <button onClick={() => handleEditClick(plan)} className="btn-ghost text-xs min-h-11"><Pencil size={14} /> {txt.edit}</button>
                                                <button onClick={() => handleDelete(plan.id)} className="btn-ghost text-xs min-h-11 text-destructive hover:text-destructive/80"><Trash2 size={14} /> {txt.unassign}</button>
                                            </div>
                                            <div className="border-t border-border pt-2 mt-2">
                                                <PlanDetailsToggle
                                                    expanded={expandedAssignedPlanId === plan.id}
                                                    onClick={() => setExpandedAssignedPlanId((prev) => (prev === plan.id ? null : plan.id))}
                                                    size="sm"
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    {assignedPlans.length === 0 && <div className="text-center py-8 text-muted-foreground text-sm">{txt.noAssignedPlans}</div>}
                </div>
            </div>

            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title={editingPlan ? (locale === 'ar' ? 'تعديل خطة التمرين' : 'Edit Workout Plan') : (locale === 'ar' ? 'إنشاء خطة تمرين جديدة' : 'Create New Workout Plan')}
                maxWidthClassName="max-w-3xl"
            >
                <form onSubmit={handleModalSubmit} className="space-y-5">
                    <div className="flex items-center gap-2 text-xs">
                        <span className={`rounded-sm border px-2 py-1 ${modalStep === 1 ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>{txt.step1}</span>
                        <span className={`rounded-sm border px-2 py-1 ${modalStep === 2 ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>{txt.step2}</span>
                    </div>

                    {modalStep === 1 && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <input type="text" required className="input-dark" value={planName} onChange={e => setPlanName(e.target.value)} placeholder={txt.planName} />
                                <input type="text" className="input-dark" value={planDesc} onChange={e => setPlanDesc(e.target.value)} placeholder={txt.description} />
                                <select className="input-dark" value={planStatus} onChange={e => setPlanStatus(e.target.value as Plan['status'])}>
                                    <option value="DRAFT">{txt.draft}</option>
                                    <option value="PUBLISHED">{txt.published}</option>
                                    <option value="ARCHIVED">{txt.archived}</option>
                                </select>
                                <input type="number" min={1} max={60} className="input-dark" value={expectedSessions30d} onChange={e => setExpectedSessions30d(parseInt(e.target.value) || 12)} placeholder={txt.expectedSessions} />
                            </div>
                            {!editingPlan && members.length > 0 && (
                                <MemberSearchSelect
                                    members={members}
                                    value={assignedMemberId}
                                    onChange={setAssignedMemberId}
                                    allowClear={true}
                                    clearLabel={txt.unassignedTemplate}
                                    placeholder={txt.searchMemberLong}
                                />
                            )}
                        </div>
                    )}

                    {modalStep === 2 && (
                        <div className="space-y-4">
                            <div className="p-4 rounded-sm border border-border bg-muted/20 space-y-3">
                                <div className="flex gap-2">
                                    <input type="text" className="input-dark" value={sectionNameInput} onChange={e => setSectionNameInput(e.target.value)} placeholder={txt.sectionName} />
                                    <button type="button" className="btn-primary min-h-11" onClick={addSection}><Plus size={16} /> {txt.addSection}</button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {sections.map(section => (
                                        <div key={section.id} className={`flex items-center gap-2 px-3 py-1.5 border rounded-sm ${activeSectionId === section.id ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
                                            <button type="button" onClick={() => setActiveSectionId(section.id)}>{section.name}</button>
                                            <button type="button" onClick={() => removeSection(section.id)} className="text-destructive"><Trash2 size={12} /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="p-4 rounded-sm border border-border bg-muted/20 space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-xs font-medium text-muted-foreground">{txt.exerciseBuilder}</p>
                                    <button type="button" className="btn-ghost text-xs min-h-11" onClick={() => setLibraryOpen(prev => !prev)}>
                                        <Dumbbell size={14} /> {libraryOpen ? txt.hideLibrary : txt.addFromLibrary}
                                    </button>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    {txt.fullLibraryQuestion} <Link href="/dashboard/coach/library" className="text-primary hover:underline">{txt.openWorkoutDietLibrary}</Link>.
                                </p>
                                {libraryOpen && (
                                    <div className="rounded-sm border border-border bg-card/50 p-3 space-y-2">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                className="input-dark"
                                                placeholder={txt.searchLibrary}
                                                value={libraryQuery}
                                                onChange={e => setLibraryQuery(e.target.value)}
                                            />
                                            <button type="button" className="btn-ghost text-xs min-h-11" onClick={() => fetchExerciseLibrary(libraryQuery)}>{txt.search}</button>
                                        </div>
                                        {recentLibraryItems.length > 0 && (
                                            <div className="space-y-1">
                                                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{txt.recent}</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {recentLibraryItems.map(item => (
                                                        <button key={`recent-${item.id}`} type="button" className="btn-ghost text-xs" onClick={() => applyLibraryItem(item)}>{item.name}</button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div className="max-h-40 overflow-y-auto border border-border rounded-sm divide-y divide-border">
                                            {libraryItems.map(item => (
                                                <button key={item.id} type="button" className="w-full text-start px-3 py-2 hover:bg-muted/30" onClick={() => applyLibraryItem(item)}>
                                                    <p className="text-sm text-foreground">{item.name}</p>
                                                    <p className="text-xs text-muted-foreground">{[item.category, item.muscle_group, item.equipment].filter(Boolean).join(' | ')}</p>
                                                </button>
                                            ))}
                                            {libraryItems.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">{txt.noLibraryItems}</p>}
                                        </div>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                    <input type="text" className="input-dark md:col-span-2" value={currentExerciseName} onChange={e => setCurrentExerciseName(e.target.value)} placeholder={txt.exerciseName} />
                                    <input type="number" className="input-dark text-center" value={currentSets} min={1} onChange={e => setCurrentSets(parseInt(e.target.value) || 1)} />
                                    <input type="number" className="input-dark text-center" value={currentReps} min={1} onChange={e => setCurrentReps(parseInt(e.target.value) || 1)} />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <select className="input-dark" value={currentVideoType} onChange={e => setCurrentVideoType(e.target.value as VideoType)}>
                                        <option value="">{txt.noVideo}</option>
                                        <option value="EMBED">{txt.embedUrl}</option>
                                        <option value="UPLOAD">{txt.uploadVideo}</option>
                                    </select>
                                    {currentVideoType === 'EMBED' && <input type="url" className="input-dark md:col-span-2" value={currentVideoUrl} onChange={e => setCurrentVideoUrl(e.target.value)} placeholder={locale === 'ar' ? 'https://youtube.com/...' : 'https://youtube.com/...'} />}
                                    {currentVideoType === 'UPLOAD' && <input type="file" accept="video/*" className="input-dark md:col-span-2" onChange={e => setCurrentVideoFile(e.target.files?.[0] || null)} />}
                                </div>
                                <button type="button" onClick={addExerciseToSection} className="btn-primary min-h-11"><Plus size={16} /> {txt.addExercise}</button>
                            </div>

                            <div className="space-y-3">
                                {sections.map(section => (
                                    <div key={section.id} className="border border-border rounded-sm p-3">
                                        <p className="text-sm font-semibold text-primary mb-2">{section.name}</p>
                                        {section.exercises.length === 0 && <p className="text-xs text-muted-foreground">{txt.noExercisesInSection}</p>}
                                        {section.exercises.map((ex, idx) => (
                                            <div key={idx} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 border border-border p-3 rounded-sm text-sm bg-muted/10 mb-2">
                                                <div>
                                                    <p className="font-medium text-foreground">{getExerciseDisplayName(ex)}</p>
                                                    <p className="text-xs text-muted-foreground">{ex.sets} x {ex.reps}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {resolveVideoUrl(ex) && <span className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs text-muted-foreground"><Video size={12} /> {txt.added}</span>}
                                                    <button type="button" onClick={() => saveExerciseAsReusable(ex)} className="btn-ghost !px-2 !py-1 h-auto text-xs">{txt.saveReusable}</button>
                                                    <button type="button" onClick={() => removeExerciseFromSection(section.id, idx)} className="text-muted-foreground hover:text-destructive"><Trash2 size={16} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-border">
                        <button type="button" onClick={() => setShowModal(false)} className="btn-ghost min-h-11">{txt.cancel}</button>
                        {modalStep === 2 && (
                            <button type="button" onClick={() => setModalStep(1)} className="btn-ghost min-h-11">{txt.back}</button>
                        )}
                        {modalStep === 1 ? (
                            <button type="submit" className="btn-primary min-h-11">{txt.next}</button>
                        ) : (
                            <button type="submit" className="btn-primary min-h-11"><Save size={16} /> {editingPlan ? (locale === 'ar' ? 'تحديث الخطة' : 'Update Plan') : (locale === 'ar' ? 'حفظ الخطة' : 'Save Plan')}</button>
                        )}
                    </div>
                </form>
            </Modal>

            {videoPopup && (
                <div className="fixed inset-0 z-[100] bg-background/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
                    <div className="w-full max-w-4xl rounded-sm border border-border bg-card shadow-lg overflow-hidden">
                        <div className="flex items-center justify-between border-b border-border px-3 py-2 sm:px-4 sm:py-3">
                            <h3 className="text-sm sm:text-base font-semibold text-foreground truncate ltr:pr-3 rtl:pl-3">{videoPopup.title}</h3>
                            <button
                                type="button"
                                onClick={() => setVideoPopup(null)}
                                className="inline-flex items-center justify-center rounded-sm p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
                                aria-label={txt.closeVideo}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-3 sm:p-4">
                            {videoPopup.youtubeEmbedUrl ? (
                                <div className="aspect-video w-full rounded-sm overflow-hidden border border-border bg-black">
                                    <iframe
                                        src={`${videoPopup.youtubeEmbedUrl}?rel=0&playsinline=1&autoplay=1`}
                                        title={`${videoPopup.title} video`}
                                        className="h-full w-full"
                                        loading="lazy"
                                        referrerPolicy="strict-origin-when-cross-origin"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                        allowFullScreen
                                    />
                                </div>
                            ) : videoPopup.videoUrl ? (
                                <video controls playsInline src={videoPopup.videoUrl} className="w-full max-h-[70vh] rounded-sm border border-border bg-black" />
                            ) : (
                                <div className="rounded-sm border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                                    {txt.cannotPreview}
                                    {videoPopup.externalUrl && (
                                        <div className="mt-2">
                                            <a
                                                href={videoPopup.externalUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20"
                                            >
                                                {txt.openSource}
                                            </a>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <Modal
                isOpen={assignModalOpen}
                onClose={() => setAssignModalOpen(false)}
                title={`${txt.assignPrefix} ${assigningPlan?.name}`}
                maxWidthClassName="max-w-2xl"
            >
                <form onSubmit={handleAssignSubmit} className="space-y-4">
                    {assigningPlan && (() => {
                        const summary = getPlanSummary(assigningPlan.id);
                        return (
                            <AssignPlanSummaryPanel
                                planName={assigningPlan.name}
                                status={assigningPlan.status}
                                statusBadgeClass={statusBadgeClass(assigningPlan.status)}
                                summaryLine={summary ? `${summary.total_sections} ${txt.sections} | ${summary.total_exercises} ${txt.exercises} | ${summary.total_videos} ${locale === 'ar' ? 'فيديوهات' : 'videos'}` : `${assigningPlan.exercises.length} ${txt.exercises}`}
                                previewSections={summary?.preview_sections || []}
                                draftWarning={assigningPlan.status === 'DRAFT' ? txt.warningDraftAssign : undefined}
                                archivedWarning={assigningPlan.status === 'ARCHIVED' ? txt.archivedCannotAssign : undefined}
                            />
                        );
                    })()}

                    <div className="space-y-2">
                        <label className="block text-xs font-medium text-muted-foreground">{txt.assignMembersLabel}</label>
                        <input
                            type="text"
                            className="input-dark"
                            placeholder={txt.searchMember}
                            value={memberSearch}
                            onChange={e => setMemberSearch(e.target.value)}
                        />
                        <div className="max-h-56 overflow-y-auto border border-border rounded-sm divide-y divide-border">
                            {filteredMembers.map(member => {
                                const checked = bulkAssignMemberIds.includes(member.id);
                                return (
                                    <label key={member.id} className="flex items-center justify-between px-3 py-2 text-sm">
                                        <div className="min-w-0">
                                            <p className="text-foreground truncate">{member.full_name}</p>
                                            <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => setBulkAssignMemberIds(prev => checked ? prev.filter(id => id !== member.id) : [...prev, member.id])}
                                        />
                                    </label>
                                );
                            })}
                        </div>
                        <p className="text-xs text-muted-foreground">{txt.replaceActiveNote}</p>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border"><button type="button" onClick={() => setAssignModalOpen(false)} className="btn-ghost">{txt.cancel}</button><button type="submit" disabled={assigningPlan?.status === 'ARCHIVED'} className="btn-primary disabled:opacity-40"><UserPlus size={16} /> {txt.assignPlan}</button></div>
                </form>
            </Modal>
        </div>
    );
}




