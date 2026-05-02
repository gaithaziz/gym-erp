'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Search, UserPlus, Save, Shield, Snowflake, RefreshCw, Pencil, Trash2, Eye, EyeOff, Dumbbell, Utensils, MessageCircle } from 'lucide-react';
import Modal from '@/components/Modal';
import { useFeedback } from '@/components/FeedbackProvider';
import TablePagination from '@/components/TablePagination';
import { BranchSelector } from '@/components/BranchSelector';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { resolveProfileImageUrl } from '@/lib/profileImage';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useLocale } from '@/context/LocaleContext';
import SafeResponsiveChart from '@/components/SafeResponsiveChart';
import { getBranchParams } from '@/lib/branch';

interface Member {
    id: string;
    full_name: string;
    email: string;
    role: string;
    home_branch_id?: string | null;
    profile_picture_url?: string;
    phone_number?: string;
    date_of_birth?: string;
    emergency_contact?: string;
    bio?: string;
    subscription: {
        status: string;
        end_date: string | null;
        plan_name?: string | null;
    } | null;
    subscription_plan_name?: string | null;
}

interface WorkoutPlan {
    id: string;
    name: string;
    description?: string | null;
    member_id?: string | null;
    is_template?: boolean;
    status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    total_sections?: number;
    total_exercises?: number;
    total_videos?: number;
    preview_sections?: { section_name: string; exercise_names: string[] }[];
}

interface DietPlan {
    id: string;
    name: string;
    description?: string | null;
    member_id?: string | null;
    status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    version?: number;
    content_length?: number;
    has_structured_content?: boolean;
    description_excerpt?: string | null;
}

interface BiometricLog {
    id: string;
    date: string;
    weight_kg?: number;
    height_cm?: number;
    body_fat_pct?: number;
    muscle_mass_kg?: number;
}

interface WorkoutSessionEntry {
    id: string;
    exercise_name?: string | null;
    sets_completed: number;
    reps_completed: number;
    weight_kg?: number | null;
    notes?: string | null;
    is_pr?: boolean;
    skipped?: boolean;
    set_details?: Array<{ set: number; reps: number; weightKg?: number | null }>;
    entry_volume?: number | null;
}

interface WorkoutSession {
    id: string;
    plan_id: string;
    performed_at: string;
    duration_minutes?: number | null;
    notes?: string | null;
    rpe?: number | null;
    pain_level?: number | null;
    effort_feedback?: 'TOO_EASY' | 'JUST_RIGHT' | 'TOO_HARD' | null;
    attachment_url?: string | null;
    attachment_mime?: string | null;
    entries: WorkoutSessionEntry[];
    session_volume?: number | null;
}

interface StaffMemberDetail {
    member: Member;
    subscription: Member['subscription'];
    active_workout_plans: Array<{ id: string; name: string; status?: string | null }>;
    active_diet_plans: Array<{ id: string; name: string; status?: string | null }>;
    latest_biometric: BiometricLog | null;
    recent_attendance: Array<{ id: string; scan_time: string; status: string; reason: string | null; kiosk_id: string | null }>;
    biometrics: BiometricLog[];
    recent_workout_sessions: WorkoutSession[];
    workout_feedback: Array<{ id: string; plan_id: string; plan_name: string | null; date: string; completed: boolean; difficulty_rating: number | null; comment: string | null }>;
    diet_feedback: Array<{ id: string; diet_plan_id: string; diet_plan_name: string | null; rating: number | null; comment: string | null; created_at: string }>;
    gym_feedback: Array<{ id: string; category: string; rating: number | null; comment: string | null; created_at: string }>;
}

interface BundleChangeLog {
    id: string;
    change_type: string;
    previous_plan_name?: string | null;
    new_plan_name?: string | null;
    previous_start_date?: string | null;
    new_start_date?: string | null;
    previous_end_date?: string | null;
    new_end_date?: string | null;
    note?: string | null;
    created_at?: string | null;
}

interface BundleBenefitAccount {
    id: string;
    perk_key: string;
    perk_label: string;
    period_type: 'MONTHLY' | 'CONTRACT';
    total_allowance: number;
    used_allowance: number;
    remaining_allowance: number;
    contract_ends_at?: string | null;
    is_active: boolean;
}

interface BundleBenefitsResponse {
    summary: {
        total_accounts: number;
        total_remaining: number;
        total_used: number;
    };
    accounts: BundleBenefitAccount[];
}

interface BundlePerkDraft {
    id: string;
    perk_key: string;
    perk_label: string;
    period_type: 'CONTRACT' | 'MONTHLY';
    total_allowance: string;
    monthly_reset_day: string;
    note: string;
}

type RenewalMode = 'period' | 'extend';
type AssignableType = 'WORKOUT' | 'DIET';
type MemberStatusFilter = 'ALL' | 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'NONE';
type WorkoutPlanStatusFilter = 'ALL' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
type DietPlanStatusFilter = 'ALL' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
type ChartRange = '7d' | '30d' | '90d' | 'all';
const MEMBERS_PAGE_SIZE = 10;
const NO_BUNDLE_KEY = '__no_subscription__';

