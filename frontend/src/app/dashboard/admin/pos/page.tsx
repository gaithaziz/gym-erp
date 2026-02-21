'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { ShoppingCart, Plus, Minus, Trash2, CreditCard, Banknote, ArrowRightLeft, Check, Package } from 'lucide-react';

interface Product {
    id: string;
    name: string;
    sku: string | null;
    category: string;
    price: number;
    stock_quantity: number;
    is_active: boolean;
}

interface CartItem {
    product: Product;
    quantity: number;
}

const PAYMENT_METHODS = [
    { value: 'CASH', label: 'Cash', icon: Banknote },
    { value: 'CARD', label: 'Card', icon: CreditCard },
    { value: 'TRANSFER', label: 'Transfer', icon: ArrowRightLeft },
];

export default function POSPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('CASH');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [saleComplete, setSaleComplete] = useState<string | null>(null);

    const fetchProducts = useCallback(async () => {
        try {
            const res = await api.get('/inventory/products');
            setProducts(res.data.data.filter((p: Product) => p.is_active && p.stock_quantity > 0));
        } catch {
            console.error('Failed to fetch products');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.product.id === product.id);
            if (existing) {
                if (existing.quantity >= product.stock_quantity) return prev;
                return prev.map(item =>
                    item.product.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prev, { product, quantity: 1 }];
        });
    };

    const updateQuantity = (productId: string, delta: number) => {
        setCart(prev => prev
            .map(item => {
                if (item.product.id !== productId) return item;
                const newQty = item.quantity + delta;
                if (newQty <= 0) return item;
                if (newQty > item.product.stock_quantity) return item;
                return { ...item, quantity: newQty };
            })
        );
    };

    const removeFromCart = (productId: string) => {
        setCart(prev => prev.filter(item => item.product.id !== productId));
    };

    const total = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

    const completeSale = async () => {
        if (cart.length === 0) return;
        setProcessing(true);
        try {
            // Process each cart item as a separate sale
            for (const item of cart) {
                await api.post('/inventory/pos/sell', {
                    product_id: item.product.id,
                    quantity: item.quantity,
                    payment_method: paymentMethod,
                });
            }
            setSaleComplete(`$${total.toFixed(2)}`);
            setCart([]);
            fetchProducts(); // Refresh stock
            setTimeout(() => setSaleComplete(null), 3000);
        } catch {
            console.error('Sale failed');
        } finally {
            setProcessing(false);
        }
    };

    const categories = [...new Set(products.map(p => p.category))];
    const filteredProducts = categoryFilter
        ? products.filter(p => p.category === categoryFilter)
        : products;

    return (
        <div className="flex min-h-[calc(100dvh-80px)] flex-col gap-4 xl:flex-row">
            {/* Product Grid */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="mb-4">
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">Point of Sale</h1>
                    <p className="text-sm text-muted-foreground mt-1">Quick product sales</p>
                </div>

                {/* Category Tabs */}
                <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                    <button
                        onClick={() => setCategoryFilter('')}
                        className={`px-3 py-1.5 text-xs font-mono uppercase border transition-colors shrink-0 ${!categoryFilter ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        All
                    </button>
                    {categories.map(c => (
                        <button
                            key={c}
                            onClick={() => setCategoryFilter(c)}
                            className={`px-3 py-1.5 text-xs font-mono uppercase border transition-colors shrink-0 ${categoryFilter === c ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            {c}
                        </button>
                    ))}
                </div>

                {/* Product Grid */}
                {loading ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-28 bg-muted/50 animate-pulse" />)}
                    </div>
                ) : filteredProducts.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <Package size={40} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                            <p className="text-muted-foreground text-sm">No products available</p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 overflow-y-auto">
                        {filteredProducts.map(p => {
                            const inCart = cart.find(item => item.product.id === p.id);
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => addToCart(p)}
                                    className={`kpi-card p-4 text-left transition-all hover:border-primary cursor-pointer ${inCart ? 'border-primary bg-primary/5' : ''
                                        }`}
                                >
                                    <p className="text-sm font-bold text-foreground truncate">{p.name}</p>
                                    <p className="text-xs text-muted-foreground font-mono mt-1">{p.category}</p>
                                    <div className="flex items-end justify-between mt-3">
                                        <span className="text-lg font-bold text-foreground font-mono">${p.price.toFixed(2)}</span>
                                        <span className={`text-xs font-mono ${p.stock_quantity <= 5 ? 'text-red-500' : 'text-muted-foreground'}`}>
                                            {p.stock_quantity} left
                                        </span>
                                    </div>
                                    {inCart && (
                                        <div className="mt-2 text-xs text-primary font-mono font-bold">
                                            ×{inCart.quantity} in cart
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Cart Sidebar */}
            <div className="w-full xl:w-80 shrink-0 flex flex-col border border-border bg-card">
                <div className="p-4 border-b border-border">
                    <div className="flex items-center gap-2">
                        <ShoppingCart size={18} className="text-primary" />
                        <h2 className="text-sm font-bold text-foreground font-mono uppercase">Cart</h2>
                        <span className="text-xs text-muted-foreground font-mono ml-auto">
                            {cart.reduce((s, i) => s + i.quantity, 0)} items
                        </span>
                    </div>
                </div>

                {/* Cart Items */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {cart.length === 0 ? (
                        <div className="text-center py-10">
                            <ShoppingCart size={28} className="mx-auto text-muted-foreground mb-2 opacity-40" />
                            <p className="text-xs text-muted-foreground">Tap products to add</p>
                        </div>
                    ) : cart.map(item => (
                        <div key={item.product.id} className="p-3 border border-border bg-muted/10">
                            <div className="flex items-start justify-between mb-2">
                                <p className="text-sm font-bold text-foreground leading-tight">{item.product.name}</p>
                                <button onClick={() => removeFromCart(item.product.id)} className="text-muted-foreground hover:text-red-500 shrink-0 ml-2">
                                    <Trash2 size={12} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <button onClick={() => updateQuantity(item.product.id, -1)} className="p-1 border border-border hover:bg-muted transition-colors">
                                        <Minus size={12} />
                                    </button>
                                    <span className="text-sm font-mono font-bold w-6 text-center">{item.quantity}</span>
                                    <button onClick={() => updateQuantity(item.product.id, 1)} className="p-1 border border-border hover:bg-muted transition-colors">
                                        <Plus size={12} />
                                    </button>
                                </div>
                                <span className="text-sm font-mono font-bold text-foreground">
                                    ${(item.product.price * item.quantity).toFixed(2)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Payment & Total */}
                <div className="border-t border-border p-4 space-y-3">
                    {/* Payment Method */}
                    <div className="flex gap-1">
                        {PAYMENT_METHODS.map(pm => (
                            <button
                                key={pm.value}
                                onClick={() => setPaymentMethod(pm.value)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-mono border transition-colors ${paymentMethod === pm.value
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'border-border text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                <pm.icon size={14} />
                                {pm.label}
                            </button>
                        ))}
                    </div>

                    {/* Total */}
                    <div className="flex items-end justify-between">
                        <span className="text-xs font-mono text-muted-foreground uppercase">Total</span>
                        <span className="text-2xl font-bold text-foreground font-mono">${total.toFixed(2)}</span>
                    </div>

                    {/* Complete Sale */}
                    <button
                        onClick={completeSale}
                        disabled={cart.length === 0 || processing}
                        className="btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2"
                    >
                        {processing ? (
                            <>
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                                Processing...
                            </>
                        ) : saleComplete ? (
                            <>
                                <Check size={16} />
                                Sale Complete — {saleComplete}
                            </>
                        ) : (
                            'Complete Sale'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
