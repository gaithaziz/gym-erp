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

    // Form State
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
            // Assuming GET /auth/users exists for Admins. 
            // If not, we might need to rely to a different endpoint or add one.
            // app/auth/router.py doesn't seem to have list users. 
            // app/routers/access.py might? Or maybe we need to Add list users to auth router too.
            // Let's assume I need to add it or it exists.
            // Actually, standard practice: GET /auth/users
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
            // Reset form
            setNewEmail(''); setNewPassword(''); setNewName('');
        } catch (err) {
            console.error("Failed to add member", err);
            alert("Failed to add member");
        }
    };

    if (isLoading || !user) return <div>Loading...</div>;

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">Member Management</h1>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded"
                >
                    Add Member
                </button>
            </div>

            <div className="bg-white rounded shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {members.map((member) => (
                            <tr key={member.id}>
                                <td className="px-6 py-4 whitespace-nowrap">{member.full_name}</td>
                                <td className="px-6 py-4 whitespace-nowrap">{member.email}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${member.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>
                                        {member.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {member.is_active ? 'Active' : 'Inactive'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center">
                    <div className="bg-white p-8 rounded shadow-lg w-96">
                        <h2 className="text-xl font-bold mb-4">Add New Member</h2>
                        <form onSubmit={handleAddMember}>
                            <div className="space-y-4">
                                <input placeholder="Full Name" value={newName} onChange={e => setNewName(e.target.value)} className="w-full border p-2 rounded" required />
                                <input placeholder="Email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full border p-2 rounded" required />
                                <input placeholder="Password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full border p-2 rounded" required />
                                <select value={newRole} onChange={e => setNewRole(e.target.value)} className="w-full border p-2 rounded">
                                    <option value="CUSTOMER">Customer</option>
                                    <option value="COACH">Coach</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
                                <div className="flex justify-end gap-2 mt-4">
                                    <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 border rounded">Cancel</button>
                                    <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">Save</button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
