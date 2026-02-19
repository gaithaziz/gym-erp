'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';


import Modal from '@/components/Modal';

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

    const fetchMembers = useCallback(async () => {
        try {
            const res = await api.get('/auth/users');
            setMembers(res.data.data);
        } catch (err) {
            console.error("Failed to fetch members", err);
        }
    }, []);

    useEffect(() => {
        if (!isLoading) {
            if (!user) {
                router.push('/login');
            } else {
                setTimeout(() => fetchMembers(), 0);
            }
        }
    }, [user, isLoading, router, fetchMembers]);

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
        <div className="flex h-screen items-center justify-center bg-background">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
    );

    return (
        <div className="min-h-screen p-8 bg-background">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-foreground font-serif tracking-tight">Member Management</h1>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="btn-primary rounded-sm shadow-none"
                >
                    Add Member
                </button>
            </div>

            <div className="rounded-sm border border-border bg-card overflow-hidden">
                <table className="w-full table-dark">
                    <thead>
                        <tr>
                            <th className="font-mono text-xs uppercase tracking-wider bg-muted/20">Name</th>
                            <th className="font-mono text-xs uppercase tracking-wider bg-muted/20">Email</th>
                            <th className="font-mono text-xs uppercase tracking-wider bg-muted/20">Role</th>
                            <th className="font-mono text-xs uppercase tracking-wider bg-muted/20">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {members.map((member) => (
                            <tr key={member.id} className="hover:bg-muted/10 transition-colors">
                                <td className="text-foreground font-medium">{member.full_name}</td>
                                <td className="text-muted-foreground font-mono text-sm">{member.email}</td>
                                <td>
                                    <span className={`badge ${member.role === 'ADMIN' ? 'badge-blue' : 'badge-green'} rounded-sm`}>
                                        {member.role}
                                    </span>
                                </td>
                                <td>
                                    <span className={`badge ${member.is_active ? 'badge-green' : 'badge-red'} rounded-sm`}>
                                        {member.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add Modal */}
            <Modal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                title="Add New Member"
            >
                <form onSubmit={handleAddMember}>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Full Name</label>
                            <input placeholder="Full Name" value={newName} onChange={e => setNewName(e.target.value)} className="input-dark rounded-sm" required />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Email</label>
                            <input placeholder="Email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="input-dark rounded-sm" required />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Password</label>
                            <input placeholder="Password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="input-dark rounded-sm" required />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Rule</label>
                            <select value={newRole} onChange={e => setNewRole(e.target.value)} className="input-dark rounded-sm appearance-none">
                                <option value="CUSTOMER">Customer</option>
                                <option value="COACH">Coach</option>
                                <option value="ADMIN">Admin</option>
                            </select>
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                            <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                            <button type="submit" className="btn-primary rounded-sm shadow-none">Save Member</button>
                        </div>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
