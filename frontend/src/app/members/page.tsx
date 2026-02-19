'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface User {
    id: string;
    email: string;
    full_name: string;
    role: string;
    is_active: boolean;
}

export default function MembersPage() {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    const [members, setMembers] = useState<User[]>([]);

    const [showAddModal, setShowAddModal] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newName, setNewName] = useState('');
    const [newRole, setNewRole] = useState('CUSTOMER');

    useEffect(() => {
        if (!isLoading) {
            if (!user) {
                router.push('/login');
            } else {
                fetchMembers();
            }
        }
    }, [user, isLoading, router]);

    const fetchMembers = async () => {
        try {
            const res = await api.get('/auth/users');
            setMembers(res.data.data);
        } catch (err) {
            console.error("Failed to fetch members", err);
        }
    };

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/auth/register', {
                email: newEmail,
                password: newPassword,
                full_name: newName,
                role: newRole
            });
            setShowAddModal(false);
            fetchMembers();
            setNewEmail(''); setNewPassword(''); setNewName('');
        } catch (err) {
            console.error("Failed to add member", err);
            alert("Failed to add member");
        }
    };

    if (isLoading || !user) return (
        <div className="flex h-screen items-center justify-center" style={{ background: '#111111' }}>
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
        </div>
    );

    return (
        <div className="min-h-screen p-8" style={{ background: '#111111' }}>
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-white">Member Management</h1>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="btn-primary"
                >
                    Add Member
                </button>
            </div>

            <div className="chart-card overflow-hidden !p-0">
                <table className="w-full table-dark">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {members.map((member) => (
                            <tr key={member.id}>
                                <td className="!text-white font-medium">{member.full_name}</td>
                                <td>{member.email}</td>
                                <td>
                                    <span className={`badge ${member.role === 'ADMIN' ? 'badge-blue' : 'badge-green'}`}>
                                        {member.role}
                                    </span>
                                </td>
                                <td>
                                    <span className={`badge ${member.is_active ? 'badge-green' : 'badge-red'}`}>
                                        {member.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="rounded-2xl p-8 w-96 shadow-2xl" style={{ background: '#1e1e1e', border: '1px solid #333' }}>
                        <h2 className="text-xl font-bold text-white mb-4">Add New Member</h2>
                        <form onSubmit={handleAddMember}>
                            <div className="space-y-4">
                                <input placeholder="Full Name" value={newName} onChange={e => setNewName(e.target.value)} className="input-dark" required />
                                <input placeholder="Email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="input-dark" required />
                                <input placeholder="Password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="input-dark" required />
                                <select value={newRole} onChange={e => setNewRole(e.target.value)} className="input-dark">
                                    <option value="CUSTOMER">Customer</option>
                                    <option value="COACH">Coach</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
                                <div className="flex justify-end gap-2 mt-4">
                                    <button type="button" onClick={() => setShowAddModal(false)} className="btn-ghost">Cancel</button>
                                    <button type="submit" className="btn-primary">Save</button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
