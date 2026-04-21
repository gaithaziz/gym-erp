'use client';

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  CreditCard,
  Dumbbell,
  LifeBuoy,
  MessageSquare,
  QrCode,
  ShieldCheck,
  ShieldPlus,
  Sparkles,
  Store,
  Users,
  Wallet,
} from "lucide-react";
import { BrandMark } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLocale } from "@/context/LocaleContext";

export default function Home() {
  const { locale } = useLocale();
  const isArabic = locale === "ar";

  const txt = isArabic
    ? {
        brandName: "OmniGYM",
        navFeatures: "المنظومة",
        navAbout: "حول النظام",
        navFlow: "كيف يعمل",
        signInLabel: "تسجيل الدخول",
        badge: "نظام تشغيل متكامل للأندية الحديثة",
        heroTitle1: "أدر ناديك",
        heroTitle2: "كمنظومة واحدة",
        heroSubtitle:
          "OmniGYM ليس مجرد صفحة اشتراكات أو لوحة حضور. إنه نظام ERP كامل للنادي يجمع الأعضاء، الموظفين، الدخول، الحصص، التدريب، المالية، والدعم في منصة واحدة.",
        heroPrimary: "ابدأ الآن",
        heroSecondary: "استكشف المنظومة",
        storyLabel: "مصمم للتشغيل الحقيقي",
        storyTitle: "منصة واحدة للأعضاء والموظفين والتدريب والمالية",
        storyBody:
          "من تسجيل الأعضاء والاستقبال إلى الحصص، الرواتب، نقطة البيع، الدعم، والتقارير، يجمع OmniGYM تشغيل النادي اليومي في منصة واحدة مترابطة.",
        platformTitle: "ما الذي يغطيه النظام فعلاً؟",
        platformBody:
          "من التسجيل والاستقبال وحتى الرواتب والتقارير والمتابعة التدريبية، كل جزء هنا مصمم ليعمل مع البقية بدل أن يكون أداة معزولة.",
        modules: [
          {
            title: "الأعضاء والاشتراكات",
            desc: "تسجيل الأعضاء، التجديد، التجميد، الإلغاء، والحالة الحالية في رحلة واضحة.",
            icon: Users,
          },
          {
            title: "الاستقبال والتحكم بالدخول",
            desc: "QR للدخول، تتبع الحضور، ونقاط تعامل مناسبة للاستقبال والواجهة الأمامية.",
            icon: QrCode,
          },
          {
            title: "الموظفون والرواتب",
            desc: "ملفات الموظفين، الحضور، الإجازات، والعقود والرواتب ضمن نفس النظام.",
            icon: Wallet,
          },
          {
            title: "التدريب والخطط",
            desc: "خطط تمرين، أنظمة غذائية، حصص، ملاحظات، وتتبع تقدّم الأعضاء.",
            icon: Dumbbell,
          },
          {
            title: "المالية والمبيعات",
            desc: "اشتراكات، POS، تقارير مالية، مراقبة الإيراد والمصروف من مكان واحد.",
            icon: CreditCard,
          },
          {
            title: "التشغيل والدعم",
            desc: "محادثات، تذاكر دعم، إشعارات، سجل تدقيق، مخزون، ومفقودات.",
            icon: LifeBuoy,
          },
        ],
        rolesLabel: "مبني حول الأدوار",
        rolesTitle: "كل شخص يرى النظام بطريقته",
        rolesBody:
          "الإداري لا يحتاج نفس الشاشة التي يحتاجها المدرب أو موظف الاستقبال أو العضو. لهذا النظام مقسوم فعلياً على أدوار تشغيلية، وليس مجرد صلاحيات سطحية.",
        roles: [
          "الإدارة ولوحة التحكم",
          "المدرب والخطط والمتابعة",
          "الاستقبال والواجهة الأمامية",
          "الكاشير ونقطة البيع",
          "الموظفون والحضور والإجازات",
          "العضو والخدمة الذاتية",
        ],
        flowLabel: "كيف يعمل",
        flowTitle: "رحلة تشغيل يومية مترابطة",
        flowBody:
          "القيمة الحقيقية هنا ليست في شاشة واحدة. القيمة في أن كل خطوة تقود إلى الخطوة التالية بدون فوضى أو نقل يدوي بين أنظمة منفصلة.",
        flowSteps: [
          {
            title: "تسجيل العضو",
            desc: "إضافة عضو جديد وربط الاشتراك والبيانات الأساسية بسرعة.",
          },
          {
            title: "تفعيل الوصول",
            desc: "توليد QR وربط الدخول الفعلي بالحالة الفعلية للاشتراك.",
          },
          {
            title: "تشغيل النادي يومياً",
            desc: "حصص، استقبال، حضور، بيع مباشر، ومتابعة الفرق التشغيلية.",
          },
          {
            title: "المتابعة والتقارير",
            desc: "خطط، تقدّم، ملاحظات، إيرادات، وسجل واضح لما يحدث داخل النظام.",
          },
        ],
        aboutLabel: "حول OmniGYM",
        aboutTitle: "برنامج إدارة فقط؟ لا. غرفة التحكم كلها.",
        aboutBody:
          "إذا كان الهدف مجرد عرض مزايا منفصلة، فالصفحة القديمة كانت كافية. لكن إذا أردنا أن نعكس حقيقة هذا المنتج، فيجب أن نقول بوضوح إنه نظام تشغيل كامل للنادي: للأفراد، والعمليات، والمال، والتجربة اليومية.",
        aboutPoints: [
          {
            title: "منظومة واحدة",
            desc: "بدلاً من أدوات منفصلة للاشتراكات، الرواتب، التدريب، والدعم.",
            icon: ShieldCheck,
          },
          {
            title: "وضوح إداري",
            desc: "تحليلات، تدقيق، ونقاط متابعة تجعل الإدارة ترى الصورة كاملة.",
            icon: BarChart3,
          },
          {
            title: "تجربة حية",
            desc: "العضو، المدرب، والاستقبال كلهم جزء من نفس الرحلة التشغيلية.",
            icon: MessageSquare,
          },
        ],
        metrics: [
          { value: "متعدد الأدوار", label: "للإدارة، المدربين، الاستقبال، الكاشير، والعضو" },
          { value: "تشغيل مترابط", label: "الدخول والاشتراكات والحصص والمالية تعمل معاً" },
          { value: "رؤية أوضح", label: "تقارير ومتابعة وتدقيق من داخل نفس المنصة" },
        ],
        footerText: "© 2026 أنظمة OmniGYM. برمجيات تشغيلية قوية للأندية.",
      }
    : {
        brandName: "OmniGYM",
        navFeatures: "Platform",
        navAbout: "About",
        navFlow: "Workflow",
        signInLabel: "Sign In",
        badge: "Integrated operating system for modern gyms",
        heroTitle1: "Run Your Gym",
        heroTitle2: "As One System",
        heroSubtitle:
          "OmniGYM is more than memberships and check-ins. It is a full gym ERP connecting members, staff, access, classes, coaching, finance, and support in one platform.",
        heroPrimary: "Get Started",
        heroSecondary: "Explore Platform",
        storyLabel: "Built for real operations",
        storyTitle: "One platform for members, staff, coaching, and finance",
        storyBody:
          "From member registration and front desk flow to classes, payroll, point of sale, support, and reporting, OmniGYM keeps daily gym operations connected in one platform.",
        platformTitle: "What the system actually covers",
        platformBody:
          "From registration and front desk flow to payroll, reporting, and member coaching, each area is built to work with the others instead of living as a separate tool.",
        modules: [
          {
            title: "Members & Subscriptions",
            desc: "Registrations, renewals, freezes, cancellations, and member lifecycle management in one flow.",
            icon: Users,
          },
          {
            title: "Front Desk & Access",
            desc: "QR entry, attendance tracking, and reception-friendly control over daily check-ins.",
            icon: QrCode,
          },
          {
            title: "Staff & Payroll",
            desc: "Employee records, attendance, leave workflows, contracts, and payroll under the same roof.",
            icon: Wallet,
          },
          {
            title: "Coaching & Programs",
            desc: "Workout plans, diets, classes, feedback loops, and member progress tracking.",
            icon: Dumbbell,
          },
          {
            title: "Finance & Sales",
            desc: "Subscriptions, POS, financial reporting, revenue visibility, and expense tracking from one place.",
            icon: CreditCard,
          },
          {
            title: "Operations & Support",
            desc: "Chat, support tickets, notifications, audit logs, inventory, and lost-and-found workflows.",
            icon: LifeBuoy,
          },
        ],
        rolesLabel: "Role-shaped by design",
        rolesTitle: "Each team sees the system through its own lens",
        rolesBody:
          "An admin should not work through the same screen as a coach, cashier, front desk agent, or member. The product already understands that, and the landing page should say so.",
        roles: [
          "Admin oversight and control",
          "Coach planning and follow-up",
          "Reception and front desk operations",
          "Cashier and point-of-sale flow",
          "Staff attendance and leave handling",
          "Member self-service experience",
        ],
        flowLabel: "How it works",
        flowTitle: "A daily workflow, not a pile of features",
        flowBody:
          "The real value is not any single module. It is the handoff between them, where registration, access, coaching, support, and reporting all connect without spreadsheet chaos.",
        flowSteps: [
          {
            title: "Register the member",
            desc: "Create the profile, assign the subscription, and capture the operational basics.",
          },
          {
            title: "Activate real access",
            desc: "Generate QR-based entry tied to subscription status and attendance records.",
          },
          {
            title: "Run daily operations",
            desc: "Handle classes, reception work, staff activity, POS, and member-facing interactions.",
          },
          {
            title: "Track and improve",
            desc: "Review plans, progress, revenue, support history, and a clean audit trail.",
          },
        ],
        aboutLabel: "About OmniGYM",
        aboutTitle: "Not just management software. The control room.",
        aboutBody:
          "If the goal were only to list isolated features, the old page was enough. But if we want the page to reflect the real product, it needs to say this clearly: OmniGYM is a gym operating system for people, operations, money, and day-to-day service.",
        aboutPoints: [
          {
            title: "One operating layer",
            desc: "Instead of separate tools for subscriptions, payroll, coaching, and support.",
            icon: ShieldPlus,
          },
          {
            title: "Operational clarity",
            desc: "Analytics, audit visibility, and control points that help management see the whole picture.",
            icon: BarChart3,
          },
          {
            title: "A living product",
            desc: "Members, coaches, and front desk teams are all part of the same operational journey.",
            icon: MessageSquare,
          },
        ],
        metrics: [
          { value: "Multi-role", label: "Built for admins, coaches, reception, cashiers, and members" },
          { value: "Connected", label: "Access, subscriptions, classes, finance, and support work together" },
          { value: "Clear", label: "See operations, revenue, attendance, and history from one system" },
        ],
        footerText: "© 2026 OmniGYM Systems. Industrial-strength software for gym operations.",
      };

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-9 w-9 rounded-md object-cover" priority />
            <span className="font-serif text-lg font-bold tracking-tight text-foreground">
              {txt.brandName}
            </span>
          </div>
          <nav className="hidden items-center gap-8 md:flex">
            <Link href="#platform" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              {txt.navFeatures}
            </Link>
            <Link href="#workflow" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              {txt.navFlow}
            </Link>
            <Link href="#about" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              {txt.navAbout}
            </Link>
            <LanguageToggle />
            <ThemeToggle />
          </nav>
          <Link href="/login" className="btn-primary rounded-md px-5 py-2 text-sm">
            {txt.signInLabel}
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-border bg-background py-24 sm:py-32">
          <div className="absolute inset-0 opacity-80">
            <div className="absolute inset-x-0 top-0 h-64 bg-linear-to-b from-primary/10 via-primary/5 to-transparent" />
            <div className="absolute left-0 top-16 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute right-0 top-24 h-56 w-56 rounded-full bg-orange-500/10 blur-3xl" />
          </div>
          <div className="container relative z-10 mx-auto px-6">
            <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="max-w-3xl">
                <div className="mb-8 inline-flex items-center gap-2 rounded-md border border-border bg-muted/40 px-4 py-1.5">
                  <Sparkles size={14} className="text-primary" />
                  <span className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">
                    {txt.badge}
                  </span>
                </div>
                <h1
                  className={`mb-6 font-serif font-bold leading-tight tracking-tight text-foreground ${
                    isArabic ? "text-4xl sm:text-6xl" : "text-4xl sm:text-5xl lg:text-[3.35rem]"
                  }`}
                >
                  {txt.heroTitle1}
                  <br />
                  <span className="text-primary">{txt.heroTitle2}</span>
                </h1>
                <p className={`mb-10 max-w-2xl leading-relaxed text-muted-foreground ${isArabic ? "text-lg" : "text-base sm:text-lg"}`}>
                  {txt.heroSubtitle}
                </p>
                <div className="flex flex-col gap-4 sm:flex-row">
                  <Link href="/login" className="btn-primary rounded-md px-8 py-3 text-base">
                    {txt.heroPrimary} <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="#platform"
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-8 py-3 text-base font-semibold text-foreground transition-colors hover:bg-muted/30"
                  >
                    {txt.heroSecondary}
                  </Link>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
                  <p className="section-chip">{txt.storyLabel}</p>
                  <h2 className={`mt-4 font-serif font-bold text-foreground ${isArabic ? "text-2xl" : "text-[1.9rem] leading-tight"}`}>
                    {txt.storyTitle}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {txt.storyBody}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  {txt.metrics.map((metric) => (
                    <div key={metric.label} className="rounded-lg border border-border bg-card p-5">
                      <div
                        className={`font-extrabold text-primary ${
                          isArabic
                            ? "font-mono text-3xl"
                            : "font-sans text-xl leading-tight tracking-tight sm:text-2xl"
                        }`}
                      >
                        {metric.value}
                      </div>
                      <p className={`mt-3 leading-relaxed text-muted-foreground ${isArabic ? "text-sm" : "text-[0.95rem]"}`}>
                        {metric.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="platform" className="border-b border-border bg-card py-24">
          <div className="container mx-auto px-6">
            <div className="mx-auto mb-16 max-w-2xl text-center">
              <p className="section-chip">{txt.navFeatures}</p>
              <h2 className="mt-4 font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {txt.platformTitle}
              </h2>
              <p className="mt-4 text-muted-foreground">
                {txt.platformBody}
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {txt.modules.map((module) => (
                <div
                  key={module.title}
                  className="group rounded-lg border border-border bg-background p-6 transition-colors hover:border-primary"
                >
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-border bg-muted/30 text-primary">
                    <module.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 font-serif text-lg font-bold text-foreground">{module.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{module.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-background py-24">
          <div className="container mx-auto px-6">
            <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
              <div className="max-w-xl">
                <p className="section-chip">{txt.rolesLabel}</p>
                <h2 className="mt-4 font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  {txt.rolesTitle}
                </h2>
                <p className="mt-4 text-muted-foreground">
                  {txt.rolesBody}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {txt.roles.map((role) => (
                  <div key={role} className="rounded-lg border border-border bg-card p-5">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
                      <Users className="h-5 w-5" />
                    </div>
                    <p className="font-medium text-foreground">{role}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" className="border-b border-border bg-card py-24">
          <div className="container mx-auto px-6">
            <div className="mx-auto mb-16 max-w-2xl text-center">
              <p className="section-chip">{txt.flowLabel}</p>
              <h2 className="mt-4 font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {txt.flowTitle}
              </h2>
              <p className="mt-4 text-muted-foreground">
                {txt.flowBody}
              </p>
            </div>
            <div className="grid gap-6 lg:grid-cols-4">
              {txt.flowSteps.map((step, index) => (
                <div key={step.title} className="rounded-lg border border-border bg-background p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted/40 font-mono text-sm font-bold text-primary">
                      0{index + 1}
                    </div>
                    {index === 0 && <ClipboardList className="h-5 w-5 text-muted-foreground" />}
                    {index === 1 && <ShieldCheck className="h-5 w-5 text-muted-foreground" />}
                    {index === 2 && <Store className="h-5 w-5 text-muted-foreground" />}
                    {index === 3 && <BarChart3 className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <h3 className="mb-2 font-serif text-lg font-bold text-foreground">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="about" className="py-24">
          <div className="container mx-auto px-6">
            <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
              <div>
                <p className="section-chip">{txt.aboutLabel}</p>
                <h2 className="mt-4 max-w-2xl font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  {txt.aboutTitle}
                </h2>
                <p className="mt-4 max-w-2xl text-muted-foreground">
                  {txt.aboutBody}
                </p>
                <div className="mt-8">
                  <Link href="/login" className="btn-primary rounded-md px-8 py-3 text-base">
                    {txt.signInLabel} <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
              <div className="grid gap-4">
                {txt.aboutPoints.map((point) => (
                  <div key={point.title} className="rounded-lg border border-border bg-card p-6">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-border bg-muted/30 text-primary">
                      <point.icon className="h-6 w-6" />
                    </div>
                    <h3 className="font-serif text-lg font-bold text-foreground">{point.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{point.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-background py-10">
        <div className="container mx-auto px-6 text-center font-mono text-sm text-muted-foreground">
          <p>{txt.footerText}</p>
        </div>
      </footer>
    </div>
  );
}
