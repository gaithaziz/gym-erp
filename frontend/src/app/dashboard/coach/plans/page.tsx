'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Dumbbell, Trash2, ChevronDown, ChevronUp, UserPlus, Pencil, Save, X, Video } from 'lucide-react';
import Modal from '@/components/Modal';
import { useFeedback } from '@/components/FeedbackProvider';

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
    exercises: WorkoutExerciseItem[];
    member_id?: string | null;
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
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);

    const [showModal, setShowModal] = useState(false);
    const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
    const [expandedPlan, setExpandedPlan] = useState<string | null>(null);

    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [assigningPlan, setAssigningPlan] = useState<Plan | null>(null);
    const [assignMemberId, setAssignMemberId] = useState('');

    const [planName, setPlanName] = useState('');
    const [planDesc, setPlanDesc] = useState('');
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

    const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');

    const resolveVideoUrl = (exercise: WorkoutExerciseItem) => {
        if (exercise.video_type === 'EMBED' && exercise.video_url) return exercise.video_url;
        if (exercise.video_type === 'UPLOAD' && exercise.uploaded_video_url) {
            return exercise.uploaded_video_url.startsWith('http')
                ? exercise.uploaded_video_url
                : `${apiBase}${exercise.uploaded_video_url}`;
        }
        return null;
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
        try {
            const plansRes = await api.get('/fitness/plans');
            setPlans(plansRes.data.data);
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
    }, [showToast]);

    useEffect(() => {
        setTimeout(() => fetchData(), 0);
        const intervalId = window.setInterval(() => { fetchData(); }, 15000);
        return () => window.clearInterval(intervalId);
    }, [fetchData]);

    const resetForm = () => {
        const defaultSection = { id: makeId(), name: 'General', exercises: [] };
        setEditingPlan(null);
        setPlanName('');
        setPlanDesc('');
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

    const flattenExercises = () => {
        const all: WorkoutExerciseItem[] = [];
        sections.forEach(section => section.exercises.forEach(exercise => all.push({ ...exercise, section_name: section.name })));
        return all.map((exercise, index) => ({ ...exercise, order: index + 1 }));
    };

    const handleEditClick = (plan: Plan) => {
        setEditingPlan(plan);
        setPlanName(plan.name);
        setPlanDesc(plan.description || '');
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

    const openAssign = (plan: Plan) => { setAssigningPlan(plan); setAssignMemberId(''); setAssignModalOpen(true); };

    const handleAssignSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assigningPlan || !assignMemberId) return;
        try {
            const payload = {
                name: assigningPlan.name,
                description: assigningPlan.description,
                member_id: assignMemberId,
                exercises: assigningPlan.exercises.map((ex, i) => ({
                    exercise_id: ex.exercise?.id || ex.exercise_id || undefined,
                    exercise_name: ex.exercise_name || ex.exercise?.name,
                    section_name: ex.section_name,
                    sets: ex.sets,
                    reps: ex.reps,
                    order: i + 1,
                    video_type: ex.video_type || undefined,
                    video_url: ex.video_url || undefined,
                    uploaded_video_url: ex.uploaded_video_url || undefined,
                }))
            };
            await api.post('/fitness/plans', payload);
            setAssignModalOpen(false);
            showToast(`Plan assigned to ${members.find(m => m.id === assignMemberId)?.full_name}`, 'success');
            fetchData();
        } catch { showToast('Failed to assign plan.', 'error'); }
    };

    const handleDelete = async (planId: string) => {
        const confirmed = await confirmAction({ title: 'Delete Workout Plan', description: 'Are you sure you want to delete this plan?', confirmText: 'Delete', destructive: true });
        if (!confirmed) return;
        try { await api.delete(`/fitness/plans/${planId}`); showToast('Plan deleted.', 'success'); fetchData(); }
        catch (error) { showToast(getErrorMessage(error, 'Failed to delete plan'), 'error'); }
    };

    const toggleExpand = (planId: string) => setExpandedPlan(expandedPlan === planId ? null : planId);

    const renderExerciseLine = (ex: WorkoutExerciseItem, key: string | number) => {
        const videoUrl = resolveVideoUrl(ex);
        return (
            <div key={key} className="flex items-center justify-between text-xs px-3 py-1.5 rounded-sm bg-muted/30 border border-border gap-2">
                <span className="text-foreground font-medium truncate">{getExerciseDisplayName(ex)}</span>
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-mono">{ex.sets}x{ex.reps}</span>
                    {videoUrl && (
                        <button type="button" onClick={() => window.open(videoUrl, '_blank')} className="text-primary hover:text-primary/80" title="Open exercise video">
                            <Video size={14} />
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const templatePlans = useMemo(() => plans.filter(p => !p.member_id), [plans]);
    const assignedPlans = useMemo(() => plans.filter(p => p.member_id), [plans]);

    if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

    const renderGrouped = (plan: Plan, compact: boolean) => {
        const grouped = groupExercises(plan.exercises);
        const entries = Object.entries(grouped);
        const flat = entries.flatMap(([, exs]) => exs);
        if (compact) return <div className="space-y-2">{flat.slice(0, 3).map((ex, i) => renderExerciseLine(ex, i))}{flat.length > 3 && <p className="text-[10px] text-center text-muted-foreground font-mono uppercase tracking-wider">+{flat.length - 3} more</p>}</div>;
        return <div className="space-y-2">{entries.map(([sec, exs]) => <div key={sec} className="space-y-2"><p className="text-[10px] uppercase tracking-wider text-primary font-semibold">{sec}</p>{exs.map((ex, i) => renderExerciseLine(ex, `${sec}-${i}`))}</div>)}</div>;
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Workout Plans</h1>
                    <p className="text-sm text-muted-foreground mt-1">Create section-based workout splits with manual exercises and videos</p>
                </div>
                <button onClick={handleOpenCreateModal} className="btn-primary"><Plus size={18} /> Create Plan</button>
            </div>

            <h2 className="text-xl font-bold text-foreground">Workout Templates</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templatePlans.map((plan) => (
                    <div key={plan.id} className="kpi-card group relative">
                        <div className="flex justify-between items-start mb-4"><div><h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">{plan.name}</h3><p className="text-xs text-muted-foreground mt-1 line-clamp-2">{plan.description}</p></div><span className="badge badge-orange rounded-sm">{plan.exercises?.length || 0} Ex</span></div>
                        <div className="space-y-2 mb-4">{renderGrouped(plan, true)}</div>
                        {expandedPlan === plan.id && <div className="mb-4 space-y-2 border-t border-border pt-3">{renderGrouped(plan, false)}</div>}
                        <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                            <button onClick={() => handleEditClick(plan)} className="flex-1 btn-ghost text-xs py-1.5 h-8 hover:text-blue-400"><Pencil size={14} /> Edit</button>
                            <button onClick={() => openAssign(plan)} className="flex-1 btn-ghost text-xs py-1.5 h-8 hover:text-green-400"><UserPlus size={14} /> Assign</button>
                            <button onClick={() => handleDelete(plan.id)} className="flex-1 btn-ghost text-xs py-1.5 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 size={14} /> Del</button>
                        </div>
                        <div className="border-t border-border pt-3"><button onClick={() => toggleExpand(plan.id)} className="text-primary text-sm font-medium hover:text-primary/80 transition-colors flex items-center gap-1">{expandedPlan === plan.id ? <><ChevronUp size={16} /> Collapse</> : <><ChevronDown size={16} /> View Details</>}</button></div>
                    </div>
                ))}
                {templatePlans.length === 0 && <div className="col-span-full text-center py-16 chart-card border-dashed !border-border"><Dumbbell size={40} className="mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground text-sm">No workout templates yet. Create your first one!</p></div>}
            </div>

            <h2 className="text-xl font-bold text-foreground mt-8">Active Assigned Plans</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {assignedPlans.map((plan) => (
                    <div key={plan.id} className="kpi-card group relative border-l-4 border-l-emerald-500">
                        <div className="flex justify-between items-start mb-2"><div><h3 className="text-lg font-bold text-foreground">{plan.name}</h3><div className="text-xs text-muted-foreground mt-1"><span className="text-emerald-500 font-medium">Assigned to: </span>{members.find(m => m.id === plan.member_id)?.full_name || 'Unknown Member'}</div></div><span className="badge badge-gray rounded-sm">{plan.exercises?.length || 0} Ex</span></div>
                        <div className="space-y-2 mt-2">{renderGrouped(plan, true)}</div>
                        <div className="flex gap-2 mt-4 pt-4 border-t border-border"><button onClick={() => handleEditClick(plan)} className="flex-1 btn-ghost text-xs py-1.5 h-8 hover:text-blue-400"><Pencil size={14} /> Edit</button><button onClick={() => handleDelete(plan.id)} className="flex-1 btn-ghost text-xs py-1.5 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 size={14} /> Unassign</button></div>
                    </div>
                ))}
                {assignedPlans.length === 0 && <div className="col-span-full text-center py-8 text-muted-foreground text-sm">No active plans assigned to members.</div>}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="rounded-sm border border-border bg-card p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-lg">
                        <div className="flex justify-between items-center mb-5"><h2 className="text-lg font-bold text-foreground">{editingPlan ? 'Edit Workout Plan' : 'Create New Workout Plan'}</h2><button onClick={() => setShowModal(false)}><X size={20} className="text-muted-foreground" /></button></div>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><input type="text" required className="input-dark" value={planName} onChange={e => setPlanName(e.target.value)} placeholder="Plan Name" /><input type="text" className="input-dark" value={planDesc} onChange={e => setPlanDesc(e.target.value)} placeholder="Description" /></div>
                            {!editingPlan && members.length > 0 && <select className="input-dark" value={assignedMemberId} onChange={e => setAssignedMemberId(e.target.value)}><option value="">Unassigned (template)</option>{members.map(m => <option key={m.id} value={m.id}>{m.full_name} - {m.email}</option>)}</select>}
                            <div className="p-4 rounded-sm border border-border bg-muted/20 space-y-3"><div className="flex gap-2"><input type="text" className="input-dark" value={sectionNameInput} onChange={e => setSectionNameInput(e.target.value)} placeholder="Section name" /><button type="button" className="btn-primary" onClick={addSection}><Plus size={16} /> Add Section</button></div><div className="flex flex-wrap gap-2">{sections.map(section => <div key={section.id} className={`flex items-center gap-2 px-3 py-1.5 border rounded-sm ${activeSectionId === section.id ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground'}`}><button type="button" onClick={() => setActiveSectionId(section.id)}>{section.name}</button><button type="button" onClick={() => removeSection(section.id)} className="text-destructive"><Trash2 size={12} /></button></div>)}</div></div>
                            <div className="p-4 rounded-sm border border-border bg-muted/20 space-y-3"><div className="grid grid-cols-1 md:grid-cols-4 gap-3"><input type="text" className="input-dark md:col-span-2" value={currentExerciseName} onChange={e => setCurrentExerciseName(e.target.value)} placeholder="Exercise name" /><input type="number" className="input-dark text-center" value={currentSets} min={1} onChange={e => setCurrentSets(parseInt(e.target.value) || 1)} /><input type="number" className="input-dark text-center" value={currentReps} min={1} onChange={e => setCurrentReps(parseInt(e.target.value) || 1)} /></div><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><select className="input-dark" value={currentVideoType} onChange={e => setCurrentVideoType(e.target.value as VideoType)}><option value="">No Video</option><option value="EMBED">Embed URL</option><option value="UPLOAD">Upload Video</option></select>{currentVideoType === 'EMBED' && <input type="url" className="input-dark md:col-span-2" value={currentVideoUrl} onChange={e => setCurrentVideoUrl(e.target.value)} placeholder="https://youtube.com/..." />}{currentVideoType === 'UPLOAD' && <input type="file" accept="video/*" className="input-dark md:col-span-2" onChange={e => setCurrentVideoFile(e.target.files?.[0] || null)} />}</div><button type="button" onClick={addExerciseToSection} className="btn-primary"><Plus size={16} /> Add Exercise</button></div>
                            <div className="space-y-3">{sections.map(section => <div key={section.id} className="border border-border rounded-sm p-3"><p className="text-sm font-semibold text-primary mb-2">{section.name}</p>{section.exercises.length === 0 && <p className="text-xs text-muted-foreground">No exercises in this section yet.</p>}{section.exercises.map((ex, idx) => <div key={idx} className="flex justify-between items-center border border-border p-3 rounded-sm text-sm bg-muted/10 mb-2"><div><p className="font-medium text-foreground">{getExerciseDisplayName(ex)}</p><p className="text-xs text-muted-foreground">{ex.sets} x {ex.reps}</p></div><div className="flex items-center gap-2">{resolveVideoUrl(ex) && <button type="button" onClick={() => window.open(resolveVideoUrl(ex) as string, '_blank')} className="btn-ghost !px-2 !py-1 h-auto text-xs"><Video size={12} /> Video</button>}<button type="button" onClick={() => removeExerciseFromSection(section.id, idx)} className="text-muted-foreground hover:text-destructive"><Trash2 size={16} /></button></div></div>)}</div>)}</div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-border"><button type="button" onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button><button type="submit" className="btn-primary"><Save size={16} /> {editingPlan ? 'Update Plan' : 'Save Plan'}</button></div>
                        </form>
                    </div>
                </div>
            )}

            <Modal isOpen={assignModalOpen} onClose={() => setAssignModalOpen(false)} title={`Assign: ${assigningPlan?.name}`}>
                <form onSubmit={handleAssignSubmit} className="space-y-4"><p className="text-sm text-muted-foreground">Select a member to assign this workout plan to. A copy of the plan will be created for them.</p><select required className="input-dark w-full" value={assignMemberId} onChange={e => setAssignMemberId(e.target.value)}><option value="">Select Member...</option>{members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select><div className="flex justify-end gap-3 pt-4 border-t border-border"><button type="button" onClick={() => setAssignModalOpen(false)} className="btn-ghost">Cancel</button><button type="submit" className="btn-primary"><UserPlus size={16} /> Assign Plan</button></div></form>
            </Modal>
        </div>
    );
}
