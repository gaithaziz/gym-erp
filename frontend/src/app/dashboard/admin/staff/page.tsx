'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { FileText, Pencil, Calculator, Save, Plus, Download, Eye } from 'lucide-react';
import Modal from '@/components/Modal';
import { useFeedback } from '@/components/FeedbackProvider';
import { resolveProfileImageUrl } from '@/lib/profileImage';

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
    } | null;
}

type ContractType = 'FULL_TIME' | 'PART_TIME' | 'HYBRID' | 'CONTRACTOR';

const CONTRACT_RULES: Record<ContractType, {
    label: string;
    summary: string;
    salaryLabel: string;
    salaryHint: string;
    commissionAllowed: boolean;
}> = {
    FULL_TIME: {
        label: 'Full Time',
        summary: 'Fixed monthly salary with overtime based on standard monthly hours.',
        salaryLabel: 'Monthly Salary (JOD)',
        salaryHint: 'Used as fixed monthly base pay.',
        commissionAllowed: false,
    },
    PART_TIME: {
        label: 'Part Time',
        summary: 'Paid by logged hours only.',
        salaryLabel: 'Hourly Rate (JOD)',
        salaryHint: 'Used as per-hour payroll rate.',
        commissionAllowed: false,
    },
    HYBRID: {
        label: 'Hybrid',
        summary: 'Monthly base salary plus commission from sales.',
        salaryLabel: 'Base Salary (JOD)',
        salaryHint: 'Used as fixed monthly pay before commission.',
        commissionAllowed: true,
    },
    CONTRACTOR: {
        label: 'Contractor',
        summary: 'External/hour-based contract paid from logged hours.',
        salaryLabel: 'Hourly Rate (JOD)',
        salaryHint: 'Used as per-hour contractor payout.',
        commissionAllowed: false,
    },
};

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
    contract_type: 'FULL_TIME',
    base_salary: 0,
    commission_rate: 0
};

