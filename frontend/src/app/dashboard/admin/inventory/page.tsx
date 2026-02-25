'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Package, Plus, Search, Edit, Trash2, AlertTriangle, X } from 'lucide-react';
import { useFeedback } from '@/components/FeedbackProvider';

interface Product {
    id: string;
    name: string;
    sku: string | null;
    category: string;
    price: number;
    cost_price: number | null;
    stock_quantity: number;
    low_stock_threshold: number;
    is_active: boolean;
    image_url: string | null;
    created_at: string;
}

const CATEGORIES = ['SUPPLEMENT', 'DRINK', 'MERCHANDISE', 'SNACK', 'OTHER'];

export default function InventoryPage() {
    const { showToast, confirm: confirmAction } = useFeedback();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [debouncedCategoryFilter, setDebouncedCategoryFilter] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [form, setForm] = useState({
        name: '', sku: '', category: 'OTHER', price: '', cost_price: '',
        stock_quantity: '', low_stock_threshold: '5', image_url: ''
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search.trim());
            setDebouncedCategoryFilter(categoryFilter);
        }, 300);
        return () => clearTimeout(timer);
    }, [search, categoryFilter]);

    const fetchProducts = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (debouncedSearch) params.set('search', debouncedSearch);
            if (debouncedCategoryFilter) params.set('category', debouncedCategoryFilter);
            const res = await api.get(`/inventory/products?${params.toString()}`);
            setProducts(res.data.data);
        } catch {
            console.error('Failed to fetch products');
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, debouncedCategoryFilter]);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    const openCreate = () => {
        setEditingProduct(null);
        setForm({ name: '', sku: '', category: 'OTHER', price: '', cost_price: '', stock_quantity: '', low_stock_threshold: '5', image_url: '' });
        setShowModal(true);
    };

    const openEdit = (p: Product) => {
        setEditingProduct(p);
        setForm({
            name: p.name, sku: p.sku || '', category: p.category,
            price: String(p.price), cost_price: p.cost_price ? String(p.cost_price) : '',
            stock_quantity: String(p.stock_quantity), low_stock_threshold: String(p.low_stock_threshold),
            image_url: p.image_url || ''
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                name: form.name,
                sku: form.sku || null,
                category: form.category,
                price: parseFloat(form.price),
                cost_price: form.cost_price ? parseFloat(form.cost_price) : null,
                stock_quantity: parseInt(form.stock_quantity) || 0,
                low_stock_threshold: parseInt(form.low_stock_threshold) || 5,
                image_url: form.image_url || null,
            };
            if (editingProduct) {
                await api.put(`/inventory/products/${editingProduct.id}`, payload);
            } else {
                await api.post('/inventory/products', payload);
            }
            setShowModal(false);
            fetchProducts();
        } catch {
            console.error('Failed to save product');
            showToast('Failed to save product', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        const confirmed = await confirmAction({
            title: 'Deactivate Product',
            description: 'Deactivate this product?',
            confirmText: 'Deactivate',
            destructive: true,
        });
        if (!confirmed) return;
        try {
            await api.delete(`/inventory/products/${id}`);
            fetchProducts();
        } catch {
            console.error('Failed to delete product');
            showToast('Failed to delete product', 'error');
        }
    };

    const lowStockProducts = products.filter(p => p.stock_quantity <= p.low_stock_threshold);

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">Inventory</h1>
                    <p className="text-sm text-muted-foreground mt-1">Manage products and stock levels</p>
                </div>
                <button onClick={openCreate} className="btn-primary px-4 py-2 flex items-center gap-2 text-sm">
                    <Plus size={16} /> Add Product
                </button>
            </div>

            {/* Low Stock Alert */}
            {lowStockProducts.length > 0 && (
                <div className="border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" />
                    <div>
                        <p className="text-sm font-bold text-foreground">Low Stock Alert</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {lowStockProducts.map(p => `${p.name} (${p.stock_quantity} left)`).join(', ')}
                        </p>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="field-with-icon w-full sm:flex-[2]">
                    <Search size={16} className="field-icon" />
                    <input
                        type="text"
                        placeholder="Search products..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="input-dark input-with-icon text-sm"
                    />
                </div>
                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="input-dark text-sm w-full sm:w-44"
                >
                    <option value="">All Categories</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>

            {/* Products Table */}
            {loading ? (
                <div className="animate-pulse space-y-2">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-muted/50" />)}
                </div>
            ) : (
                <div className="border border-border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border bg-muted/30">
                                <th className="text-left px-4 py-3 font-mono text-xs text-muted-foreground uppercase">Product</th>
                                <th className="text-left px-4 py-3 font-mono text-xs text-muted-foreground uppercase">Category</th>
                                <th className="text-right px-4 py-3 font-mono text-xs text-muted-foreground uppercase">Price</th>
                                <th className="text-right px-4 py-3 font-mono text-xs text-muted-foreground uppercase">Stock</th>
                                <th className="text-right px-4 py-3 font-mono text-xs text-muted-foreground uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-12 text-muted-foreground">
                                        <Package size={32} className="mx-auto mb-3 opacity-50" />
                                        <p>No products found</p>
                                    </td>
                                </tr>
                            ) : products.map(p => (
                                <tr key={p.id} className="border-b border-border hover:bg-muted/10 transition-colors">
                                    <td className="px-4 py-3">
                                        <p className="font-bold text-foreground">{p.name}</p>
                                        {p.sku && <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs font-mono px-2 py-0.5 bg-muted/30 border border-border">
                                            {p.category}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-foreground">
                                        ${p.price.toFixed(2)}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <span className={`font-mono font-bold ${p.stock_quantity <= p.low_stock_threshold
                                                ? 'text-red-500'
                                                : 'text-emerald-500'
                                            }`}>
                                            {p.stock_quantity}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={() => openEdit(p)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                                                <Edit size={14} />
                                            </button>
                                            <button onClick={() => handleDelete(p.id)} className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <div className="w-full max-w-lg p-6 bg-card border border-border shadow-xl">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-bold text-foreground font-serif">
                                {editingProduct ? 'Edit Product' : 'Add Product'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1 font-mono">Name *</label>
                                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-dark text-sm" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground uppercase mb-1 font-mono">SKU</label>
                                    <input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} className="input-dark text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground uppercase mb-1 font-mono">Category</label>
                                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="input-dark text-sm">
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground uppercase mb-1 font-mono">Price *</label>
                                    <input type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="input-dark text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground uppercase mb-1 font-mono">Cost Price</label>
                                    <input type="number" step="0.01" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: e.target.value })} className="input-dark text-sm" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground uppercase mb-1 font-mono">Stock Qty</label>
                                    <input type="number" value={form.stock_quantity} onChange={e => setForm({ ...form, stock_quantity: e.target.value })} className="input-dark text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground uppercase mb-1 font-mono">Low Stock Alert</label>
                                    <input type="number" value={form.low_stock_threshold} onChange={e => setForm({ ...form, low_stock_threshold: e.target.value })} className="input-dark text-sm" />
                                </div>
                            </div>
                            <button
                                onClick={handleSave}
                                disabled={saving || !form.name || !form.price}
                                className="btn-primary w-full py-2.5 text-sm mt-2"
                            >
                                {saving ? 'Saving...' : editingProduct ? 'Update Product' : 'Create Product'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