const createBundlePerkDraft = (perk?: Partial<BundlePerkDraft>): BundlePerkDraft => ({
    id: `perk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    perk_key: '',
    perk_label: '',
    period_type: 'CONTRACT',
    total_allowance: '1',
    monthly_reset_day: '',
    note: '',
    ...perk,
});

const getBundleKey = (member: Member) => {
    const rawName = member.subscription?.plan_name?.trim() || member.subscription_plan_name?.trim();
    return rawName || NO_BUNDLE_KEY;
};

const parseSetDetailsVolume = (setDetails?: WorkoutSessionEntry["set_details"] | null) => {
    if (!setDetails?.length) return 0;
    return setDetails.reduce((sum, row) => {
        const reps = Number(row.reps || 0);
        const weight = Number(row.weightKg || 0);
        if (!Number.isFinite(reps) || !Number.isFinite(weight)) return sum;
        return sum + Math.max(0, reps) * Math.max(0, weight);
    }, 0);
};

const todayDateInput = () => new Date().toISOString().split('T')[0];

const addDaysToDateInput = (value: string, days: number) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return value;
    parsed.setUTCDate(parsed.getUTCDate() + days);
    return parsed.toISOString().split('T')[0];
};

const getEntryVolume = (entry: WorkoutSessionEntry) => {
    if (typeof entry.entry_volume === 'number' && Number.isFinite(entry.entry_volume)) return entry.entry_volume;
    const setVolume = parseSetDetailsVolume(entry.set_details);
    if (setVolume > 0) return setVolume;
    if (entry.skipped) return 0;
    return Math.max(0, Number(entry.sets_completed || 0) * Number(entry.reps_completed || 0) * Number(entry.weight_kg || 0));
};

const getSessionVolume = (session: WorkoutSession) => {
    if (typeof session.session_volume === 'number' && Number.isFinite(session.session_volume)) return session.session_volume;
    return (session.entries || []).reduce((sum, entry) => sum + getEntryVolume(entry), 0);
};

const mergeUniqueById = <T extends { id: string }>(...groups: Array<T[] | undefined | null>): T[] => {
    const map = new Map<string, T>();
    groups.flat().forEach((item) => {
        if (item) {
            map.set(item.id, item);
        }
    });
    return Array.from(map.values());
};

const CHART_RANGE_OPTIONS: Array<{ value: ChartRange; days: number | null }> = [
    { value: '7d', days: 7 },
    { value: '30d', days: 30 },
    { value: '90d', days: 90 },
    { value: 'all', days: null },
];

export default function MembersPage() {
    const { t, formatDate, locale } = useLocale();
    const router = useRouter();
    const { user } = useAuth();
    const { branches, selectedBranchId, setSelectedBranchId } = useBranch();
    const initialBranchId = selectedBranchId !== 'all' ? selectedBranchId : branches[0]?.id || '';
    const canManageMembers = ['ADMIN', 'MANAGER', 'RECEPTION', 'FRONT_DESK'].includes(user?.role || '');
    const canAssignPlans = ['ADMIN', 'MANAGER', 'COACH'].includes(user?.role || '');
    const canMessageClient = ['ADMIN', 'COACH'].includes(user?.role || '');
    const { showToast, confirm: confirmAction } = useFeedback();
    const [members, setMembers] = useState<Member[]>([]);
    const [plans, setPlans] = useState<WorkoutPlan[]>([]);
    const [dietPlans, setDietPlans] = useState<DietPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>('ALL');
    const [bundleFilter, setBundleFilter] = useState<string>('ALL');
    const [failedImageUrls, setFailedImageUrls] = useState<Record<string, true>>({});
    const [membersPage, setMembersPage] = useState(1);
    const filterStorageKey = user?.id ? `gym-erp-members-filters-${user.id}` : null;

    // Add Modal
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [addWizardStep, setAddWizardStep] = useState<1 | 2>(1);
    const [showAddPassword, setShowAddPassword] = useState(false);
    const [addForm, setAddForm] = useState({
        full_name: '',
        email: '',
        password: 'password123',
        role: 'CUSTOMER',
        home_branch_id: initialBranchId,
    });

    // Edit Modal
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editForm, setEditForm] = useState({ id: '', full_name: '', email: '' });

    // Subscription Modal
    const [isManageOpen, setIsManageOpen] = useState(false);
    const [manageMember, setManageMember] = useState<Member | null>(null);
    const [bundleChanges, setBundleChanges] = useState<BundleChangeLog[]>([]);
    const [bundleBenefitsSummary, setBundleBenefitsSummary] = useState<BundleBenefitsResponse['summary']>({
        total_accounts: 0,
        total_remaining: 0,
        total_used: 0,
    });
    const [bundleBenefitAccounts, setBundleBenefitAccounts] = useState<BundleBenefitAccount[]>([]);
    const [renewalMode, setRenewalMode] = useState<RenewalMode>('period');
    const [subBundleName, setSubBundleName] = useState('Monthly Membership');
    const [subDurationDays, setSubDurationDays] = useState(30);
    const [subStartDate, setSubStartDate] = useState(todayDateInput());
    const [subEndDate, setSubEndDate] = useState(addDaysToDateInput(todayDateInput(), 30));
    const [subExtendDays, setSubExtendDays] = useState(30);
    const [subAmountPaid, setSubAmountPaid] = useState('');
    const [subPaymentMethod, setSubPaymentMethod] = useState<'CASH' | 'CARD' | 'TRANSFER'>('CASH');
    const [subNote, setSubNote] = useState('');
    const [bundlePerks, setBundlePerks] = useState<BundlePerkDraft[]>([createBundlePerkDraft()]);

    // View Profile Modal
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [viewMember, setViewMember] = useState<Member | null>(null);
    const [viewMemberDetail, setViewMemberDetail] = useState<StaffMemberDetail | null>(null);
    const [viewBiometrics, setViewBiometrics] = useState<BiometricLog[]>([]);
    const [viewSessions, setViewSessions] = useState<WorkoutSession[]>([]);
    const [viewLoading, setViewLoading] = useState(false);
    const [chartsReady, setChartsReady] = useState(false);
    const [chartRange, setChartRange] = useState<ChartRange>('30d');
    // Assign Plan Modal
    const [isAssignPlanOpen, setIsAssignPlanOpen] = useState(false);
    const [assignMember, setAssignMember] = useState<Member | null>(null);
    const [assignPlanId, setAssignPlanId] = useState('');
    const [assignType, setAssignType] = useState<AssignableType>('WORKOUT');
    const [assignWorkoutStatusFilter, setAssignWorkoutStatusFilter] = useState<WorkoutPlanStatusFilter>('PUBLISHED');
    const [assignDietStatusFilter, setAssignDietStatusFilter] = useState<DietPlanStatusFilter>('PUBLISHED');
    const selectedAddBranch = branches.find((branch) => branch.id === addForm.home_branch_id);
    const selectedAddBranchLabel = [selectedAddBranch?.display_name || selectedAddBranch?.name, selectedAddBranch?.gym_name]
        .filter(Boolean)
        .join(' - ');

    const text = locale === 'ar'
        ? {
            manager: 'مدير',
            coach: 'مدرب',
            reception: 'استقبال',
            frontDesk: 'مكتب أمامي',
            employee: 'موظف',
            cashier: 'كاشير',
            customer: 'عميل',
            password: 'كلمة المرور',
            failedLoadWorkoutPlans: 'فشل في تحميل خطط التمرين.',
            failedLoadDietPlans: 'فشل في تحميل خطط التغذية.',
            failedRegisterMember: 'فشل في تسجيل العضو.',
            failedUpdateMember: 'فشل في تحديث العضو.',
            deactivateMemberTitle: 'تعطيل العضو',
            deactivateMemberConfirm: 'تعطيل',
            failedDeactivateMember: 'فشل في تعطيل العضو.',
            extendDaysPositive: 'يجب أن تكون أيام التمديد عددًا موجبًا.',
            amountPositive: 'يجب أن يكون المبلغ المدفوع أكبر من صفر.',
            failedCreateSubscription: 'فشل في إنشاء الاشتراك.',
            failedSubscriptionAction: 'فشل في تحديث حالة الاشتراك.',
            selectPlanFirst: 'اختر خطة أولاً.',
            cannotAssignArchived: 'لا يمكن تعيين خطة مؤرشفة.',
            planAssigned: 'تم تعيين الخطة لـ',
            failedAssignPlan: 'فشل في تعيين الخطة.',
            openChatError: 'تعذر فتح المحادثة مع هذا العميل.',
            expires: 'ينتهي',
            viewProfile: 'عرض الملف',
            view: 'عرض',
            messageClient: 'مراسلة العميل',
            message: 'رسالة',
            assignPlan: 'تعيين خطة',
            assign: 'تعيين',
            manageSubscription: 'إدارة الاشتراك',
            sub: 'اشتراك',
            editDetails: 'تعديل التفاصيل',
            edit: 'تعديل',
            deactivate: 'تعطيل',
            addMemberModal: 'تسجيل عضو جديد',
            fullName: 'الاسم الكامل',
            email: 'البريد الإلكتروني',
            role: 'الدور',
            branch: 'الفرع',
            branchStepIntro: 'اختر الفرع أولاً.',
            branchRequired: 'يجب اختيار فرع قبل تسجيل العضو.',
            branchLockedNote: 'الفرع مثبت وسيُربط الحساب به مباشرة.',
            changeBranch: 'تغيير الفرع',
            nextStep: 'التالي',
            backStep: 'السابق',
            cancel: 'إلغاء',
            register: 'تسجيل',
            editMemberModal: 'تعديل بيانات العضو',
            update: 'تحديث',
            manageTitle: 'إدارة - ',
            currentStatus: 'الحالة الحالية',
            noSubscription: 'بدون اشتراك',
            renewalMode: 'وضع التجديد',
            periodMode: 'فترة الاشتراك',
            extendMode: 'تمديد الاشتراك',
            plan: 'اسم الباقة',
            bundleNameRequired: 'يجب إدخال اسم الباقة.',
            startDate: 'تاريخ البدء',
            endDate: 'تاريخ الانتهاء',
            bundleDurationDays: 'عدد الأيام',
            extendDays: 'أيام التمديد',
            amountPaid: 'المبلغ المدفوع (JOD)',
            paymentMethod: 'طريقة الدفع',
            adjustmentNote: 'ملاحظة التعديل',
            bundleBenefits: 'مزايا الباقة',
            bundleBenefitsHint: 'أضف مزايا الاشتراك داخل نفس الباقة بدل أن تكون شيئًا منفصلًا.',
            bundleBenefitKey: 'مفتاح الميزة',
            bundleBenefitLabel: 'اسم الميزة',
            bundleBenefitAllowance: 'الكمية',
            bundleBenefitPeriod: 'الفترة',
            bundleBenefitContract: 'عقد',
            bundleBenefitMonthly: 'شهري',
            bundleBenefitMonthlyReset: 'يوم الضبط الشهري',
            addBenefit: 'إضافة ميزة',
            removeBenefit: 'حذف',
            noBundleBenefits: 'لا توجد مزايا داخل هذه الباقة بعد.',
            bundlePerkIncomplete: 'أكمل حقول الميزة أو احذف السطر الفارغ.',
            bundleHistory: 'سجل تغييرات الباقة',
            bundleHistoryEmpty: 'لا توجد تغييرات بعد.',
            cash: 'نقدًا',
            card: 'بطاقة',
            bankTransfer: 'تحويل بنكي',
            renewSubscription: 'تجديد الاشتراك',
            activateSubscription: 'تفعيل الاشتراك',
            renew: 'تجديد',
            createSubscription: 'إنشاء اشتراك',
            unfreeze: 'إلغاء التجميد',
            freeze: 'تجميد',
            assignPlanTitle: 'تعيين خطة - ',
            planType: 'نوع الخطة',
            workout: 'تمرين',
            diet: 'تغذية',
            workoutStatusFilter: 'فلتر حالة التمرين',
            dietStatusFilter: 'فلتر حالة التغذية',
            all: 'الكل',
            workoutPlan: 'خطة تمرين',
            dietPlan: 'خطة تغذية',
            selectPlan: 'اختر خطة...',
            warningDraft: 'تحذير: سيتم تعيين خطة مسودة.',
            archivedCannotAssign: 'لا يمكن تعيين خطة مؤرشفة.',
            noWorkoutTemplates: 'لا توجد قوالب تمرين مطابقة للفلتر.',
            noDietTemplates: 'لا توجد قوالب تغذية مطابقة للفلتر.',
            assignPlanAction: 'تعيين الخطة',
            memberProfile: 'ملف العضو',
            phone: 'الهاتف',
            dateOfBirth: 'تاريخ الميلاد',
            age: 'العمر',
            emergencyContact: 'جهة اتصال الطوارئ',
            bioNotes: 'نبذة / ملاحظات',
            latestHeight: 'آخر طول',
            latestWeight: 'آخر وزن',
            na: 'غير متوفر',
            noBio: 'لا توجد نبذة.',
            progressVisualization: 'عرض التقدم',
            noBiometricData: 'لا توجد بيانات قياسات حيوية بعد.',
            workoutCharts: 'مخططات التمرين',
            workoutTrend: 'اتجاه التمرين',
            sessionLoad: 'حمل الجلسات',
            noWorkoutChartData: 'لا توجد بيانات تمرين كافية للرسم بعد.',
            sessionsCount: 'جلسات',
            workoutSessionLogs: 'سجل جلسات التمرين',
            exercises: 'تمارين',
            moreExercises: 'تمارين إضافية',
            noWorkoutSessions: 'لا توجد جلسات تمرين بعد.',
            activeWorkoutPlans: 'خطط التمرين النشطة',
            activeDietPlans: 'خطط التغذية النشطة',
            recentAttendance: 'سجل الحضور',
            workoutFeedback: 'ملاحظات التمرين',
            dietFeedback: 'ملاحظات التغذية',
            gymFeedback: 'ملاحظات النادي',
            noActivePlans: 'لا توجد خطط نشطة حالياً.',
            noAttendance: 'لا توجد سجلات حضور بعد.',
            noFeedback: 'لا توجد ملاحظات بعد.',
            loadingMemberData: 'جارٍ تحميل تفاصيل العضو...',
            deactivateDescriptionPrefix: 'هل أنت متأكد من تعطيل',
            deactivateDescriptionSuffix: '؟ هذا الإجراء قد لا يمكن التراجع عنه بسهولة.',
            allSubscribers: 'جميع المشتركين',
            totalSubscribers: 'إجمالي المشتركين',
            activeSubscribers: 'الفعّالون',
            frozenSubscribers: 'المجمّدون',
            expiredSubscribers: 'المنتهون',
            noSubscriptionSubscribers: 'بدون اشتراك',
            bundleFilter: 'فلتر الباقة',
            allBundles: 'كل الباقات',
            bundleSubscribers: 'مشتركون',
            monthly30d: 'شهري (30 يوماً)',
            quarterly90d: 'ربع سنوي (90 يوماً)',
            annual365d: 'سنوي (365 يوماً)',
            active: 'نشط',
            frozen: 'مجمد',
            expired: 'منتهي',
            none: 'بدون',
            published: 'منشور',
            draft: 'مسودة',
            archived: 'مؤرشف',
            sections: 'أقسام',
            videos: 'فيديوهات',
            contentLength: 'طول المحتوى',
            chars: 'حرف',
            structuredJson: 'JSON منظم',
            volumeKg: 'حجم كجم',
            lineWeightKg: 'الوزن (كجم)',
            lineBodyFat: 'نسبة الدهون (%)',
            lineMuscleKg: 'العضلات (كجم)',
        }
        : {
            manager: 'Manager',
            coach: 'Coach',
            reception: 'Reception',
            frontDesk: 'Front Desk',
            employee: 'Employee',
            cashier: 'Cashier',
            customer: 'Customer',
            password: 'Password',
            failedLoadWorkoutPlans: 'Failed to load workout plans.',
            failedLoadDietPlans: 'Failed to load diet plans.',
            failedRegisterMember: 'Failed to register member.',
            failedUpdateMember: 'Failed to update member.',
            deactivateMemberTitle: 'Deactivate Member',
            deactivateMemberConfirm: 'Deactivate',
            failedDeactivateMember: 'Failed to deactivate member.',
            extendDaysPositive: 'Extension days must be a positive number.',
            amountPositive: 'Paid amount must be greater than zero.',
            failedCreateSubscription: 'Failed to create subscription.',
            failedSubscriptionAction: 'Failed to update subscription status.',
            selectPlanFirst: 'Select a plan first.',
            cannotAssignArchived: 'Cannot assign archived plan.',
            planAssigned: 'Plan assigned to',
            failedAssignPlan: 'Failed to assign plan.',
            openChatError: 'Could not open chat with this client.',
            expires: 'Expires',
            viewProfile: 'View Profile',
            view: 'View',
            messageClient: 'Message Client',
            message: 'Message',
            assignPlan: 'Assign Plan',
            assign: 'Assign',
            manageSubscription: 'Manage Subscription',
            sub: 'Sub',
            editDetails: 'Edit Details',
            edit: 'Edit',
            deactivate: 'Deactivate',
            addMemberModal: 'Register New Member',
            fullName: 'Full Name',
            email: 'Email',
            role: 'Role',
            branch: 'Branch',
            branchStepIntro: 'Choose the branch first.',
            branchRequired: 'You must choose a branch before registering the member.',
            branchLockedNote: 'The branch is locked and the account will be created inside it.',
            changeBranch: 'Change branch',
            nextStep: 'Next',
            backStep: 'Back',
            cancel: 'Cancel',
            register: 'Register',
            editMemberModal: 'Edit Member Details',
            update: 'Update',
            manageTitle: 'Manage - ',
            currentStatus: 'Current Status',
            noSubscription: 'NO SUBSCRIPTION',
            renewalMode: 'Renewal Mode',
            fixedPlan: 'Fixed Plan',
            periodMode: 'Subscription Period',
            extendMode: 'Extend Subscription',
            plan: 'Bundle Name',
            bundleNameRequired: 'Bundle name is required.',
            startDate: 'Start Date',
            endDate: 'End Date',
            bundleDurationDays: 'Duration Days',
            extendDays: 'Extension Days',
            amountPaid: 'Amount Paid (JOD)',
            paymentMethod: 'Payment Method',
            adjustmentNote: 'Adjustment note',
            bundleBenefits: 'Bundle Benefits',
            bundleBenefitsHint: 'Add the subscription perks inside the same bundle instead of keeping them separate.',
            bundleBenefitKey: 'Benefit Key',
            bundleBenefitLabel: 'Benefit Name',
            bundleBenefitAllowance: 'Allowance',
            bundleBenefitPeriod: 'Period',
            bundleBenefitContract: 'Contract',
            bundleBenefitMonthly: 'Monthly',
            bundleBenefitMonthlyReset: 'Monthly reset day',
            addBenefit: 'Add benefit',
            removeBenefit: 'Remove',
            noBundleBenefits: 'No benefits added to this bundle yet.',
            bundlePerkIncomplete: 'Complete the benefit fields or remove the empty row.',
            bundleHistory: 'Bundle change log',
            bundleHistoryEmpty: 'No bundle changes yet.',
            cash: 'Cash',
            card: 'Card',
            bankTransfer: 'Bank Transfer',
            renewSubscription: 'Renew Subscription',
            activateSubscription: 'Activate Subscription',
            renew: 'Renew',
            createSubscription: 'Create Subscription',
            unfreeze: 'Unfreeze',
            freeze: 'Freeze',
            assignPlanTitle: 'Assign Plan - ',
            planType: 'Plan Type',
            workout: 'Workout',
            diet: 'Diet',
            workoutStatusFilter: 'Workout Status Filter',
            dietStatusFilter: 'Diet Status Filter',
            all: 'All',
            workoutPlan: 'Workout Plan',
            dietPlan: 'Diet Plan',
            selectPlan: 'Select Plan...',
            warningDraft: 'Warning: assigning a draft plan.',
            archivedCannotAssign: 'Archived plan cannot be assigned.',
            noWorkoutTemplates: 'No workout templates match this status filter.',
            noDietTemplates: 'No diet templates match this status filter.',
            assignPlanAction: 'Assign Plan',
            memberProfile: 'Member Profile',
            phone: 'Phone',
            dateOfBirth: 'Date of Birth',
            age: 'Age',
            emergencyContact: 'Emergency Contact',
            bioNotes: 'Bio / Notes',
            latestHeight: 'Latest Height',
            latestWeight: 'Latest Weight',
            na: 'N/A',
            noBio: 'No bio provided.',
            progressVisualization: 'Progress Visualization',
            noBiometricData: 'No biometric progress data logged yet.',
            workoutCharts: 'Workout Charts',
            workoutTrend: 'Workout Trend',
            sessionLoad: 'Session Load',
            noWorkoutChartData: 'No workout data available for charts yet.',
            sessionsCount: 'sessions',
            workoutSessionLogs: 'Workout Session Logs',
            exercises: 'exercises',
            moreExercises: 'more exercises',
            noWorkoutSessions: 'No workout session logs yet.',
            activeWorkoutPlans: 'Active Workout Plans',
            activeDietPlans: 'Active Diet Plans',
            recentAttendance: 'Recent Attendance',
            workoutFeedback: 'Workout Feedback',
            dietFeedback: 'Diet Feedback',
            gymFeedback: 'Gym Feedback',
            noActivePlans: 'No active plans right now.',
            noAttendance: 'No attendance records yet.',
            noFeedback: 'No feedback yet.',
            loadingMemberData: 'Loading member details...',
            deactivateDescriptionPrefix: 'Are you sure you want to deactivate',
            deactivateDescriptionSuffix: '? This action cannot be easily undone.',
            allSubscribers: 'All Subscribers',
            totalSubscribers: 'Total Subscribers',
            activeSubscribers: 'Active',
            frozenSubscribers: 'Frozen',
            expiredSubscribers: 'Expired',
            noSubscriptionSubscribers: 'No Subscription',
            bundleFilter: 'Bundle Filter',
            allBundles: 'All Bundles',
            bundleSubscribers: 'Subscribers',
            monthly30d: 'Monthly (30d)',
            quarterly90d: 'Quarterly (90d)',
            annual365d: 'Annual (365d)',
            active: 'ACTIVE',
            frozen: 'FROZEN',
            expired: 'EXPIRED',
            none: 'NONE',
            published: 'PUBLISHED',
            draft: 'DRAFT',
            archived: 'ARCHIVED',
            sections: 'sections',
            videos: 'videos',
            contentLength: 'Content length',
            chars: 'chars',
            structuredJson: 'Structured JSON',
            volumeKg: 'kg vol',
            lineWeightKg: 'Weight (kg)',
            lineBodyFat: 'Body Fat (%)',
            lineMuscleKg: 'Muscle (kg)',
        };

    const statusLabel = (status?: string | null) => {
        switch (status) {
            case 'ACTIVE':
                return text.active;
            case 'FROZEN':
                return text.frozen;
            case 'EXPIRED':
                return text.expired;
            case 'PUBLISHED':
                return text.published;
            case 'DRAFT':
                return text.draft;
            case 'ARCHIVED':
                return text.archived;
            default:
                return text.none;
        }
    };
    const bundleLabel = (bundleKey: string) => {
        return bundleKey === NO_BUNDLE_KEY ? text.noSubscriptionSubscribers : bundleKey;
    };
    const hasSavedMemberFilters = Boolean(search.trim() || statusFilter !== 'ALL' || bundleFilter !== 'ALL');

    useEffect(() => {
        if (!filterStorageKey || typeof window === 'undefined') return;
        const raw = window.localStorage.getItem(filterStorageKey);
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw) as Partial<{
                search: string;
                statusFilter: MemberStatusFilter;
                bundleFilter: string;
            }>;
            if (typeof parsed.search === 'string') setSearch(parsed.search);
            if (parsed.statusFilter) setStatusFilter(parsed.statusFilter);
            if (typeof parsed.bundleFilter === 'string') setBundleFilter(parsed.bundleFilter);
        } catch {
            // Ignore malformed saved state.
        }
    }, [filterStorageKey]);

    useEffect(() => {
        if (!filterStorageKey || typeof window === 'undefined') return;
        window.localStorage.setItem(filterStorageKey, JSON.stringify({
            search,
            statusFilter,
            bundleFilter,
        }));
    }, [bundleFilter, filterStorageKey, search, statusFilter]);

    const resetSavedFilters = () => {
        setSearch('');
        setStatusFilter('ALL');
        setBundleFilter('ALL');
        setMembersPage(1);
        if (filterStorageKey && typeof window !== 'undefined') {
            window.localStorage.removeItem(filterStorageKey);
        }
    };
    const roleLabel = (role?: string | null) => {
        switch (role) {
            case 'ADMIN':
                return locale === 'ar' ? 'مشرف' : 'Admin';
            case 'MANAGER':
                return locale === 'ar' ? 'مدير' : 'Manager';
            case 'COACH':
                return locale === 'ar' ? 'مدرب' : 'Coach';
            case 'CUSTOMER':
                return locale === 'ar' ? 'عميل' : 'Customer';
            case 'EMPLOYEE':
                return locale === 'ar' ? 'موظف' : 'Employee';
            case 'CASHIER':
                return locale === 'ar' ? 'كاشير' : 'Cashier';
            case 'RECEPTION':
                return locale === 'ar' ? 'استقبال' : 'Reception';
            case 'FRONT_DESK':
                return locale === 'ar' ? 'مكتب الاستقبال' : 'Front Desk';
            default:
                return role || text.na;
        }
    };

    const openView = async (member: Member) => {
        setViewMember(member);
        setViewMemberDetail(null);
        setViewBiometrics([]);
        setViewSessions([]);
        setViewLoading(true);
        setChartsReady(false);
        setChartRange('30d');
        setIsViewOpen(true);
        try {
            const branchParams = getBranchParams(selectedBranchId);
            const [detailRes, biometricsRes, sessionsRes] = await Promise.all([
                api.get(`/mobile/staff/members/${member.id}`, { params: branchParams }),
                api.get(`/fitness/biometrics/member/${member.id}`, { params: { limit: 500, ...branchParams } }).catch(() => ({ data: { data: [] } })),
                api.get(`/fitness/session-logs/member/${member.id}`, { params: { limit: 500, ...branchParams } }).catch(() => ({ data: { data: [] } })),
            ]);
            const detail = detailRes.data?.data as StaffMemberDetail | undefined;
            if (detail) {
                setViewMemberDetail(detail);
            }
            const biometricsData = (biometricsRes as { data?: { data?: BiometricLog[] } }).data?.data ?? [];
            const sessionsData = (sessionsRes as { data?: { data?: WorkoutSession[] } }).data?.data ?? [];
            setViewBiometrics(mergeUniqueById(detail?.biometrics, biometricsData).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
            setViewSessions(mergeUniqueById(detail?.recent_workout_sessions, sessionsData).sort((a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime()));
        } catch (err) {
            console.error(err);
        } finally {
            setViewLoading(false);
        }
    };

    useEffect(() => {
        if (!isViewOpen || viewLoading || !viewMemberDetail) {
            setChartsReady(false);
            return;
        }
        const frame = window.requestAnimationFrame(() => setChartsReady(true));
        return () => window.cancelAnimationFrame(frame);
    }, [isViewOpen, viewLoading, viewMemberDetail, viewBiometrics.length, viewSessions.length, chartRange]);

    const markImageFailed = (url?: string) => {
        if (!url) return;
        setFailedImageUrls(prev => ({ ...prev, [url]: true }));
    };

    const subscriberStats = useMemo(() => {
        const stats = {
            totalMembers: members.length,
            totalSubscribers: 0,
            active: 0,
            frozen: 0,
            expired: 0,
            noSubscription: 0,
        };

        members.forEach((member) => {
            const status = member.subscription?.status || 'NONE';
            if (status === 'NONE') {
                stats.noSubscription += 1;
                return;
            }

            stats.totalSubscribers += 1;
            if (status === 'ACTIVE') stats.active += 1;
            if (status === 'FROZEN') stats.frozen += 1;
            if (status === 'EXPIRED') stats.expired += 1;
        });

        return stats;
    }, [members]);

    const bundleCounts = useMemo(() => {
        const map = new Map<string, number>();
        members.forEach((member) => {
            const key = getBundleKey(member);
            map.set(key, (map.get(key) || 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) => {
            if (a[0] === NO_BUNDLE_KEY) return 1;
            if (b[0] === NO_BUNDLE_KEY) return -1;
            return b[1] - a[1] || a[0].localeCompare(b[0]);
        });
    }, [members]);

    const workoutChartData = useMemo(() => {
        const selectedDays = CHART_RANGE_OPTIONS.find((option) => option.value === chartRange)?.days ?? null;
        const cutoff = selectedDays == null ? null : new Date(Date.now() - (selectedDays - 1) * 24 * 60 * 60 * 1000);
        const filteredSessions = [...viewSessions].filter((session) => {
            if (!cutoff) return true;
            return new Date(session.performed_at) >= cutoff;
        });
        const sorted = filteredSessions.sort((a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime());
        const map = new Map<string, { date: string; sessions: number; volume: number }>();

        sorted.forEach((session) => {
            const key = session.performed_at.slice(0, 10);
            const existing = map.get(key) || { date: key, sessions: 0, volume: 0 };
            existing.sessions += 1;
            existing.volume += typeof session.session_volume === 'number' && Number.isFinite(session.session_volume)
                ? session.session_volume
                : getSessionVolume(session);
            map.set(key, existing);
        });

        return Array.from(map.values());
    }, [chartRange, viewSessions]);

    const workoutChartVolumeData = useMemo(
        () => workoutChartData.map((row) => ({ date: row.date, value: row.volume })),
        [workoutChartData]
    );
    const workoutChartSessionsData = useMemo(
        () => workoutChartData.map((row) => ({ date: row.date, value: row.sessions })),
        [workoutChartData]
    );

    const filteredBiometricsForCharts = useMemo(() => {
        const selectedDays = CHART_RANGE_OPTIONS.find((option) => option.value === chartRange)?.days ?? null;
        const cutoff = selectedDays == null ? null : new Date(Date.now() - (selectedDays - 1) * 24 * 60 * 60 * 1000);
        return [...viewBiometrics]
            .filter((entry) => {
                if (!cutoff) return true;
                return new Date(entry.date) >= cutoff;
            })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [chartRange, viewBiometrics]);

    const chartRangeLabel = useMemo(() => {
        switch (chartRange) {
            case '7d':
                return locale === 'ar' ? '7 أيام' : '7D';
            case '90d':
                return locale === 'ar' ? '90 يومًا' : '90D';
            case 'all':
                return locale === 'ar' ? 'الكل' : 'All';
            default:
                return locale === 'ar' ? '30 يومًا' : '30D';
        }
    }, [chartRange, locale]);

    const biometricWeightData = useMemo(() => {
        return filteredBiometricsForCharts.map((entry) => ({
            date: entry.date,
            value: entry.weight_kg,
        })).filter((row) => typeof row.value === 'number');
    }, [filteredBiometricsForCharts]);

    const biometricBodyFatData = useMemo(() => {
        return filteredBiometricsForCharts.map((entry) => ({
            date: entry.date,
            value: entry.body_fat_pct,
        })).filter((row) => typeof row.value === 'number');
    }, [filteredBiometricsForCharts]);

    const biometricMuscleData = useMemo(() => {
        return filteredBiometricsForCharts.map((entry) => ({
            date: entry.date,
            value: entry.muscle_mass_kg,
        })).filter((row) => typeof row.value === 'number');
    }, [filteredBiometricsForCharts]);

    const canRenderImage = (url?: string) => !!url && !failedImageUrls[url];
    const getAgeFromDob = (dob?: string) => {
        if (!dob) return null;
        const birthDate = new Date(dob);
        if (Number.isNaN(birthDate.getTime())) return null;
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
        return age >= 0 ? age : null;
    };

    const fetchMembers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/hr/members', { params: getBranchParams(selectedBranchId) });
            setMembers(res.data.data);
        } catch (err) { console.error(err); }
        setLoading(false);
    }, [selectedBranchId]);

    const fetchPlans = async () => {
        const branchParams = getBranchParams(selectedBranchId);
        try {
            const res = await api.get('/fitness/plan-summaries', { params: branchParams })
                .catch(() => api.get('/fitness/plans', { params: branchParams }));
            const allPlans = res.data?.data ?? [];
            setPlans(allPlans.filter((plan: WorkoutPlan) => !plan.member_id));
        } catch (err) {
            console.error(err);
            showToast(text.failedLoadWorkoutPlans, 'error');
        }
    };

    const fetchDietPlans = async () => {
        const branchParams = getBranchParams(selectedBranchId);
        try {
            const res = await api.get('/fitness/diet-summaries', {
                params: {
                    include_archived: true,
                    include_all_creators: true,
                    templates_only: true,
                    ...branchParams,
                },
            }).catch(
                () => api.get('/fitness/diets', {
                    params: {
                        include_archived: true,
                        include_all_creators: true,
                        templates_only: true,
                        ...branchParams,
                    },
                }),
            );
            const allPlans = res.data?.data ?? [];
            setDietPlans(allPlans.filter((plan: DietPlan) => !plan.member_id));
        } catch (err) {
            console.error(err);
            showToast(text.failedLoadDietPlans, 'error');
        }
    };

    const fetchBundleChanges = useCallback(async (memberId: string) => {
        try {
            const response = await api.get(`/hr/subscriptions/${memberId}/bundle-changes`);
            setBundleChanges(response.data?.data || []);
        } catch (err) {
            console.error(err);
            setBundleChanges([]);
        }
    }, []);

    const fetchBundlePerks = useCallback(async (memberId: string) => {
        try {
            const response = await api.get('/membership/perks', { params: { member_id: memberId } });
            const data = response.data?.data as BundleBenefitsResponse | undefined;
            const perks = data?.accounts || [];
            setBundleBenefitsSummary(data?.summary || { total_accounts: 0, total_remaining: 0, total_used: 0 });
            setBundleBenefitAccounts(perks);
            setBundlePerks(perks.length ? perks.map((perk: {
                id: string;
                perk_key: string;
                perk_label: string;
                period_type: string;
                total_allowance: number;
                monthly_reset_day?: number | null;
                note?: string | null;
            }) => createBundlePerkDraft({
                id: perk.id,
                perk_key: perk.perk_key,
                perk_label: perk.perk_label,
                period_type: perk.period_type === 'MONTHLY' ? 'MONTHLY' : 'CONTRACT',
                total_allowance: String(perk.total_allowance ?? 0),
                monthly_reset_day: perk.monthly_reset_day ? String(perk.monthly_reset_day) : '',
                note: perk.note || '',
            })) : [createBundlePerkDraft()]);
        } catch (err) {
            console.error(err);
            setBundleBenefitsSummary({ total_accounts: 0, total_remaining: 0, total_used: 0 });
            setBundleBenefitAccounts([]);
            setBundlePerks([createBundlePerkDraft()]);
        }
    }, []);

    const handleUseBundleBenefit = useCallback(async (accountId: string) => {
        if (!manageMember) return;
        try {
            await api.post(`/membership/perks/${accountId}/use`, { used_amount: 1 });
            await fetchBundlePerks(manageMember.id);
        } catch (err) {
            console.error(err);
            showToast(locale === 'ar' ? 'فشل تحديث الميزة.' : 'Failed to update benefit.', 'error');
        }
    }, [fetchBundlePerks, locale, manageMember, showToast]);

    useEffect(() => {
        setTimeout(() => fetchMembers(), 0);
    }, [fetchMembers]);

    useEffect(() => {
        setPlans([]);
        setDietPlans([]);
    }, [selectedBranchId]);

    useEffect(() => {
        if (!isManageOpen || !manageMember) return;
        void fetchBundleChanges(manageMember.id);
        void fetchBundlePerks(manageMember.id);
    }, [fetchBundleChanges, fetchBundlePerks, isManageOpen, manageMember]);

    useEffect(() => {
        if (!isManageOpen || renewalMode !== 'period') return;
        const normalizedDays = Math.max(1, Math.floor(Number(subDurationDays || 0)));
        setSubEndDate(addDaysToDateInput(subStartDate, normalizedDays));
    }, [isManageOpen, renewalMode, subDurationDays, subStartDate]);

    useEffect(() => {
        if (!isAddOpen) return;
        setAddForm((current) => ({
            ...current,
            home_branch_id: current.home_branch_id && branches.some((branch) => branch.id === current.home_branch_id)
                ? current.home_branch_id
                : initialBranchId,
        }));
    }, [branches, initialBranchId, isAddOpen]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search.trim().toLowerCase());
        }, 250);
        return () => clearTimeout(timer);
    }, [search]);

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!addForm.home_branch_id) {
            showToast(text.branchRequired, 'error');
            return;
        }
        try {
            await api.post('/auth/register', {
                full_name: addForm.full_name,
                email: addForm.email,
                password: addForm.password,
                role: 'CUSTOMER',
                home_branch_id: addForm.home_branch_id,
            });
            closeAddMemberWizard();
            fetchMembers();
        } catch (err) {
            console.error(err);
            showToast(text.failedRegisterMember, 'error');
        }
    };

    const openEdit = (member: Member) => {
        setEditForm({ id: member.id, full_name: member.full_name, email: member.email });
        setIsEditOpen(true);
    };

    const handleEditMember = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.put(`/users/${editForm.id}`, {
                full_name: editForm.full_name,
                email: editForm.email
            });
            setIsEditOpen(false);
            fetchMembers();
        } catch (err) {
            console.error(err);
            showToast(text.failedUpdateMember, 'error');
        }
    };

    const handleDeleteMember = async (id: string, name: string) => {
        const confirmed = await confirmAction({
            title: text.deactivateMemberTitle,
            description: `${text.deactivateDescriptionPrefix} ${name}${text.deactivateDescriptionSuffix}`,
            confirmText: text.deactivateMemberConfirm,
            destructive: true,
        });
        if (!confirmed) return;
        try {
            await api.delete(`/users/${id}`);
            fetchMembers();
        } catch (err) {
            console.error(err);
            showToast(text.failedDeactivateMember, 'error');
        }
    };

    const openManage = (member: Member) => {
        setManageMember(member);
        setBundleChanges([]);
        setBundleBenefitsSummary({ total_accounts: 0, total_remaining: 0, total_used: 0 });
        setBundleBenefitAccounts([]);
        setRenewalMode('period');
        setSubBundleName(member.subscription?.plan_name?.trim() || member.subscription_plan_name?.trim() || 'Monthly Membership');
        setSubDurationDays(30);
        setSubStartDate(todayDateInput());
        setSubEndDate(addDaysToDateInput(todayDateInput(), 30));
        setSubExtendDays(30);
        setSubAmountPaid('');
        setSubPaymentMethod('CASH');
        setSubNote('');
        setBundlePerks([createBundlePerkDraft()]);
        setIsManageOpen(true);
    };

    const handleCreateSub = async () => {
        if (!manageMember) return;
        const amountPaid = Number(subAmountPaid);
        if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
            showToast(text.amountPositive, 'error');
            return;
        }
        const normalizedBundleName = subBundleName.trim();
        if (!normalizedBundleName) {
            showToast(text.bundleNameRequired, 'error');
            return;
        }
        if (renewalMode === 'extend') {
            const normalizedExtendDays = Math.floor(Number(subExtendDays));
            if (!Number.isFinite(normalizedExtendDays) || normalizedExtendDays <= 0) {
                showToast(text.extendDaysPositive, 'error');
                return;
            }
        }
        const normalizedBundlePerks = bundlePerks.map((perk) => ({
            perk_key: perk.perk_key.trim(),
            perk_label: perk.perk_label.trim(),
            period_type: perk.period_type,
            total_allowance: Math.floor(Number(perk.total_allowance)),
            monthly_reset_day: perk.monthly_reset_day.trim() ? Math.floor(Number(perk.monthly_reset_day)) : null,
            note: perk.note.trim() || null,
        }));
        const hasInvalidPerkRow = normalizedBundlePerks.some((perk, index) => {
            const source = bundlePerks[index];
            const hasAnyInput = Boolean(
                source.perk_key.trim() ||
                source.perk_label.trim() ||
                source.total_allowance.trim() ||
                source.monthly_reset_day.trim() ||
                source.note.trim()
            );
            if (!hasAnyInput) return false;
            return !perk.perk_key || !perk.perk_label || !Number.isFinite(perk.total_allowance) || perk.total_allowance < 0;
        });
        if (hasInvalidPerkRow) {
            showToast(text.bundlePerkIncomplete, 'error');
            return;
        }
        const finalBundlePerks = normalizedBundlePerks.filter((perk) => perk.perk_key && perk.perk_label && Number.isFinite(perk.total_allowance) && perk.total_allowance >= 0);
        const periodEndDate = addDaysToDateInput(subStartDate, Math.max(1, Math.floor(Number(subDurationDays || 0))));
        try {
            const payload = renewalMode === 'extend'
                ? {
                    user_id: manageMember.id,
                    plan_name: normalizedBundleName,
                    start_date: subStartDate,
                    end_date: subEndDate,
                    extend_days: Math.floor(Number(subExtendDays)),
                    amount_paid: amountPaid,
                    payment_method: subPaymentMethod,
                    note: subNote.trim() || null,
                    bundle_perks: finalBundlePerks,
                }
                : {
                    user_id: manageMember.id,
                    plan_name: normalizedBundleName,
                    start_date: subStartDate,
                    end_date: periodEndDate,
                    amount_paid: amountPaid,
                    payment_method: subPaymentMethod,
                    note: subNote.trim() || null,
                    bundle_perks: finalBundlePerks,
                };
            await api.post('/hr/subscriptions', payload);
            setIsManageOpen(false);
            fetchMembers();
        } catch (err) {
            console.error(err);
            showToast(text.failedCreateSubscription, 'error');
        }
    };

    const handleSubAction = async (action: string) => {
        if (!manageMember) return;
        try {
            await api.put(`/hr/subscriptions/${manageMember.id}`, { status: action });
            setIsManageOpen(false);
            fetchMembers();
        } catch (err) {
            console.error(err);
            showToast(text.failedSubscriptionAction, 'error');
        }
    };

    const openAddMemberWizard = () => {
        setAddWizardStep(1);
        setAddForm((current) => ({
            ...current,
            full_name: '',
            email: '',
            password: 'password123',
            role: 'CUSTOMER',
            home_branch_id: initialBranchId,
        }));
        setIsAddOpen(true);
    };

    const closeAddMemberWizard = () => {
        setIsAddOpen(false);
        setAddWizardStep(1);
        setShowAddPassword(false);
        setAddForm({
            full_name: '',
            email: '',
            password: 'password123',
            role: 'CUSTOMER',
            home_branch_id: initialBranchId,
        });
    };

    const statusBadge = (status?: string) => {
        switch (status) {
            case 'ACTIVE': return 'badge-green';
            case 'FROZEN': return 'badge-blue';
            case 'EXPIRED': return 'badge-red';
            default: return 'badge-gray';
        }
    };

    const openAssignPlan = async (member: Member) => {
        if (!canAssignPlans) return;
        setAssignMember(member);
        if (plans.length === 0) await fetchPlans();
        if (dietPlans.length === 0) await fetchDietPlans();
        setAssignType('WORKOUT');
        setAssignWorkoutStatusFilter('PUBLISHED');
        setAssignDietStatusFilter('PUBLISHED');
        setAssignPlanId('');
        setIsAssignPlanOpen(true);
    };

    const handleAssignPlan = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assignMember || !assignPlanId) {
            showToast(text.selectPlanFirst, 'error');
            return;
        }
        try {
            if (assignType === 'WORKOUT') {
                const selectedPlan = plans.find(plan => plan.id === assignPlanId);
                if (selectedPlan?.status === 'ARCHIVED') {
                    showToast(text.cannotAssignArchived, 'error');
                    return;
                }
                await api.post(`/fitness/plans/${assignPlanId}/bulk-assign`, {
                    member_ids: [assignMember.id],
                    replace_active: true,
                });
            } else {
                const selectedPlan = dietPlans.find(plan => plan.id === assignPlanId);
                if (selectedPlan?.status === 'ARCHIVED') {
                    showToast(text.cannotAssignArchived, 'error');
                    return;
                }
                await api.post(`/fitness/diets/${assignPlanId}/bulk-assign`, {
                    member_ids: [assignMember.id],
                    replace_active: true,
                });
            }
            setIsAssignPlanOpen(false);
            showToast(`${text.planAssigned} ${assignMember.full_name}.`, 'success');
        } catch (err) {
            console.error(err);
            showToast(text.failedAssignPlan, 'error');
        }
    };

    const handleMessageClient = async (memberId: string) => {
        try {
            const response = await api.post('/chat/threads', {
                customer_id: memberId,
                ...getBranchParams(selectedBranchId),
            });
            const threadId = response.data?.data?.id as string | undefined;
            if (!threadId) {
                throw new Error('Missing thread id');
            }
            setIsViewOpen(false);
            router.push(`/dashboard/chat?thread=${threadId}`);
        } catch (err) {
            showToast(
                (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || text.openChatError,
                'error'
            );
        }
    };
    const manageMemberStatus = manageMember?.subscription?.status;

    const filtered = useMemo(() => {
        return members.filter(m => {
            const matchesSearch = !debouncedSearch ||
                m.full_name.toLowerCase().includes(debouncedSearch) ||
                m.email.toLowerCase().includes(debouncedSearch);
            const memberStatus = m.subscription?.status || 'NONE';
            const matchesStatus = statusFilter === 'ALL' || memberStatus === statusFilter;
            const matchesBundle = bundleFilter === 'ALL' || getBundleKey(m) === bundleFilter;
            return matchesSearch && matchesStatus && matchesBundle;
        });
    }, [members, debouncedSearch, statusFilter, bundleFilter]);
    const totalMemberPages = Math.max(1, Math.ceil(filtered.length / MEMBERS_PAGE_SIZE));
    const visibleMembers = filtered.slice((membersPage - 1) * MEMBERS_PAGE_SIZE, membersPage * MEMBERS_PAGE_SIZE);

    useEffect(() => {
        setMembersPage(1);
    }, [filtered.length]);

    useEffect(() => {
        if (bundleFilter === 'ALL') return;
        const bundleExists = bundleCounts.some(([bundleKey]) => bundleKey === bundleFilter);
        if (!bundleExists) {
            setBundleFilter('ALL');
        }
    }, [bundleCounts, bundleFilter]);

    const filteredAssignableWorkoutPlans = useMemo(() => {
        if (assignWorkoutStatusFilter === 'ALL') return plans;
        return plans.filter(plan => plan.status === assignWorkoutStatusFilter);
    }, [plans, assignWorkoutStatusFilter]);

    const filteredAssignableDietPlans = useMemo(() => {
        if (assignDietStatusFilter === 'ALL') return dietPlans;
        return dietPlans.filter(plan => plan.status === assignDietStatusFilter);
    }, [dietPlans, assignDietStatusFilter]);

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
        </div>
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{canManageMembers ? t('members.titleMembers') : t('members.titleClients')}</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {subscriberStats.totalMembers} {canManageMembers ? t('members.registeredMembers') : t('members.registeredClients')}
                        {' · '}
                        {subscriberStats.totalSubscribers} {text.totalSubscribers}
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                    <BranchSelector
                        branches={branches}
                        selectedBranchId={selectedBranchId}
                        onSelect={setSelectedBranchId}
                    />
                    <div className="field-with-icon">
                        <Search size={16} className="field-icon" />
                        <input
                            type="text"
                            placeholder={t('members.searchPlaceholder')}
                            className="input-dark input-with-icon w-full sm:w-64"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    {canManageMembers && (
                        <button onClick={openAddMemberWizard} className="btn-primary">
                            <UserPlus size={18} /> {t('members.addMember')}
                        </button>
                    )}
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                    { label: text.allSubscribers, value: subscriberStats.totalSubscribers, tone: 'border-primary/30 bg-primary/10 text-primary' },
                    { label: text.activeSubscribers, value: subscriberStats.active, tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' },
                    { label: text.frozenSubscribers, value: subscriberStats.frozen, tone: 'border-sky-500/30 bg-sky-500/10 text-sky-400' },
                    { label: text.expiredSubscribers, value: subscriberStats.expired, tone: 'border-rose-500/30 bg-rose-500/10 text-rose-400' },
                    { label: text.noSubscriptionSubscribers, value: subscriberStats.noSubscription, tone: 'border-border bg-muted/30 text-muted-foreground' },
                ].map((card) => (
                    <div key={card.label} className={`kpi-card p-4 border ${card.tone}`}>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">{card.label}</p>
                        <p className="mt-2 text-2xl font-bold text-foreground">{card.value}</p>
                    </div>
                ))}
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">{text.bundleFilter}</p>
                        {hasSavedMemberFilters && (
                            <span
                                title={locale === 'ar' ? 'الفلاتر محفوظة في هذا المتصفح' : 'Filters are saved in this browser'}
                                className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400"
                            >
                                {locale === 'ar' ? 'محفوظ' : 'Saved'}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setBundleFilter('ALL')}
                            className={`text-xs font-medium transition-colors ${bundleFilter === 'ALL' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            {text.allBundles}
                        </button>
                        <button
                            type="button"
                            onClick={resetSavedFilters}
                            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                            {locale === 'ar' ? 'إعادة ضبط الفلاتر' : 'Reset filters'}
                        </button>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {bundleCounts.map(([bundleKey, count]) => {
                        const isActive = bundleFilter === bundleKey;
                        return (
                            <button
                                key={bundleKey}
                                type="button"
                                onClick={() => setBundleFilter(bundleKey)}
                                className={`px-3 py-1.5 text-xs rounded-sm border transition-colors ${isActive
                                    ? 'border-primary text-primary bg-primary/10'
                                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-white/5'
                                    }`}
                            >
                                {bundleLabel(bundleKey)} <span className="opacity-70">({count})</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {[
                    { value: 'ALL', label: t('members.filterAll') },
                    { value: 'ACTIVE', label: t('members.filterActive') },
                    { value: 'FROZEN', label: t('members.filterFrozen') },
                    { value: 'EXPIRED', label: t('members.filterExpired') },
                    { value: 'NONE', label: t('members.filterNone') },
                ].map(filter => (
                    <button
                        key={filter.value}
                        type="button"
                        onClick={() => setStatusFilter(filter.value as MemberStatusFilter)}
                        className={`px-3 py-1.5 text-xs rounded-sm border transition-colors ${statusFilter === filter.value
                            ? 'border-primary text-primary bg-primary/10'
                            : 'border-border text-muted-foreground hover:text-foreground hover:bg-white/5'
                            }`}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>

            {/* Members Table */}
            <div className="chart-card overflow-hidden !p-0 border border-border">
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-start table-dark min-w-[800px]">
                        <thead>
                            <tr>
                                <th>{t('members.name')}</th>
                                <th>{t('members.email')}</th>
                                <th>{t('members.subscription')}</th>
                                <th>{text.bundleFilter}</th>
                                <th>{t('members.expires')}</th>
                                <th className="text-end ltr:pr-6 rtl:pl-6">{t('members.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">{t('members.noMembers')}</td></tr>
                            )}
                            {visibleMembers.map(m => (
                                <tr key={m.id}>
                                    <td>
                                        {(() => {
                                            const imageUrl = resolveProfileImageUrl(m.profile_picture_url);
                                            return (
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold overflow-hidden relative flex-shrink-0">
                                                {canRenderImage(imageUrl) ? (
                                                    <Image src={imageUrl as string} alt={m.full_name} fill className="object-cover" unoptimized onError={() => markImageFailed(imageUrl)} />
                                                ) : (
                                                    m.full_name.charAt(0)
                                                )}
                                            </div>
                                            <span className="!text-foreground font-medium">{m.full_name}</span>
                                        </div>
                                            );
                                        })()}
                                    </td>
                                    <td>{m.email}</td>
                                    <td>
                                        <span className={`badge ${statusBadge(m.subscription?.status)}`}>
                                            {statusLabel(m.subscription?.status)}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="badge badge-gray">
                                            {bundleLabel(getBundleKey(m))}
                                        </span>
                                    </td>
                                    <td>
                                        {m.subscription?.end_date ? formatDate(m.subscription.end_date, { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-'}
                                    </td>
                                    <td className="text-end ltr:pr-6 rtl:pl-6">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => openView(m)}
                                                className="btn-ghost py-1 px-2 h-auto text-xs text-emerald-400 hover:text-emerald-300"
                                                title={text.viewProfile}
                                            >
                                                <Eye size={14} /> {text.view}
                                            </button>
                                            {canMessageClient && (
                                                <button
                                                    onClick={() => handleMessageClient(m.id)}
                                                    className="btn-ghost py-1 px-2 h-auto text-xs text-primary hover:text-primary/80"
                                                    title={text.messageClient}
                                                >
                                                    <MessageCircle size={14} /> {text.message}
                                                </button>
                                            )}
                                            {canAssignPlans && (
                                                <button
                                                    onClick={() => openAssignPlan(m)}
                                                    className="btn-ghost py-1 px-2 h-auto text-xs text-orange-400 hover:text-orange-300"
                                                    title={text.assignPlan}
                                                >
                                                    <Dumbbell size={14} /> {text.assign}
                                                </button>
                                            )}
                                            {canManageMembers && (
                                                <button
                                                    onClick={() => openManage(m)}
                                                    className="btn-ghost py-1 px-2 h-auto text-xs"
                                                    title={text.manageSubscription}
                                                >
                                                    <Shield size={14} /> {text.sub}
                                                </button>
                                            )}
                                            {canManageMembers && (
                                                <button
                                                    onClick={() => openEdit(m)}
                                                    className="btn-ghost py-1 px-2 h-auto text-xs text-blue-400 hover:text-blue-300"
                                                    title={text.editDetails}
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                            )}
                                            {canManageMembers && (
                                                <button
                                                    onClick={() => handleDeleteMember(m.id, m.full_name)}
                                                    className="btn-ghost py-1 px-2 h-auto text-xs text-destructive hover:text-destructive/80"
                                                    title={text.deactivateMemberTitle}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="md:hidden divide-y divide-border">
                    {filtered.length === 0 && (
                        <div className="px-4 py-8 text-center text-sm text-muted-foreground">{t('members.noMembers')}</div>
                    )}
                    {visibleMembers.map((m) => (
                        <div key={m.id} className="p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    {(() => {
                                        const imageUrl = resolveProfileImageUrl(m.profile_picture_url);
                                        return (
                                    <div className="h-10 w-10 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold overflow-hidden relative flex-shrink-0">
                                        {canRenderImage(imageUrl) ? (
                                            <Image src={imageUrl as string} alt={m.full_name} fill className="object-cover" unoptimized onError={() => markImageFailed(imageUrl)} />
                                        ) : (
                                            m.full_name.charAt(0)
                                        )}
                                    </div>
                                        );
                                    })()}
                                    <div className="min-w-0">
                                        <p className="font-medium text-foreground truncate">{m.full_name}</p>
                                        <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                                    </div>
                                </div>
                                <span className={`badge ${statusBadge(m.subscription?.status)}`}>
                                    {statusLabel(m.subscription?.status)}
                                </span>
                            </div>

                            <div className="mt-3 flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">{text.expires}</span>
                                <span className="text-foreground font-medium">
                                    {m.subscription?.end_date ? formatDate(m.subscription.end_date, { year: 'numeric', month: '2-digit', day: '2-digit' }) : '--'}
                                </span>
                            </div>

                            <div className="mt-3 flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">{text.bundleFilter}</span>
                                <span className="badge badge-gray">
                                    {bundleLabel(getBundleKey(m))}
                                </span>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => openView(m)}
                                    className="btn-ghost !px-2 !py-2 h-auto text-xs text-emerald-400 hover:text-emerald-300 justify-center"
                                    title={text.viewProfile}
                                >
                                    <Eye size={14} /> {text.view}
                                </button>
                                {canAssignPlans && (
                                    <button
                                        onClick={() => openAssignPlan(m)}
                                        className="btn-ghost !px-2 !py-2 h-auto text-xs text-orange-400 hover:text-orange-300 justify-center"
                                        title={text.assignPlan}
                                    >
                                        <Dumbbell size={14} /> {text.assign}
                                    </button>
                                )}
                                {canMessageClient && (
                                    <button
                                        onClick={() => handleMessageClient(m.id)}
                                        className="btn-ghost !px-2 !py-2 h-auto text-xs text-primary hover:text-primary/80 justify-center"
                                        title={text.messageClient}
                                    >
                                        <MessageCircle size={14} /> {text.message}
                                    </button>
                                )}
                                {canManageMembers && (
                                    <button
                                        onClick={() => openManage(m)}
                                        className="btn-ghost !px-2 !py-2 h-auto text-xs justify-center"
                                        title={text.manageSubscription}
                                    >
                                        <Shield size={14} /> {text.sub}
                                    </button>
                                )}
                                {canManageMembers && (
                                    <button
                                        onClick={() => openEdit(m)}
                                        className="btn-ghost !px-2 !py-2 h-auto text-xs text-blue-400 hover:text-blue-300 justify-center"
                                        title={text.editDetails}
                                    >
                                        <Pencil size={14} /> {text.edit}
                                    </button>
                                )}
                                {canManageMembers && (
                                    <button
                                        onClick={() => handleDeleteMember(m.id, m.full_name)}
                                        className="btn-ghost !px-2 !py-2 h-auto text-xs text-destructive hover:text-destructive/80 justify-center"
                                        title={text.deactivateMemberTitle}
                                    >
                                        <Trash2 size={14} /> {text.deactivate}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                <TablePagination
                    page={membersPage}
                    totalPages={totalMemberPages}
                    onPrevious={() => setMembersPage((prev) => Math.max(1, prev - 1))}
                    onNext={() => setMembersPage((prev) => Math.min(totalMemberPages, prev + 1))}
                />
            </div>

            {/* ===== ADD MEMBER MODAL ===== */}
            <Modal isOpen={isAddOpen && canManageMembers} onClose={closeAddMemberWizard} title={text.addMemberModal} maxWidthClassName="max-w-2xl">
                <form onSubmit={handleAddMember} className="space-y-5">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        <span className={`rounded-full px-2 py-1 ${addWizardStep === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted/40'}`}>1</span>
                        <span>{text.branch}</span>
                        <span className="h-px w-8 bg-border" />
                        <span className={`rounded-full px-2 py-1 ${addWizardStep === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted/40'}`}>2</span>
                        <span>{text.register}</span>
                    </div>

                    {addWizardStep === 1 ? (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-border bg-muted/20 p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{text.branch}</p>
                                <p className="mt-2 text-sm font-medium text-foreground">{text.branchStepIntro}</p>
                            </div>
                            <div className="rounded-2xl border border-border bg-card/50 p-4">
                                <label className="block text-xs font-medium text-muted-foreground mb-2">{text.branch}</label>
                                <select
                                    className="input-dark"
                                    value={addForm.home_branch_id}
                                    onChange={e => setAddForm({ ...addForm, home_branch_id: e.target.value })}
                                    required
                                >
                                    <option value="">{text.branch}</option>
                                    {branches.map((branch) => (
                                        <option key={branch.id} value={branch.id}>
                                            {[branch.display_name || branch.name, branch.gym_name].filter(Boolean).join(' - ')}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 pt-1">
                                <button type="button" onClick={closeAddMemberWizard} className="btn-ghost">{text.cancel}</button>
                                <button type="button" className="btn-primary" disabled={!addForm.home_branch_id} onClick={() => setAddWizardStep(2)}>
                                    {text.nextStep}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-border bg-card/60 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{text.branch}</p>
                                        <p className="mt-1 text-sm font-semibold text-foreground">{selectedAddBranchLabel || '--'}</p>
                                    </div>
                                    <button type="button" onClick={() => setAddWizardStep(1)} className="text-xs font-medium text-primary hover:underline">
                                        {text.changeBranch}
                                    </button>
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    {text.branchLockedNote}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">{text.fullName}</label>
                                    <input type="text" required className="input-dark" value={addForm.full_name} onChange={e => setAddForm({ ...addForm, full_name: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">{text.email}</label>
                                    <input type="email" required className="input-dark" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">{text.password}</label>
                                    <div className="relative">
                                        <input
                                            type={showAddPassword ? 'text' : 'password'}
                                            required
                                            className="input-dark pr-11"
                                            value={addForm.password}
                                            onChange={e => setAddForm({ ...addForm, password: e.target.value })}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowAddPassword((current) => !current)}
                                            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                                            aria-label={showAddPassword ? 'Hide password' : 'Show password'}
                                        >
                                            {showAddPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">{text.role}</label>
                                    <div className="rounded-2xl border border-border bg-background px-3 py-3 text-sm font-medium text-foreground">
                                        {text.customer}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 pt-1 border-t border-border">
                                <button type="button" onClick={() => setAddWizardStep(1)} className="btn-ghost">{text.backStep}</button>
                                <div className="flex gap-3">
                                    <button type="button" onClick={closeAddMemberWizard} className="btn-ghost">{text.cancel}</button>
                                    <button type="submit" className="btn-primary" disabled={!addForm.home_branch_id}><Save size={16} /> {text.register}</button>
                                </div>
                            </div>
                        </div>
                    )}
                </form>
            </Modal>

            {/* ===== EDIT MEMBER MODAL ===== */}
            <Modal isOpen={isEditOpen && canManageMembers} onClose={() => setIsEditOpen(false)} title={text.editMemberModal}>
                <form onSubmit={handleEditMember} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">{text.fullName}</label>
                        <input type="text" required className="input-dark" value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">{text.email}</label>
                        <input type="email" required className="input-dark" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <button type="button" onClick={() => setIsEditOpen(false)} className="btn-ghost">{text.cancel}</button>
                        <button type="submit" className="btn-primary"><Save size={16} /> {text.update}</button>
                    </div>
                </form>
            </Modal>

            {/* ===== MANAGE SUBSCRIPTION MODAL ===== */}
            <Modal isOpen={isManageOpen && canManageMembers} onClose={() => setIsManageOpen(false)} title={`${text.manageTitle}${manageMember?.full_name || ''}`}>
                <div className="space-y-5">
                    {/* Current status */}
                    <div className="flex items-center justify-between rounded-sm p-4 bg-card border border-border">
                        <div>
                            <p className="text-xs text-muted-foreground">{text.currentStatus}</p>
                            <span className={`badge mt-1 ${statusBadge(manageMemberStatus)}`}>
                                {manageMemberStatus ? statusLabel(manageMemberStatus) : text.noSubscription}
                            </span>
                        </div>
                        {manageMember?.subscription?.end_date && (
                            <div className="text-end">
                                <p className="text-xs text-muted-foreground">{text.expires}</p>
                                <p className="text-sm font-medium text-foreground mt-1">{formatDate(manageMember.subscription.end_date, { year: 'numeric', month: '2-digit', day: '2-digit' })}</p>
                            </div>
                        )}
                    </div>

                    {/* Create / Renew */}
                    <div className="border border-border rounded-sm p-4 space-y-3">
                        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2"><Shield size={16} className="text-primary" /> {manageMember?.subscription ? text.renew : text.createSubscription} {t('members.subscription')}</h4>
                        <div>
                            <label className="block text-xs text-muted-foreground mb-1">{text.renewalMode}</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRenewalMode('period');
                                        setSubEndDate(addDaysToDateInput(subStartDate, Math.max(1, Math.floor(Number(subDurationDays || 0)))));
                                    }}
                                    className={`py-2 px-3 text-sm rounded-sm border transition-colors ${renewalMode === 'period'
                                        ? 'border-primary text-primary bg-primary/10'
                                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-white/5'
                                        }`}
                                >
                                    {text.periodMode}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRenewalMode('extend')}
                                    className={`py-2 px-3 text-sm rounded-sm border transition-colors ${renewalMode === 'extend'
                                        ? 'border-primary text-primary bg-primary/10'
                                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-white/5'
                                        }`}
                                >
                                    {text.extendMode}
                                </button>
                            </div>
                        </div>

                        {renewalMode === 'period' ? (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs text-muted-foreground mb-1">{text.plan}</label>
                                    <input
                                        type="text"
                                        className="input-dark"
                                        value={subBundleName}
                                        onChange={(e) => setSubBundleName(e.target.value)}
                                        placeholder={locale === 'ar' ? 'مثال: باقة ذهبية' : 'e.g. Gold Bundle'}
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-muted-foreground mb-1">{text.startDate}</label>
                                        <input
                                            type="date"
                                            className="input-dark"
                                            value={subStartDate}
                                            onChange={e => setSubStartDate(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-muted-foreground mb-1">{text.bundleDurationDays}</label>
                                        <input
                                            type="number"
                                            min={1}
                                            step={1}
                                            className="input-dark"
                                            value={subDurationDays}
                                            onChange={(e) => setSubDurationDays(Math.max(1, Math.floor(Number(e.target.value || 1))))}
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs text-muted-foreground mb-1">{text.endDate}</label>
                                    <input
                                        type="date"
                                        className="input-dark"
                                        value={subEndDate}
                                        readOnly
                                    />
                                </div>
                            </div>
                        ) : (
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">{text.extendDays}</label>
                                <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    className="input-dark"
                                    value={subExtendDays}
                                    onChange={e => setSubExtendDays(Number(e.target.value))}
                                />
                            </div>
                        )}
                        <div className="border border-border rounded-sm p-4 space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h4 className="text-sm font-semibold text-foreground">{text.bundleBenefits}</h4>
                                    <p className="text-xs text-muted-foreground mt-1">{text.bundleBenefitsHint}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setBundlePerks((current) => [...current, createBundlePerkDraft()])}
                                    className="btn-ghost text-xs"
                                >
                                    {text.addBenefit}
                                </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="rounded-sm border border-border bg-card/40 p-3">
                                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                        {locale === 'ar' ? 'إجمالي المزايا' : 'Total benefits'}
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-foreground">{bundleBenefitsSummary.total_accounts}</p>
                                </div>
                                <div className="rounded-sm border border-border bg-card/40 p-3">
                                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                        {locale === 'ar' ? 'المتبقي' : 'Remaining'}
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-foreground">{bundleBenefitsSummary.total_remaining}</p>
                                </div>
                                <div className="rounded-sm border border-border bg-card/40 p-3">
                                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                        {locale === 'ar' ? 'المستخدم' : 'Used'}
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-foreground">{bundleBenefitsSummary.total_used}</p>
                                </div>
                            </div>
                            <div className="rounded-sm border border-border bg-card/40 p-3 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                            {locale === 'ar' ? 'الاستخدام الحالي للمزايا' : 'Current benefit usage'}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {locale === 'ar'
                                                ? 'استخدم 1 لتحديث العدّاد بعد تقديم الخدمة.'
                                                : 'Use 1 to update the counter after the service is delivered.'}
                                        </p>
                                    </div>
                                    <span className="rounded-full border border-border bg-background px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        {bundleBenefitAccounts.length}
                                    </span>
                                </div>
                                {bundleBenefitAccounts.length ? (
                                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                                        {bundleBenefitAccounts.map((benefit) => (
                                            <div key={benefit.id} className="rounded-sm border border-border bg-background/40 p-3">
                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-foreground">{benefit.perk_label}</p>
                                                        <p className="text-xs text-muted-foreground mt-1">{benefit.perk_key}</p>
                                                    </div>
                                                    <span className="inline-flex w-fit items-center rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-foreground">
                                                        {benefit.remaining_allowance} / {benefit.total_allowance}
                                                    </span>
                                                </div>
                                                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                    <p className="text-xs text-muted-foreground">
                                                        {locale === 'ar' ? 'نوع الباقة' : 'Benefit type'}: {benefit.period_type}
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleUseBundleBenefit(benefit.id)}
                                                        disabled={benefit.remaining_allowance <= 0}
                                                        className="btn-ghost text-xs w-full sm:w-auto justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {locale === 'ar' ? 'استخدم 1' : 'Use 1'}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        {locale === 'ar' ? 'لا توجد مزايا مضافة لهذا الاشتراك بعد.' : 'No benefits added to this subscription yet.'}
                                    </p>
                                )}
                            </div>
                            {bundlePerks.length ? (
                                <div className="space-y-3">
                                    {bundlePerks.map((perk, index) => (
                                        <div key={perk.id} className="rounded-sm border border-border bg-background/40 p-3 space-y-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                                        {text.bundleBenefits} {index + 1}
                                                    </p>
                                                    <p className="mt-1 text-sm text-muted-foreground">
                                                        {locale === 'ar' ? 'سطر مختصر وسريع للمزايا.' : 'Short, quick row for bundle benefits.'}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setBundlePerks((current) => current.length > 1 ? current.filter((_, itemIndex) => itemIndex !== index) : [createBundlePerkDraft()])}
                                                    className="btn-ghost text-xs"
                                                >
                                                    {text.removeBenefit}
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <div>
                                                    <label className="block text-xs text-muted-foreground mb-1">{text.bundleBenefitKey}</label>
                                                    <input
                                                        type="text"
                                                        className="input-dark"
                                                        value={perk.perk_key}
                                                        onChange={(e) => setBundlePerks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, perk_key: e.target.value } : item))}
                                                        placeholder={locale === 'ar' ? 'guest_visit' : 'guest_visit'}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-muted-foreground mb-1">{text.bundleBenefitLabel}</label>
                                                    <input
                                                        type="text"
                                                        className="input-dark"
                                                        value={perk.perk_label}
                                                        onChange={(e) => setBundlePerks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, perk_label: e.target.value } : item))}
                                                        placeholder={locale === 'ar' ? 'زيارة ضيف مجانية' : 'Free guest visit'}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-muted-foreground mb-1">{text.bundleBenefitAllowance}</label>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step={1}
                                                        className="input-dark"
                                                        value={perk.total_allowance}
                                                        onChange={(e) => setBundlePerks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, total_allowance: e.target.value } : item))}
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
                                                <div>
                                                    <label className="block text-xs text-muted-foreground mb-1">{text.bundleBenefitPeriod}</label>
                                                    <select
                                                        className="input-dark"
                                                        value={perk.period_type}
                                                        onChange={(e) => setBundlePerks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, period_type: e.target.value as 'CONTRACT' | 'MONTHLY' } : item))}
                                                    >
                                                        <option value="CONTRACT">{text.bundleBenefitContract}</option>
                                                        <option value="MONTHLY">{text.bundleBenefitMonthly}</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-muted-foreground mb-1">{text.adjustmentNote}</label>
                                                    <input
                                                        type="text"
                                                        className="input-dark"
                                                        value={perk.note}
                                                        onChange={(e) => setBundlePerks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, note: e.target.value } : item))}
                                                        placeholder={locale === 'ar' ? 'ملاحظة اختيارية' : 'Optional note'}
                                                    />
                                                </div>
                                            </div>
                                            {perk.period_type === 'MONTHLY' ? (
                                                <div className="max-w-[180px]">
                                                    <label className="block text-xs text-muted-foreground mb-1">{text.bundleBenefitMonthlyReset}</label>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={31}
                                                        step={1}
                                                        className="input-dark"
                                                        value={perk.monthly_reset_day}
                                                        onChange={(e) => setBundlePerks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, monthly_reset_day: e.target.value } : item))}
                                                    />
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">{text.noBundleBenefits}</p>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">{text.amountPaid}</label>
                                <input
                                    type="number"
                                    min={0.01}
                                    step={0.01}
                                    className="input-dark"
                                    value={subAmountPaid}
                                    onChange={e => setSubAmountPaid(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">{text.paymentMethod}</label>
                                <select className="input-dark" value={subPaymentMethod} onChange={(e) => setSubPaymentMethod(e.target.value as 'CASH' | 'CARD' | 'TRANSFER')}>
                                    <option value="CASH">{text.cash}</option>
                                    <option value="CARD">{text.card}</option>
                                    <option value="TRANSFER">{text.bankTransfer}</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs text-muted-foreground mb-1">{text.adjustmentNote}</label>
                            <textarea
                                className="input-dark min-h-24"
                                value={subNote}
                                onChange={e => setSubNote(e.target.value)}
                                placeholder={locale === 'ar' ? 'ملاحظة اختيارية للتعديل أو التجديد' : 'Optional note for the adjustment or renewal'}
                            />
                        </div>
                        <button type="button" onClick={handleCreateSub} className="btn-primary w-full justify-center">
                            <RefreshCw size={15} /> {renewalMode === 'extend' ? text.extendMode : (manageMember?.subscription ? text.renewSubscription : text.activateSubscription)}
                        </button>
                    </div>

                    {/* Quick actions */}
                    {manageMember?.subscription && (
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => handleSubAction('ACTIVE')}
                                disabled={manageMemberStatus !== 'FROZEN'}
                                className="flex items-center justify-center gap-2 py-2.5 border border-emerald-500/30 text-emerald-400 rounded-sm text-sm font-medium hover:bg-emerald-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <RefreshCw size={15} /> {text.unfreeze}
                            </button>
                            <button
                                onClick={() => handleSubAction('FROZEN')}
                                disabled={manageMemberStatus !== 'ACTIVE'}
                                className="flex items-center justify-center gap-2 py-2.5 border border-blue-500/30 text-blue-400 rounded-sm text-sm font-medium hover:bg-blue-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Snowflake size={15} /> {text.freeze}
                            </button>
                        </div>
                    )}

                    <div className="border border-border rounded-sm p-4 space-y-3">
                        <h4 className="text-sm font-semibold text-foreground">{text.bundleHistory}</h4>
                        {bundleChanges.length ? (
                            <div className="space-y-3">
                                {bundleChanges.map((item) => (
                                    <div key={item.id} className="rounded-xl border border-border bg-muted/10 p-3 text-xs text-muted-foreground">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-full border border-border bg-card px-2 py-0.5 font-semibold uppercase tracking-wide text-foreground">
                                                {item.change_type.replaceAll('_', ' ')}
                                            </span>
                                            <span>{item.created_at ? formatDate(item.created_at, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'}</span>
                                        </div>
                                        <p className="mt-2 text-foreground">
                                            {item.previous_plan_name || text.noSubscription} {'->'} {item.new_plan_name || text.noSubscription}
                                        </p>
                                        <p className="mt-1">
                                            {item.previous_end_date ? formatDate(item.previous_end_date, { year: 'numeric', month: 'short', day: 'numeric' }) : '--'} {'->'} {item.new_end_date ? formatDate(item.new_end_date, { year: 'numeric', month: 'short', day: 'numeric' }) : '--'}
                                        </p>
                                        {item.note ? <p className="mt-1">{item.note}</p> : null}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground">{text.bundleHistoryEmpty}</p>
                        )}
                    </div>
                </div>
            </Modal>

            {/* ASSIGN PLAN MODAL */}
            <Modal isOpen={isAssignPlanOpen && canAssignPlans} onClose={() => setIsAssignPlanOpen(false)} title={`${text.assignPlanTitle}${assignMember?.full_name || ''}`}>
                <form onSubmit={handleAssignPlan} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">{text.planType}</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                className={`py-2 px-3 text-sm rounded-sm border transition-colors ${assignType === 'WORKOUT'
                                    ? 'border-primary text-primary bg-primary/10'
                                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-white/5'
                                    }`}
                                onClick={() => { setAssignType('WORKOUT'); setAssignPlanId(''); }}
                            >
                                {text.workout}
                            </button>
                            <button
                                type="button"
                                className={`py-2 px-3 text-sm rounded-sm border transition-colors ${assignType === 'DIET'
                                    ? 'border-primary text-primary bg-primary/10'
                                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-white/5'
                                    }`}
                                onClick={() => { setAssignType('DIET'); setAssignPlanId(''); }}
                            >
                                {text.diet}
                            </button>
                        </div>
                    </div>
                    <div>
                        {assignType === 'WORKOUT' && (
                            <div className="mb-3">
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">{text.workoutStatusFilter}</label>
                                <div className="flex flex-wrap gap-2">
                                    {(['ALL', 'PUBLISHED', 'DRAFT', 'ARCHIVED'] as WorkoutPlanStatusFilter[]).map(status => {
                                        const count = status === 'ALL' ? plans.length : plans.filter(plan => plan.status === status).length;
                                        return (
                                            <button
                                                key={status}
                                                type="button"
                                                onClick={() => {
                                                    setAssignWorkoutStatusFilter(status);
                                                    setAssignPlanId('');
                                                }}
                                                className={`px-3 py-2 min-h-11 text-xs rounded-sm border transition-colors ${
                                                    assignWorkoutStatusFilter === status
                                                        ? 'border-primary text-primary bg-primary/10'
                                                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                }`}
                                            >
                                                {status === 'ALL' ? text.all : statusLabel(status)} ({count})
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {assignType === 'DIET' && (
                            <div className="mb-3">
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">{text.dietStatusFilter}</label>
                                <div className="flex flex-wrap gap-2">
                                    {(['ALL', 'PUBLISHED', 'DRAFT', 'ARCHIVED'] as DietPlanStatusFilter[]).map(status => {
                                        const count = status === 'ALL' ? dietPlans.length : dietPlans.filter(plan => plan.status === status).length;
                                        return (
                                            <button
                                                key={status}
                                                type="button"
                                                onClick={() => {
                                                    setAssignDietStatusFilter(status);
                                                    setAssignPlanId('');
                                                }}
                                                className={`px-3 py-2 min-h-11 text-xs rounded-sm border transition-colors ${
                                                    assignDietStatusFilter === status
                                                        ? 'border-primary text-primary bg-primary/10'
                                                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                }`}
                                            >
                                                {status === 'ALL' ? text.all : statusLabel(status)} ({count})
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                            {assignType === 'WORKOUT' ? text.workoutPlan : text.dietPlan}
                        </label>
                        <select
                            required
                            className="input-dark"
                            value={assignPlanId}
                            onChange={e => setAssignPlanId(e.target.value)}
                        >
                            <option value="">{text.selectPlan}</option>
                            {assignType === 'WORKOUT'
                                ? filteredAssignableWorkoutPlans.map(plan => (
                                    <option key={plan.id} value={plan.id}>
                                        {plan.name} [{statusLabel(plan.status || 'DRAFT')}]
                                    </option>
                                ))
                                : filteredAssignableDietPlans.map(plan => (
                                    <option key={plan.id} value={plan.id}>
                                        {plan.name} [{statusLabel(plan.status || 'DRAFT')}]
                                    </option>
                                ))}
                        </select>
                    </div>
                    {assignType === 'WORKOUT' && assignPlanId && (() => {
                        const plan = plans.find(p => p.id === assignPlanId);
                        if (!plan) return null;
                        return (
                            <div className="rounded-sm border border-border bg-muted/20 p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                                    {plan.status && <span className={`badge ${plan.status === 'PUBLISHED' ? 'badge-green' : plan.status === 'ARCHIVED' ? 'badge-gray' : 'badge-orange'}`}>{statusLabel(plan.status)}</span>}
                                </div>
                                {(plan.total_sections || plan.total_exercises || plan.total_videos) && (
                                    <p className="text-xs text-muted-foreground">
                                        {(plan.total_sections || 0)} {text.sections} | {(plan.total_exercises || 0)} {text.exercises} | {(plan.total_videos || 0)} {text.videos}
                                    </p>
                                )}
                                {plan.preview_sections && plan.preview_sections.length > 0 && (
                                    <div className="space-y-1">
                                        {plan.preview_sections.map(sec => (
                                            <p key={sec.section_name} className="text-xs text-muted-foreground">
                                                <span className="text-primary font-medium">{sec.section_name}:</span> {sec.exercise_names.join(', ')}
                                            </p>
                                        ))}
                                    </div>
                                )}
                                {plan.status === 'DRAFT' && <p className="text-xs text-yellow-400">{text.warningDraft}</p>}
                                {plan.status === 'ARCHIVED' && <p className="text-xs text-destructive">{text.archivedCannotAssign}</p>}
                            </div>
                        );
                    })()}
                    {assignType === 'DIET' && assignPlanId && (() => {
                        const plan = dietPlans.find(p => p.id === assignPlanId);
                        if (!plan) return null;
                        return (
                            <div className="rounded-sm border border-border bg-muted/20 p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                                    {plan.status && <span className={`badge ${plan.status === 'PUBLISHED' ? 'badge-green' : plan.status === 'ARCHIVED' ? 'badge-gray' : 'badge-orange'}`}>{statusLabel(plan.status)}</span>}
                                </div>
                                {plan.description_excerpt && <p className="text-xs text-muted-foreground">{plan.description_excerpt}</p>}
                                {plan.content_length !== undefined && (
                                    <p className="text-xs text-muted-foreground">
                                        {text.contentLength}: {plan.content_length} {text.chars}{plan.has_structured_content ? ` | ${text.structuredJson}` : ''}
                                    </p>
                                )}
                                {plan.status === 'DRAFT' && <p className="text-xs text-yellow-400">{text.warningDraft}</p>}
                                {plan.status === 'ARCHIVED' && <p className="text-xs text-destructive">{text.archivedCannotAssign}</p>}
                            </div>
                        );
                    })()}
                    {(assignType === 'WORKOUT' ? filteredAssignableWorkoutPlans.length === 0 : filteredAssignableDietPlans.length === 0) && (
                        <p className="text-xs text-muted-foreground">
                            {assignType === 'WORKOUT'
                                ? text.noWorkoutTemplates
                                : text.noDietTemplates}
                        </p>
                    )}
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <button type="button" onClick={() => setIsAssignPlanOpen(false)} className="btn-ghost">{text.cancel}</button>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={
                                assignType === 'WORKOUT'
                                    ? filteredAssignableWorkoutPlans.length === 0 || plans.find(p => p.id === assignPlanId)?.status === 'ARCHIVED'
                                    : filteredAssignableDietPlans.length === 0 || dietPlans.find(p => p.id === assignPlanId)?.status === 'ARCHIVED'
                            }
                        >
                            {assignType === 'WORKOUT' ? <Dumbbell size={16} /> : <Utensils size={16} />}
                            {text.assignPlanAction}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* VIEW PROFILE MODAL */}
            <Modal isOpen={isViewOpen} onClose={() => setIsViewOpen(false)} title={text.memberProfile} maxWidthClassName="max-w-3xl">
                {viewMember && (
                    <div className="space-y-5">
                        <div className="kpi-card p-5 sm:p-6">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                {(() => {
                                    const imageUrl = resolveProfileImageUrl(viewMember.profile_picture_url);
                                    return (
                                        <div className="h-20 w-20 bg-primary/15 rounded-full flex items-center justify-center text-primary text-2xl font-bold overflow-hidden relative flex-shrink-0 border border-border/60">
                                            {canRenderImage(imageUrl) ? (
                                                <Image src={imageUrl as string} alt={viewMember.full_name} fill className="object-cover" unoptimized onError={() => markImageFailed(imageUrl)} />
                                            ) : (
                                                viewMember.full_name.charAt(0)
                                            )}
                                        </div>
                                    );
                                })()}
                                <div className="min-w-0 flex-1">
                                    <p className="text-2xl font-bold text-foreground font-serif tracking-tight truncate">{viewMember.full_name}</p>
                                    <p className="text-sm text-muted-foreground truncate">{viewMember.email}</p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <span className="inline-flex items-center rounded-full border border-border bg-muted/30 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                                            {roleLabel(viewMember.role)}
                                        </span>
                                        {viewMember.date_of_birth ? (
                                            <span className="inline-flex items-center rounded-full border border-border bg-muted/20 px-3 py-1 text-[11px] font-mono text-muted-foreground">
                                                {getAgeFromDob(viewMember.date_of_birth) ?? text.na} {text.age}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="kpi-card p-4">
                                <p className="text-xs text-muted-foreground uppercase tracking-[0.18em] font-semibold">{text.latestHeight}</p>
                                <p className="mt-2 text-lg font-bold text-foreground">
                                    {viewBiometrics.length > 0 && viewBiometrics[viewBiometrics.length - 1].height_cm
                                        ? `${viewBiometrics[viewBiometrics.length - 1].height_cm} cm`
                                        : text.na}
                                </p>
                            </div>
                            <div className="kpi-card p-4">
                                <p className="text-xs text-muted-foreground uppercase tracking-[0.18em] font-semibold">{text.latestWeight}</p>
                                <p className="mt-2 text-lg font-bold text-foreground">
                                    {viewBiometrics.length > 0 && viewBiometrics[viewBiometrics.length - 1].weight_kg
                                        ? `${viewBiometrics[viewBiometrics.length - 1].weight_kg} kg`
                                        : text.na}
                                </p>
                            </div>
                            <div className="kpi-card p-4 sm:col-span-2">
                                <p className="text-xs text-muted-foreground uppercase tracking-[0.18em] font-semibold mb-1">{text.phone}</p>
                                <p className="font-medium text-foreground">{viewMember.phone_number || text.na}</p>
                            </div>
                            <div className="kpi-card p-4">
                                <p className="text-xs text-muted-foreground uppercase tracking-[0.18em] font-semibold mb-1">{text.dateOfBirth}</p>
                                <p className="font-medium text-foreground">{viewMember.date_of_birth ? formatDate(viewMember.date_of_birth, { year: 'numeric', month: '2-digit', day: '2-digit' }) : text.na}</p>
                            </div>
                            <div className="kpi-card p-4">
                                <p className="text-xs text-muted-foreground uppercase tracking-[0.18em] font-semibold mb-1">{text.age}</p>
                                <p className="font-medium text-foreground">{getAgeFromDob(viewMember.date_of_birth) ?? text.na}</p>
                            </div>
                            <div className="kpi-card p-4 sm:col-span-2">
                                <p className="text-xs text-muted-foreground uppercase tracking-[0.18em] font-semibold mb-1">{text.emergencyContact}</p>
                                <p className="font-medium text-foreground">{viewMember.emergency_contact || text.na}</p>
                            </div>
                            <div className="kpi-card p-4 sm:col-span-2">
                                <p className="text-xs text-muted-foreground uppercase tracking-[0.18em] font-semibold mb-2">{text.bioNotes}</p>
                                <p className="font-medium text-foreground whitespace-pre-wrap leading-6">{viewMember.bio || text.noBio}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="kpi-card p-4">
                                <p className="text-xs text-muted-foreground uppercase tracking-[0.18em] font-semibold mb-2">{text.activeWorkoutPlans}</p>
                                {viewMemberDetail?.active_workout_plans?.length ? (
                                    <div className="flex flex-wrap gap-2">
                                        {viewMemberDetail.active_workout_plans.map((plan) => (
                                            <span key={plan.id} className="rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-foreground">
                                                {plan.name}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">{text.noActivePlans}</p>
                                )}
                            </div>
                            <div className="kpi-card p-4">
                                <p className="text-xs text-muted-foreground uppercase tracking-[0.18em] font-semibold mb-2">{text.activeDietPlans}</p>
                                {viewMemberDetail?.active_diet_plans?.length ? (
                                    <div className="flex flex-wrap gap-2">
                                        {viewMemberDetail.active_diet_plans.map((plan) => (
                                            <span key={plan.id} className="rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-foreground">
                                                {plan.name}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">{text.noActivePlans}</p>
                                )}
                            </div>
                        </div>

                        <div className="kpi-card p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-[0.18em] font-semibold">{text.workoutCharts}</p>
                                    <p className="text-sm text-muted-foreground mt-1">{chartRangeLabel}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {CHART_RANGE_OPTIONS.map((option) => {
                                        const active = chartRange === option.value;
                                        const label = option.value === '7d'
                                            ? (locale === 'ar' ? '7 أيام' : '7D')
                                            : option.value === '90d'
                                                ? (locale === 'ar' ? '90 يومًا' : '90D')
                                                : option.value === 'all'
                                                    ? (locale === 'ar' ? 'الكل' : 'All')
                                                    : (locale === 'ar' ? '30 يومًا' : '30D');
                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => {
                                                    setChartRange(option.value);
                                                    setChartsReady(false);
                                                }}
                                                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${active
                                                    ? 'border-primary bg-primary/10 text-primary'
                                                    : 'border-border bg-card/50 text-muted-foreground hover:text-foreground'
                                                    }`}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="kpi-card p-5 sm:p-6">
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-[0.18em] font-semibold">{text.progressVisualization}</p>
                                    <p className="text-sm text-muted-foreground mt-1">{biometricWeightData.length > 0 ? `${biometricWeightData.length} ${locale === 'ar' ? 'سجل وزن' : 'weight logs'}` : text.noBiometricData}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                                <div className="h-72 border border-border bg-muted/10 p-3 rounded-2xl">
                                    {viewLoading ? (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{text.loadingMemberData}</div>
                                    ) : biometricWeightData.length > 0 ? (
                                        <SafeResponsiveChart key={`bio-weight-${chartRange}`}>
                                            <LineChart data={biometricWeightData} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
                                                <XAxis
                                                    dataKey="date"
                                                    tickFormatter={(val) => formatDate(String(val), { year: 'numeric', month: '2-digit', day: '2-digit' })}
                                                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                                                    minTickGap={24}
                                                    axisLine={false}
                                                    tickLine={false}
                                                />
                                                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={36} />
                                                <Tooltip
                                                    labelFormatter={(label) => formatDate(String(label), { year: 'numeric', month: '2-digit', day: '2-digit' })}
                                                    formatter={(value: string | number | undefined) => `${Number(value ?? 0).toFixed(1)} kg`}
                                                    contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 }}
                                                    labelStyle={{ color: 'var(--foreground)' }}
                                                />
                                                <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" name={text.lineWeightKg} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                                            </LineChart>
                                        </SafeResponsiveChart>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{text.noBiometricData}</div>
                                    )}
                                </div>
                                <div className="h-72 border border-border bg-muted/10 p-3 rounded-2xl">
                                    {viewLoading ? (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{text.loadingMemberData}</div>
                                    ) : biometricBodyFatData.length > 0 ? (
                                        <SafeResponsiveChart key={`bio-bodyfat-${chartRange}`}>
                                            <LineChart data={biometricBodyFatData} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
                                                <XAxis dataKey="date" tickFormatter={(val) => formatDate(String(val), { month: '2-digit', day: '2-digit' })} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} minTickGap={24} axisLine={false} tickLine={false} />
                                                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={36} />
                                                <Tooltip
                                                    labelFormatter={(label) => formatDate(String(label), { year: 'numeric', month: '2-digit', day: '2-digit' })}
                                                    formatter={(value: string | number | undefined) => `${Number(value ?? 0).toFixed(1)}%`}
                                                    contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 }}
                                                    labelStyle={{ color: 'var(--foreground)' }}
                                                />
                                                <Line type="monotone" dataKey="value" stroke="#f97316" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" name={text.lineBodyFat} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                                            </LineChart>
                                        </SafeResponsiveChart>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{text.noBiometricData}</div>
                                    )}
                                </div>
                                <div className="h-72 border border-border bg-muted/10 p-3 rounded-2xl">
                                    {viewLoading ? (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{text.loadingMemberData}</div>
                                    ) : biometricMuscleData.length > 0 ? (
                                        <SafeResponsiveChart key={`bio-muscle-${chartRange}`}>
                                            <LineChart data={biometricMuscleData} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
                                                <XAxis dataKey="date" tickFormatter={(val) => formatDate(String(val), { month: '2-digit', day: '2-digit' })} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} minTickGap={24} axisLine={false} tickLine={false} />
                                                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={36} />
                                                <Tooltip
                                                    labelFormatter={(label) => formatDate(String(label), { year: 'numeric', month: '2-digit', day: '2-digit' })}
                                                    formatter={(value: string | number | undefined) => `${Number(value ?? 0).toFixed(1)} kg`}
                                                    contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 }}
                                                    labelStyle={{ color: 'var(--foreground)' }}
                                                />
                                                <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" name={text.lineMuscleKg} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                                            </LineChart>
                                        </SafeResponsiveChart>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{text.noBiometricData}</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="kpi-card p-5 sm:p-6">
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-[0.18em] font-semibold">{text.workoutCharts}</p>
                                    <p className="text-sm text-muted-foreground mt-1">{workoutChartData.length > 0 ? `${workoutChartData.length} ${locale === 'ar' ? 'أيام' : 'days'}` : text.noWorkoutChartData}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <div className="h-64 border border-border bg-muted/10 p-3 rounded-2xl">
                                    {chartsReady && workoutChartVolumeData.length > 0 ? (
                                        <SafeResponsiveChart key={`workout-volume-${chartRange}`}>
                                            <LineChart data={workoutChartVolumeData} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
                                                <XAxis
                                                    dataKey="date"
                                                    tickFormatter={(val) => formatDate(String(val), { month: '2-digit', day: '2-digit' })}
                                                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                                                    minTickGap={24}
                                                    axisLine={false}
                                                    tickLine={false}
                                                />
                                                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={36} />
                                                <Tooltip
                                                    labelFormatter={(label) => formatDate(String(label), { year: 'numeric', month: '2-digit', day: '2-digit' })}
                                                    formatter={(value: string | number | undefined) => `${Math.round(Number(value ?? 0))} kg`}
                                                    contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 }}
                                                    labelStyle={{ color: 'var(--foreground)' }}
                                                />
                                                <Line
                                                    type="monotone"
                                                    dataKey="value"
                                                    stroke="var(--primary)"
                                                    strokeWidth={3}
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    name={text.sessionLoad}
                                                    dot={false}
                                                    activeDot={{ r: 4, strokeWidth: 0 }}
                                                />
                                            </LineChart>
                                        </SafeResponsiveChart>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{viewLoading ? text.loadingMemberData : text.noWorkoutChartData}</div>
                                    )}
                                </div>
                                <div className="h-64 border border-border bg-muted/10 p-3 rounded-2xl">
                                    {chartsReady && workoutChartSessionsData.length > 0 ? (
                                        <SafeResponsiveChart key={`workout-count-${chartRange}`}>
                                            <LineChart data={workoutChartSessionsData} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
                                                <XAxis
                                                    dataKey="date"
                                                    tickFormatter={(val) => formatDate(String(val), { month: '2-digit', day: '2-digit' })}
                                                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                                                    minTickGap={24}
                                                    axisLine={false}
                                                    tickLine={false}
                                                />
                                                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
                                                <Tooltip
                                                    labelFormatter={(label) => formatDate(String(label), { year: 'numeric', month: '2-digit', day: '2-digit' })}
                                                    formatter={(value: string | number | undefined) => `${Math.round(Number(value ?? 0))}`}
                                                    contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 }}
                                                    labelStyle={{ color: 'var(--foreground)' }}
                                                />
                                                <Line
                                                    type="monotone"
                                                    dataKey="value"
                                                    stroke="#22c55e"
                                                    strokeWidth={3}
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    name={text.workoutTrend}
                                                    dot={false}
                                                    activeDot={{ r: 4, strokeWidth: 0 }}
                                                />
                                            </LineChart>
                                        </SafeResponsiveChart>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{viewLoading ? text.loadingMemberData : text.noWorkoutChartData}</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="kpi-card p-5 sm:p-6">
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-[0.18em] font-semibold">{text.recentAttendance}</p>
                                    <p className="text-sm text-muted-foreground mt-1">{viewMemberDetail?.recent_attendance?.length ? `${viewMemberDetail.recent_attendance.length} ${locale === 'ar' ? 'عملية' : 'check-ins'}` : text.noAttendance}</p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {viewMemberDetail?.recent_attendance?.length ? (
                                    viewMemberDetail.recent_attendance.map((entry) => (
                                        <div key={entry.id} className="rounded-xl border border-border bg-muted/10 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-semibold text-foreground">{formatDate(entry.scan_time, { year: 'numeric', month: '2-digit', day: '2-digit' })}</p>
                                                    <p className="text-xs text-muted-foreground mt-1">{entry.kiosk_id || text.na}</p>
                                                </div>
                                                <span className="text-xs font-mono text-muted-foreground">{entry.status}</span>
                                            </div>
                                            {entry.reason ? <p className="mt-2 text-xs text-muted-foreground">{entry.reason}</p> : null}
                                        </div>
                                    ))
                                ) : (
                                    <div className="rounded-2xl border border-dashed border-border bg-muted/5 px-4 py-8 text-center text-sm text-muted-foreground">
                                        {text.noAttendance}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="kpi-card p-5 sm:p-6">
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-[0.18em] font-semibold">{text.workoutSessionLogs}</p>
                                    <p className="text-sm text-muted-foreground mt-1">{viewSessions.length > 0 ? `${viewSessions.length} ${locale === 'ar' ? 'جلسة' : 'sessions'}` : text.noWorkoutSessions}</p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {viewSessions.length > 0 ? (
                                    viewSessions.slice(0, 10).map((session) => {
                                        const sessionVolume = getSessionVolume(session);
                                        return (
                                            <div key={session.id} className="rounded-2xl border border-border bg-muted/10 p-4 space-y-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-semibold text-foreground">
                                                            {formatDate(session.performed_at, { year: 'numeric', month: '2-digit', day: '2-digit' })}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground mt-1 font-mono">
                                                            {session.entries.filter((entry) => !entry.skipped).length} {text.exercises}
                                                        </p>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground font-mono text-right">
                                                        {Math.round(sessionVolume)} {text.volumeKg}
                                                    </p>
                                                </div>
                                                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                                    {session.duration_minutes != null && <span className="rounded-full border border-border bg-card/50 px-2 py-1">{session.duration_minutes} min</span>}
                                                    {session.rpe != null && <span className="rounded-full border border-border bg-card/50 px-2 py-1">RPE {session.rpe}</span>}
                                                    {session.pain_level != null && <span className="rounded-full border border-border bg-card/50 px-2 py-1">Pain {session.pain_level}</span>}
                                                    {session.effort_feedback && <span className="rounded-full border border-border bg-card/50 px-2 py-1">{session.effort_feedback.replace('_', ' ')}</span>}
                                                    {session.attachment_url && <span className="rounded-full border border-border bg-card/50 px-2 py-1">Attachment</span>}
                                                </div>
                                                {session.notes && <p className="text-xs text-muted-foreground leading-6">{session.notes}</p>}
                                                <div className="space-y-2">
                                                    {session.entries.slice(0, 3).map((entry) => (
                                                        <div key={entry.id} className="rounded-xl border border-border/70 bg-card/60 p-3 text-xs">
                                                            <div className="flex justify-between gap-3">
                                                                <span className="text-muted-foreground">
                                                                    {entry.exercise_name || text.workout}{entry.is_pr ? ' PR' : ''}
                                                                </span>
                                                                <span className="text-muted-foreground font-mono text-right">
                                                                    {entry.skipped
                                                                        ? 'Skipped'
                                                                        : `${entry.sets_completed}x${entry.reps_completed} @ ${entry.weight_kg ?? 0}kg • ${Math.round(getEntryVolume(entry))} ${text.volumeKg}`}
                                                                </span>
                                                            </div>
                                                            {entry.set_details?.length ? (
                                                                <p className="mt-2 text-[10px] text-muted-foreground font-mono leading-5">
                                                                    {entry.set_details.map((row) => `${row.set}: ${row.reps} @ ${row.weightKg ?? 0}kg`).join(' | ')}
                                                                </p>
                                                            ) : null}
                                                            {entry.notes ? <p className="mt-2 text-[10px] text-muted-foreground leading-5">{entry.notes}</p> : null}
                                                        </div>
                                                    ))}
                                                    {session.entries.length > 3 && (
                                                        <p className="text-[10px] text-primary font-mono">+{session.entries.length - 3} {text.moreExercises}</p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="rounded-2xl border border-dashed border-border bg-muted/5 px-4 py-10 text-center text-sm text-muted-foreground">
                                        {text.noWorkoutSessions}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <div className="kpi-card p-5 space-y-3">
                                <p className="text-xs text-muted-foreground uppercase tracking-[0.18em] font-semibold">{text.workoutFeedback}</p>
                                {viewMemberDetail?.workout_feedback?.length ? (
                                    viewMemberDetail.workout_feedback.slice(0, 3).map((item) => (
                                        <div key={item.id} className="rounded-xl border border-border bg-muted/10 p-3">
                                            <p className="text-sm font-semibold text-foreground">{item.plan_name || text.na}</p>
                                            <p className="text-xs text-muted-foreground mt-1">{formatDate(item.date, { year: 'numeric', month: '2-digit', day: '2-digit' })}</p>
                                            <p className="text-xs text-muted-foreground mt-2">{item.comment || text.noFeedback}</p>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-muted-foreground">{text.noFeedback}</p>
                                )}
                            </div>
                            <div className="kpi-card p-5 space-y-3">
                                <p className="text-xs text-muted-foreground uppercase tracking-[0.18em] font-semibold">{text.dietFeedback}</p>
                                {viewMemberDetail?.diet_feedback?.length ? (
                                    viewMemberDetail.diet_feedback.slice(0, 3).map((item) => (
                                        <div key={item.id} className="rounded-xl border border-border bg-muted/10 p-3">
                                            <p className="text-sm font-semibold text-foreground">{item.diet_plan_name || text.na}</p>
                                            <p className="text-xs text-muted-foreground mt-1">{formatDate(item.created_at, { year: 'numeric', month: '2-digit', day: '2-digit' })}</p>
                                            <p className="text-xs text-muted-foreground mt-2">{item.comment || text.noFeedback}</p>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-muted-foreground">{text.noFeedback}</p>
                                )}
                            </div>
                            <div className="kpi-card p-5 space-y-3">
                                <p className="text-xs text-muted-foreground uppercase tracking-[0.18em] font-semibold">{text.gymFeedback}</p>
                                {viewMemberDetail?.gym_feedback?.length ? (
                                    viewMemberDetail.gym_feedback.slice(0, 3).map((item) => (
                                        <div key={item.id} className="rounded-xl border border-border bg-muted/10 p-3">
                                            <p className="text-sm font-semibold text-foreground">{item.category}</p>
                                            <p className="text-xs text-muted-foreground mt-1">{formatDate(item.created_at, { year: 'numeric', month: '2-digit', day: '2-digit' })}</p>
                                            <p className="text-xs text-muted-foreground mt-2">{item.comment || text.noFeedback}</p>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-muted-foreground">{text.noFeedback}</p>
                                )}
                            </div>
                        </div>

                        {canMessageClient && (
                            <div className="pt-1">
                                <button
                                    type="button"
                                    className="btn-primary w-full justify-center py-4 text-base"
                                    onClick={() => handleMessageClient(viewMember.id)}
                                >
                                    <MessageCircle size={16} /> {text.messageClient}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
}
