'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Users, FileText, Plus, Save, Pencil, Calculator } from 'lucide-react';
import Modal from '@/components/Modal';

interface StaffMember {
    id: string;
    full_name: string;
    email: string;
    role: string;
    contract: {
        type: string;
        base_salary: number;
        commission_rate: number;
    } | null;
}

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
    const [payrollResult, setPayrollResult] = useState<any>(null);

    useEffect(() => { fetchStaff(); }, []);

    const fetchStaff = async () => {
        try {
            const res = await api.get('/hr/staff');
            setStaff(res.data.data);
        } catch (err) { console.error(err); }
        setLoading(false);
    };

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
        } catch (err) { console.error(err); alert('Failed to create staff member.'); }
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
            await api.post('/hr/contracts', {
                user_id: editTarget.id, contract_type: editForm.contract_type,
                base_salary: Number(editForm.base_salary), commission_rate: Number(editForm.commission_rate),
                start_date: new Date().toISOString().split('T')[0], standard_hours: 160
            });
            setIsEditOpen(false);
            setEditTarget(null);
            fetchStaff();
        } catch (err) { console.error(err); alert('Failed to update contract.'); }
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
        } catch (err) { console.error(err); alert('Failed to generate payroll.'); }
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
                    <h1 className="text-2xl font-bold text-white">Staff Management</h1>
                    <p className="text-sm text-[#6B6B6B] mt-1">{staff.length} staff members</p>
                </div>
                <button onClick={() => setIsAddOpen(true)} className="btn-primary">
                    <Plus size={18} /> Add New Staff
                </button>
            </div>

            {/* Table */}
            <div className="chart-card overflow-hidden !p-0">
                <div className="overflow-x-auto">
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
                                <tr><td colSpan={5} className="text-center py-8 text-[#333] text-sm">No staff members yet</td></tr>
                            )}
                            {staff.map((member) => (
                                <tr key={member.id}>
                                    <td>
                                        <div className="font-medium text-white">{member.full_name}</div>
                                        <div className="text-xs text-[#6B6B6B]">{member.email}</div>
                                    </td>
                                    <td>
                                        <span className={`badge ${member.role === 'COACH' ? 'badge-orange' : member.role === 'ADMIN' ? 'badge-blue' : 'badge-gray'}`}>
                                            {member.role}
                                        </span>
                                    </td>
                                    <td>
                                        {member.contract ? (
                                            <div className="flex items-center gap-1.5 text-[#A3A3A3]">
                                                <FileText size={14} className="text-[#6B6B6B]" />
                                                {member.contract.type}
                                            </div>
                                        ) : (
                                            <span className="badge badge-amber">No Contract</span>
                                        )}
                                    </td>
                                    <td className="font-mono text-sm text-white">
                                        {member.contract ? (
                                            <div>
                                                <div>{member.contract.base_salary.toLocaleString()} JOD</div>
                                                {member.contract.commission_rate > 0 && (
                                                    <div className="text-[#34d399] text-xs">+{(member.contract.commission_rate * 100).toFixed(0)}% Comm.</div>
                                                )}
                                            </div>
                                        ) : '—'}
                                    </td>
                                    <td>
                                        <div className="flex items-center justify-center gap-2">
                                            <button onClick={() => openEdit(member)} className="flex items-center gap-1 text-[#FF6B00] hover:text-[#FF8533] text-xs font-medium px-2 py-1 rounded-lg hover:bg-[#FF6B00]/10 transition-colors">
                                                <Pencil size={13} /> Edit
                                            </button>
                                            <button onClick={() => openPayroll(member)} className="flex items-center gap-1 text-[#34d399] hover:text-[#10b981] text-xs font-medium px-2 py-1 rounded-lg hover:bg-[#10b981]/10 transition-colors">
                                                <Calculator size={13} /> Payroll
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ADD MODAL */}
            <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add New Staff Member">
                <form onSubmit={handleAdd} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Full Name</label>
                        <input type="text" required className="input-dark" value={addForm.full_name} onChange={e => setAddForm({ ...addForm, full_name: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Email</label>
                        <input type="email" required className="input-dark" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Role</label>
                            <select className="input-dark" value={addForm.role} onChange={e => setAddForm({ ...addForm, role: e.target.value })}>
                                <option value="COACH">Coach</option>
                                <option value="ADMIN">Admin</option>
                                <option value="EMPLOYEE">Employee</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Contract</label>
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
                            <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Base Salary (JOD)</label>
                            <input type="number" className="input-dark" value={addForm.base_salary} onChange={e => setAddForm({ ...addForm, base_salary: Number(e.target.value) })} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Commission (0-1)</label>
                            <input type="number" step="0.01" max="1" className="input-dark" value={addForm.commission_rate} onChange={e => setAddForm({ ...addForm, commission_rate: Number(e.target.value) })} />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                        <button type="button" onClick={() => setIsAddOpen(false)} className="btn-ghost">Cancel</button>
                        <button type="submit" className="btn-primary"><Save size={16} /> Save Staff</button>
                    </div>
                </form>
            </Modal>

            {/* EDIT MODAL */}
            <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title={`Edit Contract — ${editTarget?.full_name}`}>
                <form onSubmit={handleEdit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Contract Type</label>
                        <select className="input-dark" value={editForm.contract_type} onChange={e => setEditForm({ ...editForm, contract_type: e.target.value })}>
                            <option value="FULL_TIME">Full Time</option>
                            <option value="PART_TIME">Part Time</option>
                            <option value="HYBRID">Hybrid</option>
                            <option value="CONTRACTOR">Contractor</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Base Salary (JOD)</label>
                            <input type="number" className="input-dark" value={editForm.base_salary} onChange={e => setEditForm({ ...editForm, base_salary: Number(e.target.value) })} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Commission Rate (0-1)</label>
                            <input type="number" step="0.01" max="1" className="input-dark" value={editForm.commission_rate} onChange={e => setEditForm({ ...editForm, commission_rate: Number(e.target.value) })} />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
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
                                <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Month</label>
                                <select className="input-dark" value={payrollForm.month} onChange={e => setPayrollForm({ ...payrollForm, month: Number(e.target.value) })}>
                                    {[...Array(12)].map((_, i) => (
                                        <option key={i + 1} value={i + 1}>{new Date(2024, i).toLocaleString('default', { month: 'long' })}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Year</label>
                                <input type="number" className="input-dark" value={payrollForm.year} onChange={e => setPayrollForm({ ...payrollForm, year: Number(e.target.value) })} />
                            </div>
                        </div>
                        {payrollTarget?.contract?.type === 'HYBRID' && (
                            <div>
                                <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Sales Volume (JOD)</label>
                                <input type="number" step="0.01" className="input-dark" value={payrollForm.sales_volume} onChange={e => setPayrollForm({ ...payrollForm, sales_volume: Number(e.target.value) })} placeholder="Enter sales for commission..." />
                            </div>
                        )}
                        <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                            <button type="button" onClick={() => setIsPayrollOpen(false)} className="btn-ghost">Cancel</button>
                            <button type="submit" className="btn-primary"><Calculator size={16} /> Generate</button>
                        </div>
                    </form>
                ) : (
                    <div className="space-y-4">
                        <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                            <p className="text-sm text-[#34d399] font-medium mb-1">Payroll Generated Successfully</p>
                            <p className="text-3xl font-bold text-[#10b981]">{payrollResult.total_pay?.toFixed(2)} JOD</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="rounded-lg p-3" style={{ background: '#2a2a2a' }}>
                                <p className="text-xs text-[#6B6B6B]">Base Pay</p>
                                <p className="font-mono font-semibold text-white">{payrollResult.base_pay?.toFixed(2)} JOD</p>
                            </div>
                            <div className="rounded-lg p-3" style={{ background: '#2a2a2a' }}>
                                <p className="text-xs text-[#6B6B6B]">Overtime Pay</p>
                                <p className="font-mono font-semibold text-white">{payrollResult.overtime_pay?.toFixed(2)} JOD</p>
                            </div>
                        </div>
                        <button onClick={() => { setIsPayrollOpen(false); setPayrollResult(null); }} className="btn-ghost w-full">Close</button>
                    </div>
                )}
            </Modal>
        </div>
    );
}
