'use client';

import { api } from '@/lib/api';
import { useState, useCallback } from 'react';
import { Users, Search, Mail, Shield, UserCog } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';

interface UserResult {
    id: string;
    email: string;
    full_name: string;
    role: string;
    gym_id: string;
}

export default function GlobalUserSearchPage() {
    const { locale } = useLocale();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<UserResult[]>([]);
    const [loading, setLoading] = useState(false);

    const handleSearch = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;
        
        setLoading(true);
        try {
            const resp = await api.get('/system/users/search', { params: { q: query } });
            setResults(resp.data);
        } catch (err) {
            console.error("Global search failed", err);
        } finally {
            setLoading(false);
        }
    }, [query]);
    
    const handleImpersonate = async (userId: string) => {
        try {
            const currentAccess = localStorage.getItem('access_token');
            const currentRefresh = localStorage.getItem('refresh_token');
            
            const resp = await api.post(`/system/users/${userId}/impersonate`);
            const { access_token, refresh_token } = resp.data;
            
            // Save original tokens for "Exit Mode"
            if (currentAccess) localStorage.setItem('admin_access_token', currentAccess);
            if (currentRefresh) localStorage.setItem('admin_refresh_token', currentRefresh);

            // Save new tokens and reload
            localStorage.setItem('access_token', access_token);
            localStorage.setItem('refresh_token', refresh_token);
            
            // Redirect to the main dashboard
            window.location.href = '/dashboard';
        } catch (err) {
            console.error("Impersonation failed", err);
            alert("Failed to impersonate user.");
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">
                    {locale === 'ar' ? 'البحث العام عن المستخدمين' : 'Global User Search'}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    {locale === 'ar' ? 'البحث عن المستخدمين عبر جميع الصالات' : 'Locate any user across all platform tenants'}
                </p>
            </div>

            <div className="max-w-2xl">
                <form onSubmit={handleSearch} className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={locale === 'ar' ? 'ابحث بالبريد الإلكتروني أو الاسم...' : 'Search by email or name...'}
                            className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2 text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
                        />
                    </div>
                    <button 
                        type="submit" 
                        disabled={loading}
                        className="btn-primary !px-6"
                    >
                        {loading ? '...' : (locale === 'ar' ? 'بحث' : 'Search')}
                    </button>
                </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {results.length > 0 ? (
                    results.map((r) => (
                        <div key={r.id} className="kpi-card p-4 hover:border-primary transition-colors group">
                            <div className="flex items-start gap-4">
                                <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                                    <Users size={20} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-foreground truncate">{r.full_name}</h3>
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                        <Mail size={12} />
                                        <span className="truncate">{r.email}</span>
                                    </div>
                                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                                        <div className="flex gap-4">
                                            <div className="flex items-center gap-1.5">
                                                <Shield size={12} className="text-primary" />
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{r.role}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                                <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[120px]">Gym: {r.gym_id.split('-')[0]}...</span>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleImpersonate(r.id)}
                                            className="text-primary hover:text-primary/80 transition-colors flex items-center gap-1 text-[10px] font-bold uppercase"
                                        >
                                            <UserCog size={14} />
                                            {locale === 'ar' ? 'دخول كمسؤول' : 'Support Log-in'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    query && !loading && (
                        <div className="col-span-full py-12 text-center border border-dashed border-border rounded-lg">
                            <p className="text-muted-foreground font-mono">
                                {locale === 'ar' ? 'لم يتم العثور على نتائج' : 'No users found matching your search'}
                            </p>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
