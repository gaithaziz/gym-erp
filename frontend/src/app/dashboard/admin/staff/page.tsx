'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Users, FileText, Plus } from 'lucide-react';

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

export default function StaffPage() {
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStaff();
    }, []);

    const fetchStaff = () => {
        api.get('/hr/staff')
            .then(res => {
                setStaff(res.data.data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch staff", err);
                setLoading(false);
            });
    };

    if (loading) return <div>Loading staff...</div>;

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">Staff Management</h1>
                <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                    <Plus size={20} />
                    <span>Add New Staff</span>
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-500 text-sm uppercase">
                        <tr>
                            <th className="px-6 py-4 font-medium">Name</th>
                            <th className="px-6 py-4 font-medium">Role</th>
                            <th className="px-6 py-4 font-medium">Contract Type</th>
                            <th className="px-6 py-4 font-medium">Salary</th>
                            <th className="px-6 py-4 font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {staff.map((member) => (
                            <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="font-medium text-gray-900">{member.full_name}</div>
                                    <div className="text-sm text-gray-500">{member.email}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                        ${member.role === 'COACH' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}`}>
                                        {member.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-gray-600">
                                    {member.contract ? (
                                        <div className="flex items-center gap-2">
                                            <FileText size={16} className="text-gray-400" />
                                            {member.contract.type}
                                        </div>
                                    ) : (
                                        <span className="text-orange-500 text-sm">No Contract</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 font-mono text-sm">
                                    {member.contract ? (
                                        <div>
                                            <div>${member.contract.base_salary.toLocaleString()}</div>
                                            {member.contract.commission_rate > 0 && (
                                                <div className="text-green-600 text-xs">
                                                    + {(member.contract.commission_rate * 100)}% Comm.
                                                </div>
                                            )}
                                        </div>
                                    ) : '-'}
                                </td>
                                <td className="px-6 py-4">
                                    <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                                        Edit
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
