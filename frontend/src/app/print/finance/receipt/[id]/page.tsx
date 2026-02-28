'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { isLocale } from '@/lib/i18n';
import { useLocale } from '@/context/LocaleContext';

type ReceiptData = {
    receipt_no: string;
    date: string;
    amount: number;
    type: string;
    category: string;
    payment_method: string;
    description: string;
    billed_to: string;
    gym_name: string;
};

export default function FinanceReceiptPrintPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const idParam = params?.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const requestedLocale = searchParams.get('locale');
    const { locale, setLocale, direction, formatDate, formatNumber } = useLocale();
    const [data, setData] = useState<ReceiptData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (requestedLocale && isLocale(requestedLocale) && requestedLocale !== locale) {
            setLocale(requestedLocale);
        }
    }, [locale, requestedLocale, setLocale]);

    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const res = await api.get(`/finance/transactions/${id}/receipt`);
                if (!cancelled) setData(res.data.data);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [id]);

    useEffect(() => {
        if (!data) return;
        const timer = window.setTimeout(() => window.print(), 250);
        return () => window.clearTimeout(timer);
    }, [data]);

    const txt = locale === 'ar'
        ? {
            title: 'إيصال مالي',
            subtitle: 'مستند مالي جاهز للحفظ أو الطباعة',
            receiptNo: 'رقم الإيصال',
            date: 'التاريخ',
            billedTo: 'العميل',
            category: 'الفئة',
            paymentMethod: 'طريقة الدفع',
            type: 'النوع',
            description: 'الوصف',
            amount: 'المبلغ',
            total: 'الإجمالي',
            loading: 'جارٍ تجهيز الإيصال...',
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
            title: 'Finance Receipt',
            subtitle: 'Printable financial document',
            receiptNo: 'Receipt No',
            date: 'Date',
            billedTo: 'Billed To',
            category: 'Category',
            paymentMethod: 'Payment Method',
            type: 'Type',
            description: 'Description',
            amount: 'Amount',
            total: 'Total',
            loading: 'Preparing receipt...',
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
    const typeLabelMap: Record<string, string> = {
        INCOME: txt.income,
        EXPENSE: txt.expense,
    };

    return (
        <main className="min-h-screen bg-stone-100 p-6 text-slate-900 print:bg-white print:p-0">
            <style jsx global>{`
                @page { size: A4; margin: 12mm; }
            `}</style>
            <div className="mx-auto w-full max-w-4xl rounded-[28px] border border-stone-300 bg-white p-8 shadow-[0_18px_50px_rgba(15,23,42,0.08)] print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
                {loading || !data ? (
                    <p className="text-sm text-slate-500">{txt.loading}</p>
                ) : (
                    <>
                        <section className="mb-6 flex items-start justify-between gap-4 border-b-2 border-stone-200 pb-5">
                            <div>
                                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-amber-600">Gym ERP</p>
                                <h1 className="text-3xl font-bold">{txt.title}</h1>
                                <p className="mt-2 text-sm text-slate-500">{txt.subtitle}</p>
                            </div>
                            <div className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800">
                                {txt.receiptNo} {data.receipt_no}
                            </div>
                        </section>

                        <section className="mb-5 rounded-3xl border border-stone-200 p-5">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                <PrintMeta label={txt.receiptNo} value={data.receipt_no} />
                                <PrintMeta label={txt.date} value={formatDate(data.date, { year: 'numeric', month: 'long', day: 'numeric' })} />
                                <PrintMeta label={txt.billedTo} value={data.billed_to} />
                                <PrintMeta label={txt.category} value={categoryLabelMap[data.category] || data.category} />
                                <PrintMeta label={txt.paymentMethod} value={paymentMethodLabelMap[data.payment_method] || data.payment_method} />
                                <PrintMeta label={txt.type} value={typeLabelMap[data.type] || data.type} />
                            </div>
                        </section>

                        <section className="mb-5 rounded-3xl border border-stone-200 p-5">
                            <h2 className="mb-4 text-base font-semibold">{txt.description}</h2>
                            <table className="w-full border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-stone-200 text-xs uppercase tracking-[0.14em] text-slate-500">
                                        <th className={`py-3 ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>{txt.description}</th>
                                        <th className={`py-3 ${direction === 'rtl' ? 'text-left' : 'text-right'}`}>{txt.amount}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-stone-200">
                                        <td className="py-4">{data.description}</td>
                                        <td className={`py-4 font-mono ${direction === 'rtl' ? 'text-left' : 'text-right'}`}>{formatNumber(data.amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <div className="mt-4 flex items-center justify-between border-t-2 border-stone-200 pt-4 text-lg font-bold">
                                <span>{txt.total}</span>
                                <span className="font-mono">{formatNumber(data.amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
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
