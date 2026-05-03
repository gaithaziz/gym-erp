'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Pencil, Calculator, Save, Plus, Download, Eye, EyeOff, UserX, UserCheck } from 'lucide-react';
import Modal from '@/components/Modal';
import { useFeedback } from '@/components/FeedbackProvider';
import { useAuth } from '@/context/AuthContext';
import TablePagination from '@/components/TablePagination';
import { BranchSelector } from '@/components/BranchSelector';
import { resolveProfileImageUrl } from '@/lib/profileImage';
import { downloadBlob } from '@/lib/download';
import { useBranch } from '@/context/BranchContext';
import { useLocale } from '@/context/LocaleContext';
import { getBranchParams } from '@/lib/branch';

interface BranchOption {
    id: string;
    name: string;
    display_name?: string | null;
    gym_name?: string;
}

interface StaffMember {
    id: string;
    full_name: string;
    email: string;
    role: string;
    is_active?: boolean;
    profile_picture_url?: string;
    phone_number?: string;
    date_of_birth?: string;
    emergency_contact?: string;
    bio?: string;
    contract: {
        type: string;
        base_salary: number;
        commission_rate: number;
        start_date?: string | null;
        end_date?: string | null;
        standard_hours?: number | null;
    } | null;
}

type StaffRole = 'MANAGER' | 'COACH' | 'EMPLOYEE' | 'CASHIER' | 'RECEPTION' | 'FRONT_DESK';
type StaffRoleFilter = 'ALL' | StaffRole;

const STAFF_ROLES: StaffRole[] = ['MANAGER', 'COACH', 'EMPLOYEE', 'CASHIER', 'RECEPTION', 'FRONT_DESK'];

const todayDateInput = () => new Date().toISOString().split('T')[0];

const getDefaultAddForm = (branchId = '') => ({
    full_name: '',
    email: '',
    password: 'password123',
    role: 'COACH',
    home_branch_id: branchId,
    base_salary: 0,
    start_date: todayDateInput(),
    end_date: '',
});

const defaultEditForm = {
    start_date: todayDateInput(),
    end_date: '',
    money_per_hour: 0,
    standard_hours: 160,
};
const STAFF_PAGE_SIZE = 10;