export default function StaffPage() {
    const { showToast } = useFeedback();
    const router = useRouter();
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [addForm, setAddForm] = useState(defaultAddForm);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<StaffMember | null>(null);
    const [editForm, setEditForm] = useState(defaultEditForm);
    const [isPayrollOpen, setIsPayrollOpen] = useState(false);
    const [payrollTarget, setPayrollTarget] = useState<StaffMember | null>(null);
    const [payrollForm, setPayrollForm] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), sales_volume: 0 });
    const [payrollResult, setPayrollResult] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

    const [failedImageUrls, setFailedImageUrls] = useState<Record<string, true>>({});
    const activeEditRule = CONTRACT_RULES[(editForm.contract_type as ContractType) || 'FULL_TIME'];

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
            showToast('Failed to create staff member.', 'error');
        }
    };

    const openEdit = (member: StaffMember) => {
        setEditTarget(member);
        setEditForm({
            contract_type: member.contract?.type || 'FULL_TIME',
            base_salary: member.contract?.base_salary || 0,
            commission_rate: member.contract?.commission_rate || 0
        });
        setIsEditOpen(true);
    };

    const handleEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editTarget) return;
        try {
            const contractType = editForm.contract_type as ContractType;
            await api.post('/hr/contracts', {
                user_id: editTarget.id,
                contract_type: contractType,
                base_salary: Number(editForm.base_salary),
                commission_rate: contractType === 'HYBRID' ? Number(editForm.commission_rate) : 0,
                start_date: new Date().toISOString().split('T')[0], standard_hours: 160
            });
            setIsEditOpen(false);
            setEditTarget(null);
            fetchStaff();
        } catch (err) {
            console.error(err);
            showToast('Failed to update contract.', 'error');
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
            showToast('Failed to generate payroll.', 'error');
        }
    };

    const handlePrintPayslip = async (payrollId: string) => {
        try {
            const res = await api.get(`/hr/payroll/${payrollId}/payslip`);
            const data = res.data.data;

            const printWindow = window.open('', '_blank');
            if (!printWindow) return;

            const html = `
                <html>
                    <head>
                        <title>Payslip - ${data.payslip_id}</title>
                        <style>
                            body { font-family: sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; color: #000; }
                            h2 { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 30px; }
                            .header-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 0.9rem; }
                            table { width: 100%; border-collapse: collapse; margin-top: 30px; }
                            th, td { border: 1px solid #ccc; padding: 10px; text-align: left; }
                            th { background-color: #f5f5f5; }
                            .total-row { font-weight: bold; font-size: 1.1rem; }
                            .footer { text-align: center; margin-top: 50px; font-size: 0.8rem; color: #666; }
                        </style>
                    </head>
                    <body>
                        <h2>SALARY PAYSLIP</h2>
                        <div class="header-row">
                            <div><strong>Employee:</strong> ${data.employee_name}</div>
                            <div><strong>Period:</strong> ${data.period}</div>
                        </div>
                        <div class="header-row">
                            <div><strong>Role/Contract:</strong> ${data.contract_type}</div>
                            <div><strong>Payslip ID:</strong> ${data.payslip_id}</div>
                        </div>
                        
                        <table>
                            <tr><th>Description</th><th style="text-align: right;">Amount (JOD)</th></tr>
                            <tr><td>Base Pay</td><td style="text-align: right;">${data.base_pay.toFixed(2)}</td></tr>
                            <tr><td>Overtime Pay</td><td style="text-align: right;">${data.overtime_pay.toFixed(2)}</td></tr>
                            <tr><td>Bonus / Commission</td><td style="text-align: right;">${data.bonus_pay.toFixed(2)}</td></tr>
                            <tr><td>Deductions</td><td style="text-align: right; color: red;">-${data.deductions.toFixed(2)}</td></tr>
                            <tr class="total-row"><td>NET PAY</td><td style="text-align: right;">${data.total_pay.toFixed(2)}</td></tr>
                        </table>
                        
                        <div class="footer">
                            <p>Generated on ${new Date(data.generated_on).toLocaleString()}</p>
                            <p>Gym ERP Management System</p>
                        </div>
                        <script>window.onload = function() { window.print(); window.close(); }</script>
                    </body>
                </html>
            `;
            printWindow.document.write(html);
            printWindow.document.close();
        } catch {
            showToast('Failed to generate payslip', 'error');
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
                    <h1 className="text-2xl font-bold text-foreground">Staff Management</h1>
                    <p className="text-sm text-muted-foreground mt-1">{staff.length} staff members</p>
                </div>
                <button onClick={() => setIsAddOpen(true)} className="btn-primary">
                    <Plus size={18} /> Add New Staff
                </button>
            </div>

            {/* Table */}
            <div className="chart-card overflow-hidden !p-0 border border-border">
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left table-dark min-w-[600px]">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Role</th>
                                <th>Contract</th>
                                <th>Salary</th>
                                <th className="text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {staff.length === 0 && (
                                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">No staff members yet</td></tr>
                            )}
                            {staff.map((member) => (
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
                                        <span className={`badge ${member.role === 'COACH' ? 'badge-orange' : member.role === 'ADMIN' ? 'badge-blue' : 'badge-gray'}`}>
                                            {member.role}
                                        </span>
                                    </td>
                                    <td>
                                        {member.contract ? (
                                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                                <FileText size={14} className="text-muted-foreground" />
                                                {member.contract.type}
                                            </div>
                                        ) : (
                                            <span className="badge badge-amber">No Contract</span>
                                        )}
                                    </td>
                                    <td className="font-mono text-sm text-foreground">
                                        {member.contract ? (
                                            <div>
                                                <div>{member.contract.base_salary.toLocaleString()} JOD</div>
                                                {member.contract.commission_rate > 0 && (
                                                    <div className="text-emerald-500 text-xs">+{(member.contract.commission_rate * 100).toFixed(0)}% Comm.</div>
                                                )}
                                            </div>
                                        ) : '-'}
                                    </td>
                                    <td>
                                        <div className="flex items-center justify-center gap-2">
                                            <button onClick={() => openView(member)} className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-xs font-medium px-2 py-1 rounded-lg hover:bg-emerald-400/10 transition-colors" title="View Profile">
                                                <Eye size={13} /> View
                                            </button>
                                            <button onClick={() => openEdit(member)} className="flex items-center gap-1 text-primary hover:text-primary/80 text-xs font-medium px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors">
                                                <Pencil size={13} /> Edit
                                            </button>
                                            <button onClick={() => openPayroll(member)} className="flex items-center gap-1 text-emerald-500 hover:text-emerald-400 text-xs font-medium px-2 py-1 rounded-lg hover:bg-emerald-500/10 transition-colors">
                                                <Calculator size={13} /> Payroll
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="md:hidden divide-y divide-border">
                    {staff.length === 0 && (
                        <div className="px-4 py-8 text-center text-sm text-muted-foreground">No staff members yet</div>
                    )}
                    {staff.map((member) => (
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
                                <span className={`badge ${member.role === 'COACH' ? 'badge-orange' : member.role === 'ADMIN' ? 'badge-blue' : 'badge-gray'}`}>
                                    {member.role}
                                </span>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-sm border border-border bg-muted/20 p-2">
                                    <p className="text-muted-foreground">Contract</p>
                                    <p className="mt-0.5 font-medium text-foreground">
                                        {member.contract ? member.contract.type : 'No Contract'}
                                    </p>
                                </div>
                                <div className="rounded-sm border border-border bg-muted/20 p-2">
                                    <p className="text-muted-foreground">Salary</p>
                                    <p className="mt-0.5 font-medium text-foreground">
                                        {member.contract ? `${member.contract.base_salary.toLocaleString()} JOD` : '--'}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-3 grid grid-cols-3 gap-2">
                                <button onClick={() => openView(member)} className="btn-ghost !px-2 !py-2 h-auto text-xs text-emerald-400 hover:text-emerald-300 justify-center" title="View Profile">
                                    <Eye size={13} /> View
                                </button>
                                <button onClick={() => openEdit(member)} className="btn-ghost !px-2 !py-2 h-auto text-xs text-primary hover:text-primary/80 justify-center">
                                    <Pencil size={13} /> Edit
                                </button>
                                <button onClick={() => openPayroll(member)} className="btn-ghost !px-2 !py-2 h-auto text-xs text-emerald-500 hover:text-emerald-400 justify-center">
                                    <Calculator size={13} /> Payroll
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ADD MODAL */}
            <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add New Staff Member">
                <form onSubmit={handleAdd} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Full Name</label>
                        <input type="text" required className="input-dark" value={addForm.full_name} onChange={e => setAddForm({ ...addForm, full_name: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
                        <input type="email" required className="input-dark" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Role</label>
                            <select className="input-dark" value={addForm.role} onChange={e => setAddForm({ ...addForm, role: e.target.value })}>
                                <option value="COACH">Coach</option>
                                <option value="ADMIN">Admin</option>
                                <option value="EMPLOYEE">Employee</option>
                                <option value="CASHIER">Cashier</option>
                                <option value="RECEPTION">Reception</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Contract</label>
                            <select className="input-dark" value={addForm.contract_type} onChange={e => setAddForm({ ...addForm, contract_type: e.target.value })}>
                                <option value="FULL_TIME">Full Time</option>
                                <option value="PART_TIME">Part Time</option>
                                <option value="HYBRID">Hybrid</option>
                                <option value="CONTRACTOR">Contractor</option>
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Base Salary (JOD)</label>
                            <input type="number" className="input-dark" value={addForm.base_salary} onChange={e => setAddForm({ ...addForm, base_salary: Number(e.target.value) })} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Commission (0-1)</label>
                            <input type="number" step="0.01" max="1" className="input-dark" value={addForm.commission_rate} onChange={e => setAddForm({ ...addForm, commission_rate: Number(e.target.value) })} />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <button type="button" onClick={() => setIsAddOpen(false)} className="btn-ghost">Cancel</button>
                        <button type="submit" className="btn-primary"><Save size={16} /> Save Staff</button>
                    </div>
                </form>
            </Modal>

            {/* EDIT MODAL */}
            <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title={`Edit Contract - ${editTarget?.full_name}`}>
                <form onSubmit={handleEdit} className="space-y-4">
                    <div className="rounded-sm border border-primary/30 bg-primary/10 p-3">
                        <p className="text-xs font-semibold text-primary uppercase tracking-wide">{activeEditRule.label}</p>
                        <p className="text-sm text-foreground mt-1">{activeEditRule.summary}</p>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Contract Type</label>
                        <select
                            className="input-dark"
                            value={editForm.contract_type}
                            onChange={e => {
                                const nextType = e.target.value as ContractType;
                                setEditForm({
                                    ...editForm,
                                    contract_type: nextType,
                                    commission_rate: CONTRACT_RULES[nextType].commissionAllowed ? editForm.commission_rate : 0,
                                });
                            }}
                        >
                            <option value="FULL_TIME">Full Time</option>
                            <option value="PART_TIME">Part Time</option>
                            <option value="HYBRID">Hybrid</option>
                            <option value="CONTRACTOR">Contractor</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{activeEditRule.salaryLabel}</label>
                            <input type="number" className="input-dark" value={editForm.base_salary} onChange={e => setEditForm({ ...editForm, base_salary: Number(e.target.value) })} />
                            <p className="mt-1 text-[11px] text-muted-foreground">{activeEditRule.salaryHint}</p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Commission Rate (0-1)</label>
                            <input
                                type="number"
                                step="0.01"
                                max="1"
                                min="0"
                                disabled={!activeEditRule.commissionAllowed}
                                className="input-dark disabled:opacity-50 disabled:cursor-not-allowed"
                                value={activeEditRule.commissionAllowed ? editForm.commission_rate : 0}
                                onChange={e => setEditForm({ ...editForm, commission_rate: Number(e.target.value) })}
                            />
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                {activeEditRule.commissionAllowed ? 'Used in payroll with provided sales volume.' : 'Only Hybrid contracts support commission.'}
                            </p>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <button type="button" onClick={() => setIsEditOpen(false)} className="btn-ghost">Cancel</button>
                        <button type="submit" className="btn-primary"><Save size={16} /> Update Contract</button>
                    </div>
                </form>
            </Modal>
            {/* PAYROLL MODAL */}
            <Modal isOpen={isPayrollOpen} onClose={() => { setIsPayrollOpen(false); setPayrollResult(null); }} title={`Generate Payroll — ${payrollTarget?.full_name}`}>
                {!payrollResult ? (
                    <form onSubmit={handlePayroll} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Month</label>
                                <select className="input-dark" value={payrollForm.month} onChange={e => setPayrollForm({ ...payrollForm, month: Number(e.target.value) })}>
                                    {[...Array(12)].map((_, i) => (
                                        <option key={i + 1} value={i + 1}>{new Date(2024, i).toLocaleString('default', { month: 'long' })}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Year</label>
                                <input type="number" className="input-dark" value={payrollForm.year} onChange={e => setPayrollForm({ ...payrollForm, year: Number(e.target.value) })} />
                            </div>
                        </div>
                        {payrollTarget?.contract?.type === 'HYBRID' && (
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Sales Volume (JOD)</label>
                                <input type="number" step="0.01" className="input-dark" value={payrollForm.sales_volume} onChange={e => setPayrollForm({ ...payrollForm, sales_volume: Number(e.target.value) })} placeholder="Enter sales for commission..." />
                            </div>
                        )}
                        <div className="flex justify-end gap-3 pt-4 border-t border-border">
                            <button type="button" onClick={() => setIsPayrollOpen(false)} className="btn-ghost">Cancel</button>
                            <button type="submit" className="btn-primary"><Calculator size={16} /> Generate</button>
                        </div>
                    </form>
                ) : (
                    <div className="space-y-4">
                        <div className="rounded-xl p-4 text-center bg-emerald-500/10 border border-emerald-500/20">
                            <p className="text-sm text-emerald-500 font-medium mb-1">Payroll Generated Successfully</p>
                            <p className="text-3xl font-bold text-emerald-500">{payrollResult.total_pay?.toFixed(2)} JOD</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="rounded-lg p-3 bg-card border border-border">
                                <p className="text-xs text-muted-foreground">Base Pay</p>
                                <p className="font-mono font-semibold text-foreground">{payrollResult.base_pay?.toFixed(2)} JOD</p>
                            </div>
                            <div className="rounded-lg p-3 bg-card border border-border">
                                <p className="text-xs text-muted-foreground">Overtime Pay</p>
                                <p className="font-mono font-semibold text-foreground">{payrollResult.overtime_pay?.toFixed(2)} JOD</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-4">
                            <button onClick={() => { setIsPayrollOpen(false); setPayrollResult(null); }} className="btn-ghost w-full">Close</button>
                            <button onClick={() => handlePrintPayslip(payrollResult.id)} className="btn-primary w-full flex items-center justify-center gap-2">
                                <Download size={16} /> Download Slip
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

