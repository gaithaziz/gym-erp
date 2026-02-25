'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { Plus, Dumbbell, Trash2, ChevronDown, ChevronUp, UserPlus, Pencil, Save, X, Video, PlayCircle, RefreshCw, Send } from 'lucide-react';
import Modal from '@/components/Modal';
import { useFeedback } from '@/components/FeedbackProvider';
import MemberSearchSelect from '@/components/MemberSearchSelect';

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
    const { showToast, confirm: confirmAction } = useFeedback();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [planSummaries, setPlanSummaries] = useState<PlanSummary[]>([]);
    const [adherenceRows, setAdherenceRows] = useState<PlanAdherenceRow[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [showModal, setShowModal] = useState(false);
    const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
    const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
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
            showToast('Failed to load workout plans.', 'error');
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
            showToast('At least one section is required.', 'error');
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
        if (!name) { showToast('Exercise name is required.', 'error'); return; }

        let uploadedVideoUrl: string | null = null;
        if (currentVideoType === 'UPLOAD') {
            if (!currentVideoFile) { showToast('Please choose a video file to upload.', 'error'); return; }
            try { uploadedVideoUrl = await uploadVideo(currentVideoFile); }
            catch { showToast('Failed to upload video.', 'error'); return; }
        }
        if (currentVideoType === 'EMBED' && !currentVideoUrl.trim()) {
            showToast('Embed URL is required when video type is Embed.', 'error');
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
            showToast('Saved to your reusable library.', 'success');
            fetchExerciseLibrary(libraryQuery);
        } catch {
            showToast('Failed to save reusable exercise.', 'error');
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
        setShowModal(true);
        fetchExerciseLibrary();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const exercises = flattenExercises();
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
        const confirmed = await confirmAction({ title: 'Delete Workout Plan', description: 'Are you sure you want to delete this plan?', confirmText: 'Delete', destructive: true });
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

    const toggleExpand = (planId: string) => setExpandedPlan(expandedPlan === planId ? null : planId);

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
                                    title="Play exercise video"
                                >
                                    <PlayCircle size={14} />
                                    Watch
                                </button>
                            ) : (
                                <a
                                    href={videoUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20"
                                    title="Open exercise video"
                                >
                                    <Video size={14} />
                                    Open
                                </a>
                            )
                        )}
                    </div>
                </div>
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

    const renderGrouped = (plan: Plan, compact: boolean) => {
        const grouped = groupExercises(plan.exercises);
        const entries = Object.entries(grouped);
        if (compact) {
            return (
                <div className="space-y-3">
                    {entries.map(([sec, exs]) => (
                        <div key={sec} className="rounded-sm border border-border/80 bg-muted/10 px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-[11px] uppercase tracking-wider text-primary font-semibold">{sec}</p>
                                <span className="text-[11px] font-mono text-muted-foreground">{exs.length} workouts</span>
                            </div>
                        </div>
                    ))}
                </div>
            );
        }
        return (
            <div className="space-y-3">
                {entries.map(([sec, exs]) => (
                    <div key={sec} className="rounded-sm border border-primary/25 bg-primary/5 p-2.5 sm:p-3 space-y-2">
                        <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">{sec}</p>
                        {exs.map((ex, i) => renderExerciseLine(ex, `${plan.id}-${sec}-${i}`))}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Workout Plans</h1>
                    <p className="text-sm text-muted-foreground mt-1">Create section-based workout splits with manual exercises and videos</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={fetchData} className="btn-ghost min-h-11" title="Refresh">
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh
                    </button>
                    <button onClick={handleOpenCreateModal} className="btn-primary min-h-11"><Plus size={18} /> Create Plan</button>
                </div>
            </div>

            {adherenceRows.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {adherenceRows.slice(0, 3).map(row => (
                        <div key={row.plan_id} className="rounded-sm border border-border bg-muted/20 p-3">
                            <p className="text-sm font-semibold text-foreground truncate">{row.plan_name}</p>
                            <p className="text-xs text-muted-foreground mt-1">{row.adherent_members}/{row.assigned_members} adherent (30d)</p>
                            <p className="text-lg font-bold text-primary mt-1">{row.adherence_percent}%</p>
                        </div>
                    ))}
                </div>
            )}

            {lastBulkAssignSnapshot && (
                <div className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <p className="text-sm font-semibold text-foreground">Last Bulk Assign Check</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        {lastBulkAssignSnapshot.planName} | {new Date(lastBulkAssignSnapshot.capturedAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-foreground mt-2">
                        Assigned: <span className="font-semibold">{lastBulkAssignSnapshot.assignedMembers}</span> | Adherent (30d): <span className="font-semibold">{lastBulkAssignSnapshot.adherentMembers}</span> | Score: <span className="font-semibold text-primary">{lastBulkAssignSnapshot.adherencePercent}%</span>
                    </p>
                </div>
            )}

            <div className="space-y-3">
                <h2 className="text-xl font-bold text-foreground">Workout Templates</h2>
                <div className="flex flex-wrap gap-2">
                    {templateStatusFilters.map(status => (
                        <button
                            key={status}
                            type="button"
                            onClick={() => setSelectedTemplateStatus(status)}
                            className={`min-h-11 rounded-sm border px-3 py-2 text-xs font-medium ${
                                selectedTemplateStatus === status
                                    ? 'border-primary bg-primary/15 text-primary'
                                    : 'border-border bg-muted/20 text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {status === 'ALL' ? 'All Statuses' : status}
                        </button>
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTemplatePlans.map((plan) => (
                    <div key={plan.id} className="kpi-card group relative">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">{plan.name}</h3>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{plan.description}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <span className={`badge ${statusBadgeClass(plan.status)} rounded-sm`}>{plan.status}</span>
                                <span className="badge badge-orange rounded-sm">{plan.exercises?.length || 0} Ex</span>
                            </div>
                        </div>
                        {expandedPlan === plan.id ? (
                            <div className="mb-4 space-y-2">{renderGrouped(plan, false)}</div>
                        ) : (
                            <div className="space-y-2 mb-4">{renderGrouped(plan, true)}</div>
                        )}
                        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border sticky bottom-0 bg-card/95 backdrop-blur-sm">
                            <button disabled={plan.status === 'ARCHIVED'} onClick={() => handleEditClick(plan)} className="flex-1 min-w-[90px] min-h-11 btn-ghost text-xs py-2 h-auto hover:text-blue-400 disabled:opacity-40"><Pencil size={14} /> Edit</button>
                            <button disabled={plan.status === 'ARCHIVED'} onClick={() => openAssign(plan)} className="flex-1 min-w-[90px] min-h-11 btn-ghost text-xs py-2 h-auto hover:text-green-400 disabled:opacity-40"><UserPlus size={14} /> Assign</button>
                            {plan.status === 'DRAFT' && <button onClick={() => handlePublish(plan.id)} className="flex-1 min-w-[90px] min-h-11 btn-ghost text-xs py-2 h-auto hover:text-emerald-400"><Send size={14} /> Publish</button>}
                            {plan.status !== 'ARCHIVED' && <button onClick={() => handleArchive(plan.id)} className="flex-1 min-w-[90px] min-h-11 btn-ghost text-xs py-2 h-auto hover:text-yellow-400"><Trash2 size={14} /> Archive</button>}
                            <button onClick={() => handleDelete(plan.id)} className="flex-1 min-w-[90px] btn-ghost text-xs py-2 h-auto text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 size={14} /> Del</button>
                        </div>
                        <div className="border-t border-border pt-3"><button onClick={() => toggleExpand(plan.id)} className="text-primary text-sm font-medium hover:text-primary/80 transition-colors flex items-center gap-1">{expandedPlan === plan.id ? <><ChevronUp size={16} /> Collapse</> : <><ChevronDown size={16} /> View Details</>}</button></div>
                    </div>
                ))}
                {filteredTemplatePlans.length === 0 && (
                    <div className="col-span-full text-center py-16 chart-card border-dashed !border-border">
                                <Dumbbell size={40} className="mx-auto text-muted-foreground mb-3" />
                                <p className="text-muted-foreground text-sm">
                                    {templatePlans.length === 0
                                        ? 'No workout templates yet. Create your first one!'
                                        : 'No templates match this status filter.'}
                                </p>
                            </div>
                        )}
            </div>

            <h2 className="text-xl font-bold text-foreground mt-8">Active Assigned Plans</h2>
            <div className="space-y-4">
                {assignedPlanGroups.map(group => (
                    <div key={group.rootId} className="kpi-card border border-border/80">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                            <div>
                                <h3 className="text-base sm:text-lg font-bold text-foreground">{group.rootPlanName}</h3>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {group.members.length} member{group.members.length > 1 ? 's' : ''} assigned
                                </p>
                            </div>
                        </div>
                        <div className="mt-3 space-y-2">
                            {group.members.map(plan => {
                                const memberName = members.find(m => m.id === plan.member_id)?.full_name || 'Unknown Member';
                                return (
                                    <div key={plan.id} className="rounded-sm border border-border bg-muted/15 p-3">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-foreground truncate">{memberName}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {plan.exercises?.length || 0} exercises | v{plan.version}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`badge ${statusBadgeClass(plan.status)} rounded-sm`}>{plan.status}</span>
                                                <button onClick={() => handleEditClick(plan)} className="min-h-11 btn-ghost text-xs py-2 h-auto hover:text-blue-400">
                                                    <Pencil size={14} /> Edit
                                                </button>
                                                <button onClick={() => handleDelete(plan.id)} className="min-h-11 btn-ghost text-xs py-2 h-auto text-destructive hover:text-destructive hover:bg-destructive/10">
                                                    <Trash2 size={14} /> Unassign
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
                {assignedPlans.length === 0 && <div className="col-span-full text-center py-8 text-muted-foreground text-sm">No active plans assigned to members.</div>}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="rounded-sm border border-border bg-card p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-lg">
                        <div className="flex justify-between items-center mb-5"><h2 className="text-lg font-bold text-foreground">{editingPlan ? 'Edit Workout Plan' : 'Create New Workout Plan'}</h2><button onClick={() => setShowModal(false)}><X size={20} className="text-muted-foreground" /></button></div>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <input type="text" required className="input-dark" value={planName} onChange={e => setPlanName(e.target.value)} placeholder="Plan Name" />
                                <input type="text" className="input-dark" value={planDesc} onChange={e => setPlanDesc(e.target.value)} placeholder="Description" />
                                <select className="input-dark" value={planStatus} onChange={e => setPlanStatus(e.target.value as Plan['status'])}>
                                    <option value="DRAFT">Draft</option>
                                    <option value="PUBLISHED">Published</option>
                                    <option value="ARCHIVED">Archived</option>
                                </select>
                                <input type="number" min={1} max={60} className="input-dark" value={expectedSessions30d} onChange={e => setExpectedSessions30d(parseInt(e.target.value) || 12)} placeholder="Expected sessions / 30d" />
                            </div>
                            {!editingPlan && members.length > 0 && (
                                <MemberSearchSelect
                                    members={members}
                                    value={assignedMemberId}
                                    onChange={setAssignedMemberId}
                                    allowClear={true}
                                    clearLabel="Unassigned (template)"
                                    placeholder="Search member by name or email..."
                                />
                            )}
                            <div className="p-4 rounded-sm border border-border bg-muted/20 space-y-3"><div className="flex gap-2"><input type="text" className="input-dark" value={sectionNameInput} onChange={e => setSectionNameInput(e.target.value)} placeholder="Section name" /><button type="button" className="btn-primary" onClick={addSection}><Plus size={16} /> Add Section</button></div><div className="flex flex-wrap gap-2">{sections.map(section => <div key={section.id} className={`flex items-center gap-2 px-3 py-1.5 border rounded-sm ${activeSectionId === section.id ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground'}`}><button type="button" onClick={() => setActiveSectionId(section.id)}>{section.name}</button><button type="button" onClick={() => removeSection(section.id)} className="text-destructive"><Trash2 size={12} /></button></div>)}</div></div>
                            <div className="p-4 rounded-sm border border-border bg-muted/20 space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-xs font-medium text-muted-foreground">Exercise Builder</p>
                                    <button type="button" className="btn-ghost text-xs min-h-11" onClick={() => setLibraryOpen(prev => !prev)}>
                                        <Dumbbell size={14} /> {libraryOpen ? 'Hide Library' : 'Add from Library'}
                                    </button>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    Need full library management? <Link href="/dashboard/coach/library" className="text-primary hover:underline">Open Workout & Diet Library</Link>.
                                </p>
                                {libraryOpen && (
                                    <div className="rounded-sm border border-border bg-card/50 p-3 space-y-2">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                className="input-dark"
                                                placeholder="Search by name, muscle, equipment..."
                                                value={libraryQuery}
                                                onChange={e => setLibraryQuery(e.target.value)}
                                            />
                                            <button type="button" className="btn-ghost text-xs min-h-11" onClick={() => fetchExerciseLibrary(libraryQuery)}>Search</button>
                                        </div>
                                        {recentLibraryItems.length > 0 && (
                                            <div className="space-y-1">
                                                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Recent</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {recentLibraryItems.map(item => (
                                                        <button key={`recent-${item.id}`} type="button" className="btn-ghost text-xs" onClick={() => applyLibraryItem(item)}>{item.name}</button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div className="max-h-40 overflow-y-auto border border-border rounded-sm divide-y divide-border">
                                            {libraryItems.map(item => (
                                                <button key={item.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted/30" onClick={() => applyLibraryItem(item)}>
                                                    <p className="text-sm text-foreground">{item.name}</p>
                                                    <p className="text-xs text-muted-foreground">{[item.category, item.muscle_group, item.equipment].filter(Boolean).join(' | ')}</p>
                                                </button>
                                            ))}
                                            {libraryItems.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No library items found.</p>}
                                        </div>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3"><input type="text" className="input-dark md:col-span-2" value={currentExerciseName} onChange={e => setCurrentExerciseName(e.target.value)} placeholder="Exercise name" /><input type="number" className="input-dark text-center" value={currentSets} min={1} onChange={e => setCurrentSets(parseInt(e.target.value) || 1)} /><input type="number" className="input-dark text-center" value={currentReps} min={1} onChange={e => setCurrentReps(parseInt(e.target.value) || 1)} /></div><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><select className="input-dark" value={currentVideoType} onChange={e => setCurrentVideoType(e.target.value as VideoType)}><option value="">No Video</option><option value="EMBED">Embed URL</option><option value="UPLOAD">Upload Video</option></select>{currentVideoType === 'EMBED' && <input type="url" className="input-dark md:col-span-2" value={currentVideoUrl} onChange={e => setCurrentVideoUrl(e.target.value)} placeholder="https://youtube.com/..." />}{currentVideoType === 'UPLOAD' && <input type="file" accept="video/*" className="input-dark md:col-span-2" onChange={e => setCurrentVideoFile(e.target.files?.[0] || null)} />}</div><button type="button" onClick={addExerciseToSection} className="btn-primary min-h-11"><Plus size={16} /> Add Exercise</button></div>
                            <div className="space-y-3">{sections.map(section => <div key={section.id} className="border border-border rounded-sm p-3"><p className="text-sm font-semibold text-primary mb-2">{section.name}</p>{section.exercises.length === 0 && <p className="text-xs text-muted-foreground">No exercises in this section yet.</p>}{section.exercises.map((ex, idx) => <div key={idx} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 border border-border p-3 rounded-sm text-sm bg-muted/10 mb-2"><div><p className="font-medium text-foreground">{getExerciseDisplayName(ex)}</p><p className="text-xs text-muted-foreground">{ex.sets} x {ex.reps}</p></div><div className="flex items-center gap-2">{resolveVideoUrl(ex) && <span className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs text-muted-foreground"><Video size={12} /> Added</span>}<button type="button" onClick={() => saveExerciseAsReusable(ex)} className="btn-ghost !px-2 !py-1 h-auto text-xs">Save reusable</button><button type="button" onClick={() => removeExerciseFromSection(section.id, idx)} className="text-muted-foreground hover:text-destructive"><Trash2 size={16} /></button></div></div>)}</div>)}</div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-border"><button type="button" onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button><button type="submit" className="btn-primary"><Save size={16} /> {editingPlan ? 'Update Plan' : 'Save Plan'}</button></div>
                        </form>
                    </div>
                </div>
            )}

            {videoPopup && (
                <div className="fixed inset-0 z-[100] bg-background/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
                    <div className="w-full max-w-4xl rounded-sm border border-border bg-card shadow-lg overflow-hidden">
                        <div className="flex items-center justify-between border-b border-border px-3 py-2 sm:px-4 sm:py-3">
                            <h3 className="text-sm sm:text-base font-semibold text-foreground truncate pr-3">{videoPopup.title}</h3>
                            <button
                                type="button"
                                onClick={() => setVideoPopup(null)}
                                className="inline-flex items-center justify-center rounded-sm p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
                                aria-label="Close video"
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
                                    Unable to preview this source in popup.
                                    {videoPopup.externalUrl && (
                                        <div className="mt-2">
                                            <a
                                                href={videoPopup.externalUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20"
                                            >
                                                Open Source
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
                title={`Assign: ${assigningPlan?.name}`}
                maxWidthClassName="max-w-2xl"
            >
                <form onSubmit={handleAssignSubmit} className="space-y-4">
                    {assigningPlan && (() => {
                        const summary = getPlanSummary(assigningPlan.id);
                        return (
                            <div className="rounded-sm border border-border bg-muted/20 p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-foreground">{assigningPlan.name}</p>
                                    <span className={`badge ${statusBadgeClass(assigningPlan.status)}`}>{assigningPlan.status}</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {summary ? `${summary.total_sections} sections | ${summary.total_exercises} exercises | ${summary.total_videos} videos` : `${assigningPlan.exercises.length} exercises`}
                                </p>
                                {summary && summary.preview_sections.length > 0 && (
                                    <div className="space-y-1">
                                        {summary.preview_sections.map(sec => (
                                            <p key={sec.section_name} className="text-xs text-muted-foreground">
                                                <span className="text-primary font-medium">{sec.section_name}:</span> {sec.exercise_names.join(', ')}
                                            </p>
                                        ))}
                                    </div>
                                )}
                                {assigningPlan.status === 'DRAFT' && <p className="text-xs text-yellow-400">Warning: you are assigning a draft plan.</p>}
                                {assigningPlan.status === 'ARCHIVED' && <p className="text-xs text-destructive">Archived plans cannot be assigned.</p>}
                            </div>
                        );
                    })()}

                    <div className="space-y-2">
                        <label className="block text-xs font-medium text-muted-foreground">Members (bulk assign supported)</label>
                        <input
                            type="text"
                            className="input-dark"
                            placeholder="Search member by name/email..."
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
                        <p className="text-xs text-muted-foreground">Replace-active mode is enabled: existing active plans for selected members will be archived.</p>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border"><button type="button" onClick={() => setAssignModalOpen(false)} className="btn-ghost">Cancel</button><button type="submit" disabled={assigningPlan?.status === 'ARCHIVED'} className="btn-primary disabled:opacity-40"><UserPlus size={16} /> Assign Plan</button></div>
                </form>
            </Modal>
        </div>
    );
}