export default function StaffPage() {
    const { locale, formatNumber } = useLocale();
    const { showToast, confirm } = useFeedback();
    const { user } = useAuth();
    const router = useRouter();
    const { branches, selectedBranchId, setSelectedBranchId } = useBranch();
    const isAdmin = user?.role === 'ADMIN';
    const initialBranchId = selectedBranchId !== 'all' ? selectedBranchId : branches[0]?.id || '';
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [addWizardStep, setAddWizardStep] = useState<1 | 2>(1);
    const [addForm, setAddForm] = useState(() => getDefaultAddForm(initialBranchId));
    const [showAddPassword, setShowAddPassword] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<StaffMember | null>(null);
    const [editForm, setEditForm] = useState(defaultEditForm);
    const [roleFilter, setRoleFilter] = useState<StaffRoleFilter>('ALL');
    const [isPayrollOpen, setIsPayrollOpen] = useState(false);
    const [payrollTarget, setPayrollTarget] = useState<StaffMember | null>(null);
    const [payrollForm, setPayrollForm] = useState({ manual_deductions: 0 });
    const [payrollResult, setPayrollResult] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

    const [failedImageUrls, setFailedImageUrls] = useState<Record<string, true>>({});
    const [staffPage, setStaffPage] = useState(1);
    const selectedAddBranch = branches.find((branch) => branch.id === addForm.home_branch_id);
    const selectedPayrollBranch = selectedBranchId !== 'all'
        ? branches.find((branch) => branch.id === selectedBranchId)
        : null;
    const txt = locale === 'ar'
        ? {
            manager: 'مدير',
            coach: 'مدرب',
            employee: 'موظف',
            cashier: 'كاشير',
            reception: 'استقبال',
            frontDesk: 'مكتب أمامي',
            failedCreate: 'فشل في إنشاء موظف.',
            failedUpdate: 'فشل في تحديث العقد.',
            failedGeneratePayroll: 'فشل في إنشاء مسير الرواتب.',
            failedPayslip: 'فشل في تنزيل قسيمة الراتب',
            fullTimeOnlyPayroll: 'يمكن إنشاء مسير الرواتب للدوام الكامل فقط.',
            automaticDeductions: 'الخصومات التلقائية',
            manualDeductions: 'خصومات اختيارية',
            optionalDeductionsNote: 'اختياري. يضاف هذا المبلغ إلى الخصومات التلقائية.',
            title: 'إدارة الموظفين',
            subtitle: 'موظفون',
            of: 'من',
            allRoles: 'كل الأدوار',
            addNew: 'إضافة موظف جديد',
            name: 'الاسم',
            role: 'الدور',
            contract: 'العقد',
            salary: 'الراتب',
            actions: 'الإجراءات',
            noStaff: 'لا يوجد موظفون بعد',
            noContract: 'بدون عقد',
            viewProfile: 'عرض الملف',
            view: 'عرض',
            edit: 'تعديل',
            payroll: 'الرواتب',
            active: 'نشط',
            inactive: 'غير نشط',
            deactivate: 'تعطيل',
            activate: 'تفعيل',
            confirmDeactivateTitle: 'تأكيد التعطيل',
            confirmDeactivateDesc: 'سيتم تعطيل حساب الموظف ومنعه من الدخول إلى النظام.',
            confirmActivateTitle: 'تأكيد التفعيل',
            confirmActivateDesc: 'سيتم إعادة تفعيل حساب الموظف وإرجاع صلاحية الدخول.',
            adminOnly: 'للمدير فقط',
            addModal: 'إضافة موظف جديد',
            fullName: 'الاسم الكامل',
            email: 'البريد الإلكتروني',
            password: 'كلمة المرور',
            branch: 'الفرع',
            contractType: 'نوع العقد',
            fullTime: 'دوام كامل',
            baseSalary: 'الراتب الأساسي (JOD)',
            contractStartDate: 'تاريخ بدء العقد',
            contractEndDate: 'تاريخ انتهاء العقد (اختياري)',
            branchRequired: 'يجب اختيار فرع قبل حفظ الموظف.',
            cancel: 'إلغاء',
            saveStaff: 'حفظ الموظف',
            editContract: 'تعديل العقد - ',
            fullTimeInfo: 'دوام كامل',
            fullTimeInfoDesc: 'اضبط العقد بالترتيب الزمني والأجر الشهري.',
            startDate: 'تاريخ البدء',
            endDateOptional: 'تاريخ الانتهاء (اختياري)',
            moneyPerHour: 'الأجر لكل ساعة (JOD)',
            standardHours: 'الساعات القياسية / شهر',
            updateContract: 'تحديث العقد',
            generatePayroll: 'تشغيل مسير الرواتب',
            payrollFor: 'الموظف',
            payrollBranch: 'الفرع',
            catchUpNote: 'يُحسب اعتمادًا على أيام الحضور منذ آخر مسير معتمد/مدفوع.',
            catchUpSummary: 'الحساب اليدوي',
            periodRange: 'فترة المسير',
            workedDays: 'أيام العمل',
            generate: 'إنشاء',
            payrollGenerated: 'تم إنشاء مسير الرواتب بنجاح',
            payrollSummary: 'نظرة عامة',
            payrollBreakdown: 'تفاصيل المسير',
            basePay: 'الأجر الأساسي',
            overtimePay: 'أجر العمل الإضافي',
            deductions: 'الخصومات',
            netPay: 'الصافي',
            close: 'إغلاق',
            downloadSlip: 'تنزيل القسيمة',
            currency: 'دينار',
            fullTimeContract: 'دوام كامل',
        }
        : {
            manager: 'Manager',
            coach: 'Coach',
            employee: 'Employee',
            cashier: 'Cashier',
            reception: 'Reception',
            frontDesk: 'Front Desk',
            failedCreate: 'Failed to create staff member.',
            failedUpdate: 'Failed to update contract.',
            failedGeneratePayroll: 'Failed to generate payroll.',
            failedPayslip: 'Failed to download payslip',
            fullTimeOnlyPayroll: 'Payroll can only be generated for full-time employees.',
            automaticDeductions: 'Automatic Deductions',
            manualDeductions: 'Optional Deductions',
            optionalDeductionsNote: 'Optional. This amount is added to the automatic deductions.',
            title: 'Staff Management',
            subtitle: 'staff members',
            of: 'of',
            allRoles: 'All Roles',
            addNew: 'Add New Staff',
            name: 'Name',
            role: 'Role',
            contract: 'Contract',
            salary: 'Salary',
            actions: 'Actions',
            noStaff: 'No staff members yet',
            noContract: 'No Contract',
            viewProfile: 'View Profile',
            view: 'View',
            edit: 'Edit',
            payroll: 'Payroll',
            active: 'Active',
            inactive: 'Inactive',
            deactivate: 'Deactivate',
            activate: 'Reactivate',
            confirmDeactivateTitle: 'Confirm deactivation',
            confirmDeactivateDesc: 'This will deactivate the employee account and prevent access to the system.',
            confirmActivateTitle: 'Confirm reactivation',
            confirmActivateDesc: 'This will reactivate the employee account and restore access.',
            adminOnly: 'Admin only',
            addModal: 'Add New Staff Member',
            fullName: 'Full Name',
            email: 'Email',
            password: 'Password',
            branch: 'Branch',
            contractType: 'Contract',
            fullTime: 'Full Time',
            baseSalary: 'Base Salary (JOD)',
            contractStartDate: 'Contract Start Date',
            contractEndDate: 'Contract End Date (Optional)',
            branchRequired: 'You must choose a branch before saving the staff member.',
            cancel: 'Cancel',
            saveStaff: 'Save Staff',
            editContract: 'Edit Contract - ',
            fullTimeInfo: 'Full Time',
            fullTimeInfoDesc: 'Set up the contract dates and monthly pay.',
            startDate: 'Start Date',
            endDateOptional: 'End Date (Optional)',
            moneyPerHour: 'Money Per Hour (JOD)',
            standardHours: 'Standard Hours / Month',
            updateContract: 'Update Contract',
            generatePayroll: 'Run Payroll',
            payrollFor: 'Employee',
            payrollBranch: 'Branch',
            catchUpNote: 'Calculates from attendance days since the last approved/paid payroll.',
            catchUpSummary: 'Manual calculation',
            periodRange: 'Period range',
            workedDays: 'Worked days',
            generate: 'Generate',
            payrollGenerated: 'Payroll Generated Successfully',
            payrollSummary: 'Overview',
            payrollBreakdown: 'Payroll Breakdown',
            basePay: 'Base Pay',
            overtimePay: 'Overtime Pay',
            deductions: 'Deductions',
            netPay: 'Net Pay',
            close: 'Close',
            downloadSlip: 'Download Slip',
            currency: 'JOD',
            fullTimeContract: 'Full time',
        };

    const roleLabelsLocalized: Record<StaffRole, string> = {
        MANAGER: txt.manager,
        COACH: txt.coach,
        EMPLOYEE: txt.employee,
        CASHIER: txt.cashier,
        RECEPTION: txt.reception,
        FRONT_DESK: txt.frontDesk,
    };
    const filteredStaff = useMemo(() => {
        if (roleFilter === 'ALL') return staff;
        return staff.filter((member) => member.role === roleFilter);
    }, [roleFilter, staff]);
    const totalStaffPages = Math.max(1, Math.ceil(filteredStaff.length / STAFF_PAGE_SIZE));
    const safeStaffPage = Math.min(staffPage, totalStaffPages);
    const visibleStaff = filteredStaff.slice((safeStaffPage - 1) * STAFF_PAGE_SIZE, safeStaffPage * STAFF_PAGE_SIZE);

    const getRoleBadgeClass = (role: string) => {
        switch (role) {
            case 'MANAGER':
                return 'badge-violet';
            case 'COACH':
                return 'badge-orange';
            case 'EMPLOYEE':
                return 'badge-blue';
            case 'CASHIER':
                return 'badge-green';
            case 'RECEPTION':
                return 'badge-indigo';
            case 'FRONT_DESK':
                return 'badge-purple';
            default:
                return 'badge-gray';
        }
    };

    const getContractBadgeClass = (contractType?: string | null) => {
        switch (contractType) {
            case 'FULL_TIME':
                return 'badge-green';
            default:
                return 'badge-amber';
        }
    };
    const contractTypeLabel = (contractType?: string | null) => {
        switch (contractType) {
            case 'FULL_TIME':
                return txt.fullTimeContract;
            default:
                return txt.noContract;
        }
    };

    const openView = (member: StaffMember) => {
        router.push(`/dashboard/admin/staff/${member.id}`);
    };

    const markImageFailed = (url?: string) => {
        if (!url) return;
        setFailedImageUrls(prev => ({ ...prev, [url]: true }));
    };

    const canRenderImage = (url?: string) => !!url && !failedImageUrls[url];

    const fetchStaff = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const res = await api.get('/hr/staff', { params: getBranchParams(selectedBranchId) });
            setStaff(res.data.data);
        } catch (err) {
            console.error(err);
            setLoadError(locale === 'ar' ? 'فشل تحميل الموظفين.' : 'Failed to load staff.');
        } finally {
            setLoading(false);
        }
    }, [locale, selectedBranchId]);

    useEffect(() => { void fetchStaff(); }, [fetchStaff]);

    useEffect(() => {
        if (!isAddOpen) return;
        setAddForm((current) => {
            if (current.home_branch_id && branches.some((branch) => branch.id === current.home_branch_id)) {
                return current;
            }
            return {
                ...current,
                home_branch_id: initialBranchId,
            };
        });
    }, [branches, initialBranchId, isAddOpen]);

    const closeAddWizard = () => {
        setIsAddOpen(false);
        setAddWizardStep(1);
        setShowAddPassword(false);
        setAddForm(getDefaultAddForm(initialBranchId));
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!addForm.home_branch_id) {
            showToast(txt.branchRequired, 'error');
            return;
        }
        try {
            const userRes = await api.post('/auth/register', {
                email: addForm.email, password: addForm.password,
                full_name: addForm.full_name, role: addForm.role,
                home_branch_id: addForm.home_branch_id,
            });
            const userId = userRes.data.data.id;
            await api.post('/hr/contracts', {
                user_id: userId, contract_type: 'FULL_TIME',
                base_salary: Number(addForm.base_salary), commission_rate: 0,
                start_date: addForm.start_date,
                end_date: addForm.end_date || null,
                standard_hours: 160,
            });
            closeAddWizard();
            fetchStaff();
        } catch (err) {
            console.error(err);
            showToast(txt.failedCreate, 'error');
        }
    };

    const openEdit = (member: StaffMember) => {
        setEditTarget(member);
        const standardHours = member.contract?.standard_hours && member.contract.standard_hours > 0
            ? member.contract.standard_hours
            : 160;
        const monthlyBase = Number(member.contract?.base_salary || 0);
        const hourlyRate = standardHours > 0 ? monthlyBase / standardHours : 0;
        setEditForm({
            start_date: member.contract?.start_date || todayDateInput(),
            end_date: member.contract?.end_date || '',
            money_per_hour: Number(hourlyRate.toFixed(2)),
            standard_hours: standardHours,
        });
        setIsEditOpen(true);
    };

    const handleEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editTarget) return;
        try {
            const standardHours = Number(editForm.standard_hours) > 0 ? Number(editForm.standard_hours) : 160;
            const hourlyRate = Number(editForm.money_per_hour);
            const baseSalary = Number((hourlyRate * standardHours).toFixed(2));
            await api.post('/hr/contracts', {
                user_id: editTarget.id,
                contract_type: 'FULL_TIME',
                base_salary: baseSalary,
                commission_rate: 0,
                start_date: editForm.start_date,
                end_date: editForm.end_date || null,
                standard_hours: standardHours,
            });
            setIsEditOpen(false);
            setEditTarget(null);
            fetchStaff();
        } catch (err) {
            console.error(err);
            showToast(txt.failedUpdate, 'error');
        }
    };

    const openPayroll = (member: StaffMember) => {
        if (member.contract?.type !== 'FULL_TIME') {
            showToast(txt.fullTimeOnlyPayroll, 'error');
            return;
        }
        setPayrollTarget(member);
        setPayrollResult(null);
        setPayrollForm({ manual_deductions: 0 });
        setIsPayrollOpen(true);
    };

    const handlePayroll = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!payrollTarget) return;
        try {
            const res = await api.post('/hr/payroll/generate', {
                user_id: payrollTarget.id,
                month: new Date().getMonth() + 1,
                year: new Date().getFullYear(),
                manual_deductions: Number(payrollForm.manual_deductions),
                from_last_paid: true,
                calculation_mode: 'DAYS_WORKED',
            });
            setPayrollResult(res.data.data);
        } catch (err) {
            console.error(err);
            showToast(txt.failedGeneratePayroll, 'error');
        }
    };

    const toggleStaffActive = async (member: StaffMember) => {
        if (!isAdmin) {
            showToast(txt.adminOnly, 'error');
            return;
        }
        const shouldDeactivate = member.is_active !== false;
        const accepted = await confirm({
            title: shouldDeactivate ? txt.confirmDeactivateTitle : txt.confirmActivateTitle,
            description: shouldDeactivate ? txt.confirmDeactivateDesc : txt.confirmActivateDesc,
            confirmText: shouldDeactivate ? txt.deactivate : txt.activate,
            destructive: shouldDeactivate,
        });
        if (!accepted) return;
        try {
            if (shouldDeactivate) {
                await api.delete(`/users/${member.id}`);
            } else {
                await api.put(`/users/${member.id}`, { is_active: true });
            }
            showToast(shouldDeactivate ? (locale === 'ar' ? 'تم تعطيل الموظف.' : 'Staff deactivated.') : (locale === 'ar' ? 'تم تفعيل الموظف.' : 'Staff reactivated.'), 'success');
            await fetchStaff();
        } catch (err) {
            console.error(err);
            showToast(locale === 'ar' ? 'فشل تحديث حالة الموظف.' : 'Failed to update staff status.', 'error');
        }
    };

    const handlePrintPayslip = async (payrollId: string) => {
        try {
            const res = await api.get(`/hr/payroll/${payrollId}/payslip/export-pdf`, { responseType: 'blob' });
            downloadBlob(res.data as Blob, `payslip_${payrollId.slice(0, 8).toUpperCase()}.pdf`);
        } catch {
            showToast(txt.failedPayslip, 'error');
        }
    };

    if (loading && !loadError) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
        </div>
    );

    return (
        <div className="space-y-8">
            {loadError ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <span>{loadError}</span>
                    <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => void fetchStaff()}>
                        {locale === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                    </button>
                </div>
            ) : null}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{txt.title}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{filteredStaff.length} {txt.of} {staff.length} {txt.subtitle}</p>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <BranchSelector
                        branches={branches}
                        selectedBranchId={selectedBranchId}
                        onSelect={setSelectedBranchId}
                    />
                    <select className="input-dark min-w-[180px]" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as StaffRoleFilter)}>
                        <option value="ALL">{txt.allRoles}</option>
                        {STAFF_ROLES.map((role) => (
                            <option key={role} value={role}>{roleLabelsLocalized[role]}</option>
                        ))}
                    </select>
                    <button onClick={() => {
                        setAddWizardStep(1);
                        setAddForm(getDefaultAddForm(initialBranchId));
                        setIsAddOpen(true);
                    }} className="btn-primary whitespace-nowrap">
                        <Plus size={18} /> {txt.addNew}
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="chart-card overflow-hidden !p-0 border border-border">
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-start table-dark min-w-[600px]">
                        <thead>
                            <tr>
                                <th>{txt.name}</th>
                                <th>{txt.role}</th>
                                <th>{txt.contract}</th>
                                <th>{txt.salary}</th>
                                <th>{txt.active}</th>
                                <th className="text-center">{txt.actions}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStaff.length === 0 && (
                                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">{txt.noStaff}</td></tr>
                            )}
                            {visibleStaff.map((member) => (
                                <tr key={member.id}>
                                    <td>
                                        {(() => {
                                            const imageUrl = resolveProfileImageUrl(member.profile_picture_url);
                                            return (
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold overflow-hidden relative flex-shrink-0">
                                                {canRenderImage(imageUrl) ? (
                                                    <Image src={imageUrl as string} alt={member.full_name} fill className="object-cover" unoptimized onError={() => markImageFailed(imageUrl)} />
                                                ) : (
                                                    member.full_name.charAt(0)
                                                )}
                                            </div>
                                            <div>
                                                <div className="font-medium text-foreground">{member.full_name}</div>
                                                <div className="text-xs text-muted-foreground">{member.email}</div>
                                            </div>
                                        </div>
                                            );
                                        })()}
                                    </td>
                                    <td>
                                        <span className={`badge ${getRoleBadgeClass(member.role)}`}>
                                            {roleLabelsLocalized[member.role as StaffRole] || member.role}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`badge ${getContractBadgeClass(member.contract?.type)}`}>
                                            {contractTypeLabel(member.contract?.type)}
                                        </span>
                                    </td>
                                    <td className="font-mono text-sm text-foreground">
                                        {member.contract ? (
                                            <div>{formatNumber(member.contract.base_salary)} {txt.currency}</div>
                                        ) : '-'}
                                    </td>
                                    <td>
                                        <span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider font-mono ${member.is_active !== false ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>
                                            {member.is_active !== false ? txt.active : txt.inactive}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="flex items-center justify-center gap-2">
                                            <button onClick={() => openView(member)} className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-xs font-medium px-2 py-1 rounded-lg hover:bg-emerald-400/10 transition-colors" title={txt.viewProfile}>
                                                <Eye size={13} /> {txt.view}
                                            </button>
                                            <button onClick={() => openEdit(member)} className="flex items-center gap-1 text-primary hover:text-primary/80 text-xs font-medium px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors">
                                                <Pencil size={13} /> {txt.edit}
                                            </button>
                                            <button
                                                onClick={() => openPayroll(member)}
                                                disabled={member.contract?.type !== 'FULL_TIME'}
                                                className="flex items-center gap-1 text-emerald-500 hover:text-emerald-400 text-xs font-medium px-2 py-1 rounded-lg hover:bg-emerald-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                <Calculator size={13} /> {txt.payroll}
                                            </button>
                                            <button
                                                onClick={() => void toggleStaffActive(member)}
                                                disabled={!isAdmin}
                                                className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition-colors ${
                                                    member.is_active !== false
                                                        ? 'text-red-400 hover:text-red-300 hover:bg-red-400/10'
                                                        : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10'
                                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                                            >
                                                {member.is_active !== false ? <UserX size={13} /> : <UserCheck size={13} />}
                                                {member.is_active !== false ? txt.deactivate : txt.activate}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="md:hidden divide-y divide-border">
                    {filteredStaff.length === 0 && (
                        <div className="px-4 py-8 text-center text-sm text-muted-foreground">{txt.noStaff}</div>
                    )}
                    {visibleStaff.map((member) => (
                        <div key={member.id} className="p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    {(() => {
                                        const imageUrl = resolveProfileImageUrl(member.profile_picture_url);
                                        return (
                                    <div className="h-10 w-10 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold overflow-hidden relative flex-shrink-0">
                                        {canRenderImage(imageUrl) ? (
                                            <Image src={imageUrl as string} alt={member.full_name} fill className="object-cover" unoptimized onError={() => markImageFailed(imageUrl)} />
                                        ) : (
                                            member.full_name.charAt(0)
                                        )}
                                    </div>
                                        );
                                    })()}
                                    <div className="min-w-0">
                                        <p className="font-medium text-foreground truncate">{member.full_name}</p>
                                        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                                    </div>
                                </div>
                                <span className={`badge ${getRoleBadgeClass(member.role)}`}>
                                    {roleLabelsLocalized[member.role as StaffRole] || member.role}
                                </span>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-sm border border-border bg-muted/20 p-2">
                                    <p className="text-muted-foreground">{txt.contract}</p>
                                    <div className="mt-1">
                                        <span className={`badge ${getContractBadgeClass(member.contract?.type)}`}>
                                            {contractTypeLabel(member.contract?.type)}
                                        </span>
                                    </div>
                                </div>
                                <div className="rounded-sm border border-border bg-muted/20 p-2">
                                    <p className="text-muted-foreground">{txt.salary}</p>
                                    <p className="mt-0.5 font-medium text-foreground">
                                        {member.contract ? `${formatNumber(member.contract.base_salary)} ${txt.currency}` : '--'}
                                    </p>
                                </div>
                                <div className="rounded-sm border border-border bg-muted/20 p-2">
                                    <p className="text-muted-foreground">{txt.active}</p>
                                    <div className="mt-1">
                                        <span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider font-mono ${member.is_active !== false ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>
                                            {member.is_active !== false ? txt.active : txt.inactive}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-3 grid grid-cols-4 gap-2">
                                <button onClick={() => openView(member)} className="btn-ghost !px-2 !py-2 h-auto text-xs text-emerald-400 hover:text-emerald-300 justify-center" title={txt.viewProfile}>
                                    <Eye size={13} /> {txt.view}
                                </button>
                                <button onClick={() => openEdit(member)} className="btn-ghost !px-2 !py-2 h-auto text-xs text-primary hover:text-primary/80 justify-center">
                                    <Pencil size={13} /> {txt.edit}
                                </button>
                                <button
                                    onClick={() => openPayroll(member)}
                                    disabled={member.contract?.type !== 'FULL_TIME'}
                                    className="btn-ghost !px-2 !py-2 h-auto text-xs text-emerald-500 hover:text-emerald-400 justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Calculator size={13} /> {txt.payroll}
                                </button>
                                <button
                                    onClick={() => void toggleStaffActive(member)}
                                    disabled={!isAdmin}
                                    className={`btn-ghost !px-2 !py-2 h-auto text-xs justify-center ${member.is_active !== false ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'} disabled:opacity-40 disabled:cursor-not-allowed`}
                                >
                                    {member.is_active !== false ? <UserX size={13} /> : <UserCheck size={13} />}
                                    {member.is_active !== false ? txt.deactivate : txt.activate}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <TablePagination
                    page={safeStaffPage}
                    totalPages={totalStaffPages}
                    onPrevious={() => setStaffPage((prev) => Math.max(1, prev - 1))}
                    onNext={() => setStaffPage((prev) => Math.min(totalStaffPages, prev + 1))}
                />
            </div>

            {/* ADD MODAL */}
            <Modal isOpen={isAddOpen} onClose={closeAddWizard} title={txt.addModal} maxWidthClassName="max-w-2xl">
                <form onSubmit={handleAdd} className="space-y-4">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        <span className={`rounded-full px-2 py-1 ${addWizardStep === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted/40'}`}>1</span>
                        <span>{txt.branch}</span>
                        <span className="h-px w-8 bg-border" />
                        <span className={`rounded-full px-2 py-1 ${addWizardStep === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted/40'}`}>2</span>
                        <span>{txt.saveStaff}</span>
                    </div>

                    {addWizardStep === 1 ? (
                        <div className="space-y-4">
                            <div className="rounded-xl border border-border bg-muted/20 p-4">
                                <p className="text-sm font-semibold text-foreground">{txt.branch}</p>
                                <p className="text-xs text-muted-foreground mt-1">{txt.branchRequired}</p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.branch}</label>
                                <select
                                    className="input-dark"
                                    value={addForm.home_branch_id}
                                    onChange={e => setAddForm({ ...addForm, home_branch_id: e.target.value })}
                                    required
                                >
                                    <option value="">{txt.branch}</option>
                                    {branches.map((branch) => (
                                        <option key={branch.id} value={branch.id}>
                                            {[branch.display_name || branch.name, branch.gym_name].filter(Boolean).join(' - ')}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={closeAddWizard} className="btn-ghost">{txt.cancel}</button>
                                <button type="button" className="btn-primary" disabled={!addForm.home_branch_id} onClick={() => setAddWizardStep(2)}>
                                    {locale === 'ar' ? 'التالي' : 'Next'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-xl border border-border bg-muted/20 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{txt.branch}</p>
                                <p className="mt-1 text-sm font-medium text-foreground">
                                    {[selectedAddBranch?.display_name || selectedAddBranch?.name, selectedAddBranch?.gym_name].filter(Boolean).join(' - ')}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {locale === 'ar' ? 'يمكنك الرجوع لتغيير الفرع قبل الحفظ.' : 'Go back if you need to change the branch before saving.'}
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.fullName}</label>
                                <input type="text" required className="input-dark" value={addForm.full_name} onChange={e => setAddForm({ ...addForm, full_name: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.email}</label>
                                <input type="email" required className="input-dark" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.password}</label>
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.role}</label>
                                    <select className="input-dark" value={addForm.role} onChange={e => setAddForm({ ...addForm, role: e.target.value })}>
                                        {STAFF_ROLES.map((role) => (
                                            <option key={role} value={role}>{roleLabelsLocalized[role]}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.baseSalary}</label>
                                    <input type="number" className="input-dark" value={addForm.base_salary} onChange={e => setAddForm({ ...addForm, base_salary: Number(e.target.value) })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.contractStartDate}</label>
                                    <input
                                        type="date"
                                        className="input-dark"
                                        value={addForm.start_date}
                                        onChange={e => setAddForm({ ...addForm, start_date: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.contractEndDate}</label>
                                    <input
                                        type="date"
                                        className="input-dark"
                                        value={addForm.end_date}
                                        min={addForm.start_date || undefined}
                                        onChange={e => setAddForm({ ...addForm, end_date: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="flex justify-between gap-3 pt-4 border-t border-border">
                                <button type="button" onClick={() => setAddWizardStep(1)} className="btn-ghost">{locale === 'ar' ? 'السابق' : 'Back'}</button>
                                <div className="flex gap-3">
                                    <button type="button" onClick={closeAddWizard} className="btn-ghost">{txt.cancel}</button>
                                    <button type="submit" className="btn-primary" disabled={!addForm.home_branch_id}><Save size={16} /> {txt.saveStaff}</button>
                                </div>
                            </div>
                        </div>
                    )}
                </form>
            </Modal>

            {/* EDIT MODAL */}
            <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title={`${txt.editContract}${editTarget?.full_name || ''}`}>
                <form onSubmit={handleEdit} className="space-y-4">
                    <div className="rounded-sm border border-primary/30 bg-primary/10 p-3">
                        <p className="text-xs font-semibold text-primary uppercase tracking-wide">{txt.fullTimeInfo}</p>
                        <p className="text-sm text-foreground mt-1">{txt.fullTimeInfoDesc}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.startDate}</label>
                            <input
                                type="date"
                                className="input-dark"
                                value={editForm.start_date}
                                onChange={e => setEditForm({ ...editForm, start_date: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.endDateOptional}</label>
                            <input
                                type="date"
                                className="input-dark"
                                value={editForm.end_date}
                                min={editForm.start_date || undefined}
                                onChange={e => setEditForm({ ...editForm, end_date: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.moneyPerHour}</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="input-dark"
                                value={editForm.money_per_hour}
                                onChange={e => setEditForm({ ...editForm, money_per_hour: Number(e.target.value) })}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.standardHours}</label>
                            <input
                                type="number"
                                min="1"
                                className="input-dark"
                                value={editForm.standard_hours}
                                onChange={e => setEditForm({ ...editForm, standard_hours: Number(e.target.value) })}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <button type="button" onClick={() => setIsEditOpen(false)} className="btn-ghost">{txt.cancel}</button>
                        <button type="submit" className="btn-primary"><Save size={16} /> {txt.updateContract}</button>
                    </div>
                </form>
            </Modal>
            {/* PAYROLL MODAL */}
            <Modal
                isOpen={isPayrollOpen}
                onClose={() => { setIsPayrollOpen(false); setPayrollResult(null); }}
                title={txt.generatePayroll}
            >
                {!payrollResult ? (
                    <form onSubmit={handlePayroll} className="space-y-5">
                        <div className="rounded-2xl border border-border bg-card/60 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{txt.payrollFor}</p>
                                    <p className="mt-1 text-lg font-semibold text-foreground">{payrollTarget?.full_name || '--'}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <span className="rounded-full border border-border bg-background px-3 py-1">{txt.payrollBranch}: {selectedPayrollBranch?.display_name || selectedPayrollBranch?.name || '--'}</span>
                                    <span className="rounded-full border border-border bg-background px-3 py-1">{txt.fullTimeContract}</span>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">{txt.catchUpSummary}</p>
                            <p className="mt-2 text-sm text-muted-foreground">{txt.catchUpNote}</p>
                        </div>

                        <div className="rounded-2xl border border-border bg-card/50 p-4 space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-2">{txt.manualDeductions}</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="input-dark"
                                    value={payrollForm.manual_deductions}
                                    onChange={e => setPayrollForm({ ...payrollForm, manual_deductions: Number(e.target.value) })}
                                />
                            </div>
                            <p className="text-xs leading-5 text-muted-foreground">
                                {txt.optionalDeductionsNote}
                            </p>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-xs text-muted-foreground">
                            <span>{txt.fullTimeOnlyPayroll}</span>
                            <span className="font-medium text-foreground">{txt.fullTimeContract}</span>
                        </div>

                        <div className="flex justify-end gap-3 pt-1">
                            <button type="button" onClick={() => setIsPayrollOpen(false)} className="btn-ghost">{txt.cancel}</button>
                            <button type="submit" className="btn-primary"><Calculator size={16} /> {txt.generate}</button>
                        </div>
                    </form>
                ) : (
                    <div className="space-y-5">
                        <div className="rounded-2xl p-5 text-center bg-emerald-500/10 border border-emerald-500/20 shadow-sm">
                            <p className="text-sm text-emerald-500 font-medium mb-1">{txt.payrollGenerated}</p>
                            <p className="text-3xl font-bold text-emerald-500">{payrollResult.total_pay?.toFixed(2)} {txt.currency}</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div className="rounded-xl p-4 bg-card border border-border">
                                <p className="text-xs text-muted-foreground">{txt.periodRange}</p>
                                <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                                    {payrollResult.period_start && payrollResult.period_end
                                        ? `${String(payrollResult.period_start).slice(0, 10)} → ${String(payrollResult.period_end).slice(0, 10)}`
                                        : `${new Date().toISOString().slice(0, 10)}`
                                    }
                                </p>
                            </div>
                            <div className="rounded-xl p-4 bg-card border border-border">
                                <p className="text-xs text-muted-foreground">{txt.workedDays}</p>
                                <p className="mt-1 font-mono text-sm font-semibold text-foreground">{Number(payrollResult.worked_days || 0).toFixed(0)}</p>
                            </div>
                            <div className="rounded-xl p-4 bg-card border border-border">
                                <p className="text-xs text-muted-foreground">{txt.payrollSummary}</p>
                                <p className="mt-1 font-mono text-sm font-semibold text-foreground">{payrollResult.status || txt.fullTimeContract}</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-foreground">{txt.payrollBreakdown}</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                <div className="rounded-xl p-4 bg-card border border-border">
                                    <p className="text-xs text-muted-foreground">{txt.basePay}</p>
                                    <p className="mt-1 font-mono text-lg font-semibold text-foreground">{payrollResult.base_pay?.toFixed(2)} {txt.currency}</p>
                                </div>
                                <div className="rounded-xl p-4 bg-card border border-border">
                                    <p className="text-xs text-muted-foreground">{txt.overtimePay}</p>
                                    <p className="mt-1 font-mono text-lg font-semibold text-foreground">{payrollResult.overtime_pay?.toFixed(2)} {txt.currency}</p>
                                </div>
                                <div className="rounded-xl p-4 bg-card border border-border">
                                    <p className="text-xs text-muted-foreground">{txt.automaticDeductions}</p>
                                    <p className="mt-1 font-mono text-lg font-semibold text-red-400">-{Number(payrollResult.leave_deductions || 0).toFixed(2)} {txt.currency}</p>
                                </div>
                                <div className="rounded-xl p-4 bg-card border border-border">
                                    <p className="text-xs text-muted-foreground">{txt.manualDeductions}</p>
                                    <p className="mt-1 font-mono text-lg font-semibold text-red-400">-{Number(payrollResult.manual_deductions || 0).toFixed(2)} {txt.currency}</p>
                                </div>
                            </div>
                            <div className="rounded-xl border border-border bg-background p-4">
                                <div className="flex items-center justify-between gap-4">
                                    <p className="text-xs text-muted-foreground">{txt.netPay}</p>
                                    <p className="font-mono text-2xl font-semibold text-foreground">{Number(payrollResult.total_pay || 0).toFixed(2)} {txt.currency}</p>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            <button onClick={() => { setIsPayrollOpen(false); setPayrollResult(null); }} className="btn-ghost w-full">{txt.close}</button>
                            <button onClick={() => handlePrintPayslip(payrollResult.id)} className="btn-primary w-full flex items-center justify-center gap-2">
                                <Download size={16} /> {txt.downloadSlip}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
