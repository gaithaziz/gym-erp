export const POLICY_VERSION = '1.0';
export const POLICY_STORAGE_KEY = 'gym_policy_content_v1';
export const POLICY_LAST_PUBLISHED_KEY = 'gym_policy_last_published_v1';
export const POLICY_SIGNATURE_PREFIX = 'gym_policy_signature_';

export type PolicyLocale = 'en' | 'ar';

export interface PolicySignature {
    version: string;
    signedAt: string;
    signerName: string;
    accepted: true;
}

export interface PolicyContent {
    version?: string;
    title: string;
    effectiveDate: string;
    updatedAt: string;
    intro: string;
    sections: Array<{
        title: string;
        points: string[];
    }>;
    footerNote: string;
}

export const DEFAULT_POLICY_CONTENT: Record<PolicyLocale, PolicyContent> = {
    en: {
        title: 'Gym Policy & Membership Contract',
        effectiveDate: '2026-05-01',
        updatedAt: '2026-05-01',
        intro: 'This policy defines the membership rules, facility use, subscriptions, guest privileges, and digital acceptance terms for the gym.',
        sections: [
            {
                title: 'Membership and Access',
                points: [
                    'Members must have an active subscription to access the facility.',
                    'Access is personal and cannot be shared with other people.',
                    'The gym may suspend access if the subscription is expired, frozen, or unpaid.',
                ],
            },
            {
                title: 'Bundles and Perks',
                points: [
                    'Bundle perks may include guest visits, InBody tests, private classes, and other admin-defined benefits.',
                    'Some perks reset monthly while others last for the full contract period.',
                    'Any custom bundle terms agreed by the admin are part of the signed contract.',
                ],
            },
            {
                title: 'Contracts and Acceptance',
                points: [
                    'A customer must review and sign the membership contract before payment completion.',
                    'Contract acceptance is recorded with the active policy version.',
                    'A new policy version may require re-acceptance on the next login or renewal.',
                ],
            },
            {
                title: 'Announcements and Notifications',
                points: [
                    'Announcements are informational and may be delivered as push notifications.',
                    'The gym may publish operational updates, closures, schedule changes, and promotions.',
                ],
            },
        ],
        footerNote: 'By continuing, the member confirms they understood the policy and agree to follow it.',
    },
    ar: {
        title: 'سياسة النادي وعقد العضوية',
        effectiveDate: '2026-05-01',
        updatedAt: '2026-05-01',
        intro: 'تحدد هذه السياسة قواعد العضوية، واستخدام المرافق، والاشتراكات، ومزايا الضيوف، وشروط الموافقة الرقمية للنادي.',
        sections: [
            {
                title: 'العضوية والدخول',
                points: [
                    'يجب أن يكون لدى العضو اشتراك نشط للدخول إلى النادي.',
                    'الدخول شخصي ولا يمكن مشاركته مع أي شخص آخر.',
                    'يحق للنادي إيقاف الدخول إذا كان الاشتراك منتهيًا أو مجمدًا أو غير مدفوع.',
                ],
            },
            {
                title: 'الباقات والمزايا',
                points: [
                    'قد تشمل مزايا الباقة زيارات للضيوف، واختبارات InBody، وحصص خاصة، ومزايا أخرى يحددها المشرف.',
                    'بعض المزايا تتجدد شهريًا وبعضها يبقى طوال مدة العقد.',
                    'أي شروط خاصة يتفق عليها المشرف تعد جزءًا من العقد الموقع.',
                ],
            },
            {
                title: 'العقود والموافقة',
                points: [
                    'يجب على العميل مراجعة عقد العضوية والتوقيع عليه قبل إكمال الدفع.',
                    'تُسجل الموافقة على العقد مع إصدار السياسة الحالي.',
                    'قد تتطلب نسخة جديدة من السياسة إعادة الموافقة عند الدخول التالي أو التجديد.',
                ],
            },
            {
                title: 'الإعلانات والإشعارات',
                points: [
                    'الإعلانات معلوماتية فقط وقد تصل كملاحظات دفعية.',
                    'يمكن للنادي نشر التحديثات التشغيلية، والإغلاق، وتغييرات الجدول، والعروض.',
                ],
            },
        ],
        footerNote: 'بالمتابعة، يقر العضو بأنه فهم السياسة ويلتزم بها.',
    },
};

export const getPolicyStorageKey = (locale: PolicyLocale) =>
    `${POLICY_STORAGE_KEY}_${locale}`;

export const getPolicySignatureKey = (userId: string) =>
    `${POLICY_SIGNATURE_PREFIX}${userId}`;

export const getLegacyPolicySignatureKey = (userId: string) =>
    `${POLICY_SIGNATURE_PREFIX}${userId}`;

export const getLocalePolicySignatureKey = (userId: string, locale: PolicyLocale) =>
    `${POLICY_SIGNATURE_PREFIX}${userId}_${locale}`;

export const loadPolicyContent = (locale: PolicyLocale): PolicyContent => {
    if (typeof window === 'undefined') return DEFAULT_POLICY_CONTENT[locale];

    const raw = localStorage.getItem(getPolicyStorageKey(locale));
    if (!raw) return DEFAULT_POLICY_CONTENT[locale];

    try {
        const parsed = JSON.parse(raw) as Partial<PolicyContent>;
        return {
            ...DEFAULT_POLICY_CONTENT[locale],
            ...parsed,
            sections: Array.isArray(parsed.sections) && parsed.sections.length > 0
                ? parsed.sections.map((section) => ({
                    title: typeof section.title === 'string' ? section.title : '',
                    points: Array.isArray(section.points)
                        ? section.points.filter((point): point is string => typeof point === 'string')
                        : [],
                }))
                : DEFAULT_POLICY_CONTENT[locale].sections,
        };
    } catch {
        return DEFAULT_POLICY_CONTENT[locale];
    }
};

export const savePolicyContent = (locale: PolicyLocale, content: PolicyContent) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(getPolicyStorageKey(locale), JSON.stringify(content));
    localStorage.setItem(POLICY_LAST_PUBLISHED_KEY, new Date().toISOString());
};
