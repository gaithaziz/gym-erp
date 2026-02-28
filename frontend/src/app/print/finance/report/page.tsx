'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { isLocale } from '@/lib/i18n';
import { useLocale } from '@/context/LocaleContext';

type Transaction = {
    id: string;
    amount: number;
    type: 'INCOME' | 'EXPENSE';
    category: string;
    description: string;
    date: string;
    payment_method: string;
};

type FinanceSummary = {
    total_income: number;
    total_expenses: number;
    net_profit: number;
};

export default function FinanceReportPrintPage() {
    return (
        <Suspense fallback={<PrintLoadingFallback />}>
            <FinanceReportPrintPageContent />
        </Suspense>
    );
}

function FinanceReportPrintPageContent() {
    const searchParams = useSearchParams();
    const requestedLocale = searchParams.get('locale');
    const { locale, setLocale, formatDate, formatNumber } = useLocale();
    const [rows, setRows] = useState<Transaction[]>([]);
    const [summary, setSummary] = useState<FinanceSummary>({
        total_income: 0,
        total_expenses: 0,
        net_profit: 0,
    });
    const [totalRows, setTotalRows] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (requestedLocale && isLocale(requestedLocale) && requestedLocale !== locale) {
            setLocale(requestedLocale);
        }
    }, [locale, requestedLocale, setLocale]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const baseParams: Record<string, string | number> = {};
                const txType = searchParams.get('tx_type');
                const category = searchParams.get('category');
                const startDate = searchParams.get('start_date');
                const endDate = searchParams.get('end_date');
                if (txType) baseParams.tx_type = txType;
                if (category) baseParams.category = category;
                if (startDate) baseParams.start_date = startDate;
                if (endDate) baseParams.end_date = endDate;

                const summaryPromise = api.get('/finance/summary', { params: baseParams });
                const firstPagePromise = api.get('/finance/transactions', {
                    params: { ...baseParams, limit: 500, offset: 0 },
                });
                const [summaryRes, firstPageRes] = await Promise.all([summaryPromise, firstPagePromise]);
                const firstPageRows = firstPageRes.data.data || [];
                const total = Number(firstPageRes.headers['x-total-count'] || firstPageRows.length || 0);

                const allRows = [...firstPageRows];
                for (let offset = firstPageRows.length; offset < total; offset += 500) {
                    const pageRes = await api.get('/finance/transactions', {
                        params: { ...baseParams, limit: 500, offset },
                    });
                    allRows.push(...(pageRes.data.data || []));
                }

                if (!cancelled) {
                    setSummary(summaryRes.data?.data || { total_income: 0, total_expenses: 0, net_profit: 0 });
                    setRows(allRows);
                    setTotalRows(total);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [searchParams]);

    useEffect(() => {
        if (!loading) {
            const timer = window.setTimeout(() => window.print(), 250);
            return () => window.clearTimeout(timer);
        }
    }, [loading]);

    const txt = locale === 'ar'
        ? {
            brand: 'Gym ERP',
            title: 'التقرير المالي',
            subtitle: 'تقرير مالي منسق للحفظ أو الطباعة',
            filters: 'الفلاتر',
            range: 'النطاق',
            type: 'النوع',
            category: 'الفئة',
            all: 'الكل',
            allDates: 'كل التواريخ',
            date: 'التاريخ',
            description: 'الوصف',
            paymentMethod: 'طريقة الدفع',
            amount: 'المبلغ',
            rows: 'السجلات',
            totalIncome: 'إجمالي الدخل',
            totalExpenses: 'إجمالي المصروفات',
            netProfit: 'صافي الربح',
            loading: 'جارٍ تجهيز التقرير...',
            income: 'دخل',
            expense: 'مصروف',
            cash: 'نقد',
            card: 'بطاقة',
            transfer: 'تحويل',
            bankTransfer: 'تحويل بنكي',
            subscription: 'اشتراك',
            posSale: 'بيع نقطة البيع',
            otherIncome: 'دخل آخر',
            salary: 'راتب',
            rent: 'إيجار',
            utilities: 'مرافق',
            maintenance: 'صيانة',
            equipment: 'معدات',
            otherExpense: 'مصروف آخر',
        }
        : {
            brand: 'Gym ERP',
            title: 'Financial Report',
            subtitle: 'Printable finance report',
            filters: 'Filters',
            range: 'Range',
            type: 'Type',
            category: 'Category',
            all: 'All',
            allDates: 'All Dates',
            date: 'Date',
            description: 'Description',
            paymentMethod: 'Payment Method',
            amount: 'Amount',
            rows: 'Rows',
            totalIncome: 'Total Income',
            totalExpenses: 'Total Expenses',
            netProfit: 'Net Profit',
            loading: 'Preparing report...',
            income: 'Income',
            expense: 'Expense',
            cash: 'Cash',
            card: 'Card',
            transfer: 'Transfer',
            bankTransfer: 'Bank Transfer',
            subscription: 'Subscription',
            posSale: 'POS Sale',
            otherIncome: 'Other Income',
            salary: 'Salary',
            rent: 'Rent',
            utilities: 'Utilities',
            maintenance: 'Maintenance',
            equipment: 'Equipment',
            otherExpense: 'Other Expense',
        };

    const categoryLabelMap: Record<string, string> = {
        SUBSCRIPTION: txt.subscription,
        POS_SALE: txt.posSale,
        OTHER_INCOME: txt.otherIncome,
        SALARY: txt.salary,
        RENT: txt.rent,
        UTILITIES: txt.utilities,
        MAINTENANCE: txt.maintenance,
        EQUIPMENT: txt.equipment,
        OTHER_EXPENSE: txt.otherExpense,
    };
    const paymentMethodLabelMap: Record<string, string> = {
        CASH: txt.cash,
        CARD: txt.card,
        TRANSFER: txt.transfer,
        BANK_TRANSFER: txt.bankTransfer,
    };

    const rangeText = useMemo(() => {
        const start = searchParams.get('start_date');
        const end = searchParams.get('end_date');
        if (!start && !end) return txt.allDates;
        return `${start || '...'} - ${end || '...'}`;
    }, [searchParams, txt.allDates]);

    const getTypeLabel = (value: string) => {
        if (value === 'INCOME') return txt.income;
        if (value === 'EXPENSE') return txt.expense;
        return value.replaceAll('_', ' ');
    };

    return (
        <main className="min-h-screen bg-stone-100 p-6 text-slate-900 print:bg-white print:p-0">
            <style jsx global>{`
                @page { size: A4; margin: 12mm; }
            `}</style>
            <div className="mx-auto w-full max-w-5xl rounded-[28px] border border-stone-300 bg-white p-8 shadow-[0_18px_50px_rgba(15,23,42,0.08)] print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
                {loading ? (
                    <p className="text-sm text-slate-500">{txt.loading}</p>
                ) : (
                    <>
                        <section className="mb-6 flex items-start justify-between gap-4 border-b-2 border-stone-200 pb-5">
                            <div>
                                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-amber-600">{txt.brand}</p>
                                <h1 className="text-3xl font-bold">{txt.title}</h1>
                                <p className="mt-2 text-sm text-slate-500">{txt.subtitle}</p>
                            </div>
                            <div className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800">
                                {txt.rows}: {totalRows}
                            </div>
                        </section>

                        <section className="mb-5 rounded-3xl border border-stone-200 p-5">
                            <h2 className="mb-4 text-base font-semibold">{txt.filters}</h2>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <PrintMeta label={txt.range} value={rangeText} />
                                <PrintMeta label={txt.type} value={searchParams.get('tx_type') ? getTypeLabel(searchParams.get('tx_type') || '') : txt.all} />
                                <PrintMeta label={txt.category} value={categoryLabelMap[searchParams.get('category') || ''] || searchParams.get('category') || txt.all} />
                            </div>
                        </section>

                        <section className="mb-5 rounded-3xl border border-stone-200 p-5">
                            <div className="grid gap-3 sm:grid-cols-3">
                                <PrintMeta label={txt.totalIncome} value={formatNumber(summary.total_income, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
                                <PrintMeta label={txt.totalExpenses} value={formatNumber(summary.total_expenses, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
                                <PrintMeta label={txt.netProfit} value={formatNumber(summary.net_profit, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
                            </div>
                        </section>

                        <section className="rounded-3xl border border-stone-200 p-5">
                            <table className="w-full border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-stone-200 text-xs uppercase tracking-[0.14em] text-slate-500">
                                        <th className="py-3 ltr:text-left rtl:text-right">{txt.date}</th>
                                        <th className="py-3 ltr:text-left rtl:text-right">{txt.description}</th>
                                        <th className="py-3 ltr:text-left rtl:text-right">{txt.category}</th>
                                        <th className="py-3 ltr:text-left rtl:text-right">{txt.type}</th>
                                        <th className="py-3 ltr:text-left rtl:text-right">{txt.paymentMethod}</th>
                                        <th className="py-3 ltr:text-right rtl:text-left">{txt.amount}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => (
                                        <tr key={row.id} className="border-b border-stone-200 last:border-b-0">
                                            <td className="py-3">{formatDate(row.date, { year: 'numeric', month: '2-digit', day: '2-digit' })}</td>
                                            <td className="py-3">{row.description || '-'}</td>
                                            <td className="py-3">{categoryLabelMap[row.category] || row.category}</td>
                                            <td className="py-3">{getTypeLabel(row.type)}</td>
                                            <td className="py-3">{paymentMethodLabelMap[row.payment_method] || row.payment_method}</td>
                                            <td className="py-3 font-mono ltr:text-right rtl:text-left">
                                                {formatNumber(row.amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>
                    </>
                )}
            </div>
        </main>
    );
}

function PrintMeta({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</span>
            <span className="block text-sm text-slate-900 break-words">{value}</span>
        </div>
    );
}

function PrintLoadingFallback() {
    const loadingText = 'Preparing report...';
    return (
        <main className="min-h-screen bg-stone-100 p-6 text-slate-900 print:bg-white print:p-0">
            <div className="mx-auto w-full max-w-5xl rounded-[28px] border border-stone-300 bg-white p-8 shadow-[0_18px_50px_rgba(15,23,42,0.08)] print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
                <p className="text-sm text-slate-500">{loadingText}</p>
            </div>
        </main>
    );
}
