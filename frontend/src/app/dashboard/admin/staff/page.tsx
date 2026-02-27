'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Pencil, Calculator, Save, Plus, Download, Eye } from 'lucide-react';
import Modal from '@/components/Modal';
import { useFeedback } from '@/components/FeedbackProvider';
import { resolveProfileImageUrl } from '@/lib/profileImage';
import { downloadBlob } from '@/lib/download';
import { useLocale } from '@/context/LocaleContext';

interface StaffMember {
    id: string;
    full_name: string;
    email: string;
    role: string;
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

type StaffRole = 'COACH' | 'EMPLOYEE' | 'CASHIER' | 'RECEPTION' | 'FRONT_DESK';
type StaffRoleFilter = 'ALL' | StaffRole;

const STAFF_ROLES: StaffRole[] = ['COACH', 'EMPLOYEE', 'CASHIER', 'RECEPTION', 'FRONT_DESK'];

const todayDateInput = () => new Date().toISOString().split('T')[0];

const defaultAddForm = {
    full_name: '',
    email: '',
    password: 'password123',
    role: 'COACH',
    contract_type: 'FULL_TIME',
    base_salary: 0,
    commission_rate: 0
};

const defaultEditForm = {
    start_date: todayDateInput(),
    end_date: '',
    money_per_hour: 0,
    standard_hours: 160,
};

export default function StaffPage() {
    const { locale, formatDate, formatNumber } = useLocale();
    const { showToast } = useFeedback();
    const router = useRouter();
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [addForm, setAddForm] = useState(defaultAddForm);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<StaffMember | null>(null);
    const [editForm, setEditForm] = useState(defaultEditForm);
    const [roleFilter, setRoleFilter] = useState<StaffRoleFilter>('ALL');
    const [isPayrollOpen, setIsPayrollOpen] = useState(false);
    const [payrollTarget, setPayrollTarget] = useState<StaffMember | null>(null);
    const [payrollForm, setPayrollForm] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), sales_volume: 0 });
    const [payrollResult, setPayrollResult] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

    const [failedImageUrls, setFailedImageUrls] = useState<Record<string, true>>({});
    const txt = locale === 'ar'
        ? {
            coach: 'مدرب',
            employee: 'موظف',
            cashier: 'كاشير',
            reception: 'استقبال',
            frontDesk: 'مكتب أمامي',
            failedCreate: 'فشل في إنشاء موظف.',
            failedUpdate: 'فشل في تحديث العقد.',
            failedGeneratePayroll: 'فشل في إنشاء مسير الرواتب.',
            failedPayslip: 'فشل في تنزيل قسيمة الراتب',
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
            addModal: 'إضافة موظف جديد',
            fullName: 'الاسم الكامل',
            email: 'البريد الإلكتروني',
            contractType: 'نوع العقد',
            fullTime: 'دوام كامل',
            partTime: 'دوام جزئي',
            hybrid: 'هجين',
            contractor: 'متعاقد',
            baseSalary: 'الراتب الأساسي (JOD)',
            commission: 'العمولة (0-1)',
            cancel: 'إلغاء',
            saveStaff: 'حفظ الموظف',
            editContract: 'تعديل العقد - ',
            fullTimeInfo: 'دوام كامل',
            fullTimeInfoDesc: 'قم بضبط تفاصيل عقد الدوام الكامل باستخدام التاريخ والأجر بالساعة.',
            startDate: 'تاريخ البدء',
            endDateOptional: 'تاريخ الانتهاء (اختياري)',
            moneyPerHour: 'الأجر لكل ساعة (JOD)',
            standardHours: 'الساعات القياسية / شهر',
            updateContract: 'تحديث العقد',
            generatePayroll: 'إنشاء مسير الرواتب - ',
            month: 'الشهر',
            year: 'السنة',
            salesVolume: 'حجم المبيعات (JOD)',
            salesPlaceholder: 'أدخل المبيعات لحساب العمولة...',
            generate: 'إنشاء',
            payrollGenerated: 'تم إنشاء مسير الرواتب بنجاح',
            basePay: 'الأجر الأساسي',
            overtimePay: 'أجر العمل الإضافي',
            close: 'إغلاق',
            downloadSlip: 'تنزيل القسيمة',
            currency: 'دينار',
            commissionShort: 'عمولة',
            fullTimeContract: 'دوام كامل',
            partTimeContract: 'دوام جزئي',
            hybridContract: 'هجين',
            contractorContract: 'متعاقد',
        }
        : {
            coach: 'Coach',
            employee: 'Employee',
            cashier: 'Cashier',
            reception: 'Reception',
            frontDesk: 'Front Desk',
            failedCreate: 'Failed to create staff member.',
            failedUpdate: 'Failed to update contract.',
            failedGeneratePayroll: 'Failed to generate payroll.',
            failedPayslip: 'Failed to download payslip',
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
            addModal: 'Add New Staff Member',
            fullName: 'Full Name',
            email: 'Email',
            contractType: 'Contract',
            fullTime: 'Full Time',
            partTime: 'Part Time',
            hybrid: 'Hybrid',
            contractor: 'Contractor',
            baseSalary: 'Base Salary (JOD)',
            commission: 'Commission (0-1)',
            cancel: 'Cancel',
            saveStaff: 'Save Staff',
            editContract: 'Edit Contract - ',
            fullTimeInfo: 'Full Time',
            fullTimeInfoDesc: 'Configure full-time contract details using date and hourly pay.',
            startDate: 'Start Date',
            endDateOptional: 'End Date (Optional)',
            moneyPerHour: 'Money Per Hour (JOD)',
            standardHours: 'Standard Hours / Month',
            updateContract: 'Update Contract',
            generatePayroll: 'Generate Payroll — ',
            month: 'Month',
            year: 'Year',
            salesVolume: 'Sales Volume (JOD)',
            salesPlaceholder: 'Enter sales for commission...',
            generate: 'Generate',
            payrollGenerated: 'Payroll Generated Successfully',
            basePay: 'Base Pay',
            overtimePay: 'Overtime Pay',
            close: 'Close',
            downloadSlip: 'Download Slip',
            currency: 'JOD',
            commissionShort: 'Comm.',
            fullTimeContract: 'FULL_TIME',
            partTimeContract: 'PART_TIME',
            hybridContract: 'HYBRID',
            contractorContract: 'CONTRACTOR',
        };

    const roleLabelsLocalized: Record<StaffRole, string> = {
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

    const getRoleBadgeClass = (role: string) => {
        switch (role) {
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
            case 'PART_TIME':
                return 'badge-blue';
            case 'HYBRID':
                return 'badge-purple';
            case 'CONTRACTOR':
                return 'badge-gray';
            default:
                return 'badge-amber';
        }
    };
    const contractTypeLabel = (contractType?: string | null) => {
        switch (contractType) {
            case 'FULL_TIME':
                return txt.fullTimeContract;
            case 'PART_TIME':
                return txt.partTimeContract;
            case 'HYBRID':
                return txt.hybridContract;
            case 'CONTRACTOR':
                return txt.contractorContract;
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

    const fetchStaff = async () => {
        try {
            const res = await api.get('/hr/staff');
            setStaff(res.data.data);
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    useEffect(() => { setTimeout(() => fetchStaff(), 0); }, []);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const userRes = await api.post('/auth/register', {
                email: addForm.email, password: addForm.password,
                full_name: addForm.full_name, role: addForm.role
            });
            const userId = userRes.data.data.id;
            await api.post('/hr/contracts', {
                user_id: userId, contract_type: addForm.contract_type,
                base_salary: Number(addForm.base_salary), commission_rate: Number(addForm.commission_rate),
                start_date: new Date().toISOString().split('T')[0], standard_hours: 160
            });
            setIsAddOpen(false);
            setAddForm(defaultAddForm);
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
        setPayrollTarget(member);
        setPayrollResult(null);
        setPayrollForm({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), sales_volume: 0 });
        setIsPayrollOpen(true);
    };

    const handlePayroll = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!payrollTarget) return;
        try {
            const res = await api.post('/hr/payroll/generate', {
                user_id: payrollTarget.id, month: payrollForm.month,
                year: payrollForm.year, sales_volume: Number(payrollForm.sales_volume)
            });
            setPayrollResult(res.data.data);
        } catch (err) {
            console.error(err);
            showToast(txt.failedGeneratePayroll, 'error');
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

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
        </div>
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{txt.title}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{filteredStaff.length} {txt.of} {staff.length} {txt.subtitle}</p>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <select className="input-dark min-w-[180px]" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as StaffRoleFilter)}>
                        <option value="ALL">{txt.allRoles}</option>
                        {STAFF_ROLES.map((role) => (
                            <option key={role} value={role}>{roleLabelsLocalized[role]}</option>
                        ))}
                    </select>
                    <button onClick={() => setIsAddOpen(true)} className="btn-primary whitespace-nowrap">
                        <Plus size={18} /> {txt.addNew}
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="chart-card overflow-hidden !p-0 border border-border">
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left table-dark min-w-[600px]">
                        <thead>
                            <tr>
                                <th>{txt.name}</th>
                                <th>{txt.role}</th>
                                <th>{txt.contract}</th>
                                <th>{txt.salary}</th>
                                <th className="text-center">{txt.actions}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStaff.length === 0 && (
                                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">{txt.noStaff}</td></tr>
                            )}
                            {filteredStaff.map((member) => (
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
                                            <div>
                                                <div>{formatNumber(member.contract.base_salary)} {txt.currency}</div>
                                                {member.contract.commission_rate > 0 && (
                                                    <div className="text-emerald-500 text-xs">+{(member.contract.commission_rate * 100).toFixed(0)}% {txt.commissionShort}</div>
                                                )}
                                            </div>
                                        ) : '-'}
                                    </td>
                                    <td>
                                        <div className="flex items-center justify-center gap-2">
                                            <button onClick={() => openView(member)} className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-xs font-medium px-2 py-1 rounded-lg hover:bg-emerald-400/10 transition-colors" title={txt.viewProfile}>
                                                <Eye size={13} /> {txt.view}
                                            </button>
                                            <button onClick={() => openEdit(member)} className="flex items-center gap-1 text-primary hover:text-primary/80 text-xs font-medium px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors">
                                                <Pencil size={13} /> {txt.edit}
                                            </button>
                                            <button onClick={() => openPayroll(member)} className="flex items-center gap-1 text-emerald-500 hover:text-emerald-400 text-xs font-medium px-2 py-1 rounded-lg hover:bg-emerald-500/10 transition-colors">
                                                <Calculator size={13} /> {txt.payroll}
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
                    {filteredStaff.map((member) => (
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
                            </div>

                            <div className="mt-3 grid grid-cols-3 gap-2">
                                <button onClick={() => openView(member)} className="btn-ghost !px-2 !py-2 h-auto text-xs text-emerald-400 hover:text-emerald-300 justify-center" title={txt.viewProfile}>
                                    <Eye size={13} /> {txt.view}
                                </button>
                                <button onClick={() => openEdit(member)} className="btn-ghost !px-2 !py-2 h-auto text-xs text-primary hover:text-primary/80 justify-center">
                                    <Pencil size={13} /> {txt.edit}
                                </button>
                                <button onClick={() => openPayroll(member)} className="btn-ghost !px-2 !py-2 h-auto text-xs text-emerald-500 hover:text-emerald-400 justify-center">
                                    <Calculator size={13} /> {txt.payroll}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ADD MODAL */}
            <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title={txt.addModal}>
                <form onSubmit={handleAdd} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.fullName}</label>
                        <input type="text" required className="input-dark" value={addForm.full_name} onChange={e => setAddForm({ ...addForm, full_name: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.email}</label>
                        <input type="email" required className="input-dark" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.role}</label>
                            <select className="input-dark" value={addForm.role} onChange={e => setAddForm({ ...addForm, role: e.target.value })}>
                                {STAFF_ROLES.map((role) => (
                                    <option key={role} value={role}>{roleLabelsLocalized[role]}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.contractType}</label>
                            <select className="input-dark" value={addForm.contract_type} onChange={e => setAddForm({ ...addForm, contract_type: e.target.value })}>
                                <option value="FULL_TIME">{txt.fullTime}</option>
                                <option value="PART_TIME">{txt.partTime}</option>
                                <option value="HYBRID">{txt.hybrid}</option>
                                <option value="CONTRACTOR">{txt.contractor}</option>
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.baseSalary}</label>
                            <input type="number" className="input-dark" value={addForm.base_salary} onChange={e => setAddForm({ ...addForm, base_salary: Number(e.target.value) })} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.commission}</label>
                            <input type="number" step="0.01" max="1" className="input-dark" value={addForm.commission_rate} onChange={e => setAddForm({ ...addForm, commission_rate: Number(e.target.value) })} />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <button type="button" onClick={() => setIsAddOpen(false)} className="btn-ghost">{txt.cancel}</button>
                        <button type="submit" className="btn-primary"><Save size={16} /> {txt.saveStaff}</button>
                    </div>
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
            <Modal isOpen={isPayrollOpen} onClose={() => { setIsPayrollOpen(false); setPayrollResult(null); }} title={`${txt.generatePayroll}${payrollTarget?.full_name || ''}`}>
                {!payrollResult ? (
                    <form onSubmit={handlePayroll} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.month}</label>
                                <select className="input-dark" value={payrollForm.month} onChange={e => setPayrollForm({ ...payrollForm, month: Number(e.target.value) })}>
                                    {[...Array(12)].map((_, i) => (
                                        <option key={i + 1} value={i + 1}>{formatDate(new Date(2024, i, 1), { month: 'long' })}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.year}</label>
                                <input type="number" className="input-dark" value={payrollForm.year} onChange={e => setPayrollForm({ ...payrollForm, year: Number(e.target.value) })} />
                            </div>
                        </div>
                        {payrollTarget?.contract?.type === 'HYBRID' && (
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.salesVolume}</label>
                                <input type="number" step="0.01" className="input-dark" value={payrollForm.sales_volume} onChange={e => setPayrollForm({ ...payrollForm, sales_volume: Number(e.target.value) })} placeholder={txt.salesPlaceholder} />
                            </div>
                        )}
                        <div className="flex justify-end gap-3 pt-4 border-t border-border">
                            <button type="button" onClick={() => setIsPayrollOpen(false)} className="btn-ghost">{txt.cancel}</button>
                            <button type="submit" className="btn-primary"><Calculator size={16} /> {txt.generate}</button>
                        </div>
                    </form>
                ) : (
                    <div className="space-y-4">
                        <div className="rounded-xl p-4 text-center bg-emerald-500/10 border border-emerald-500/20">
                            <p className="text-sm text-emerald-500 font-medium mb-1">{txt.payrollGenerated}</p>
                            <p className="text-3xl font-bold text-emerald-500">{payrollResult.total_pay?.toFixed(2)} {txt.currency}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="rounded-lg p-3 bg-card border border-border">
                                <p className="text-xs text-muted-foreground">{txt.basePay}</p>
                                <p className="font-mono font-semibold text-foreground">{payrollResult.base_pay?.toFixed(2)} {txt.currency}</p>
                            </div>
                            <div className="rounded-lg p-3 bg-card border border-border">
                                <p className="text-xs text-muted-foreground">{txt.overtimePay}</p>
                                <p className="font-mono font-semibold text-foreground">{payrollResult.overtime_pay?.toFixed(2)} {txt.currency}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-4">
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

