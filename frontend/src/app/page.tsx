import Link from "next/link";
import { ArrowRight, Dumbbell, ShieldCheck, Users, Zap, BarChart3, CreditCard } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: '#111111' }}>
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-[#111111]/90 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FF6B00, #FF8533)' }}>
              <Dumbbell className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">GymERP</span>
          </div>
          <nav className="hidden md:flex gap-8">
            <Link href="#features" className="text-sm text-[#6B6B6B] hover:text-white transition-colors">Features</Link>
            <Link href="#about" className="text-sm text-[#6B6B6B] hover:text-white transition-colors">About</Link>
          </nav>
          <Link href="/login" className="btn-primary text-sm px-5 py-2">
            Sign In
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden py-28 sm:py-36">
          {/* Subtle radial glow */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(255,107,0,0.08) 0%, transparent 70%)' }} />
          <div className="container mx-auto px-6 text-center relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 mb-8">
              <Zap size={14} className="text-[#FF6B00]" />
              <span className="text-xs font-medium text-[#A3A3A3]">Built for modern gyms</span>
            </div>
            <h1 className="mb-6 text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
              Run Your Gym<br />
              <span style={{ color: '#FF6B00' }}>Like a Machine</span>
            </h1>
            <p className="mb-10 mx-auto max-w-xl text-lg text-[#6B6B6B] leading-relaxed">
              Memberships. Payroll. Access control. Workout plans. One system, zero friction.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link href="/login" className="btn-primary px-8 py-3 text-base">
                Get Started <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="#features" className="btn-ghost px-8 py-3 text-base border border-white/10 rounded-xl">
                See Features
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-24" style={{ background: '#0a0a0a' }}>
          <div className="container mx-auto px-6">
            <div className="mb-16 text-center">
              <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                Everything under one roof
              </h2>
              <p className="mt-4 text-[#6B6B6B] max-w-lg mx-auto">
                Stop juggling spreadsheets. Manage your entire gym operation from a single dashboard.
              </p>
            </div>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { icon: Users, title: "Members & Subscriptions", desc: "Track memberships, renewals, and access rights. Freeze or cancel with one click." },
                { icon: ShieldCheck, title: "QR Access Control", desc: "Secure QR-code entry system with real-time monitoring. Works offline too." },
                { icon: CreditCard, title: "Payroll & Finance", desc: "Automated salary calculations with overtime and hybrid commission support." },
                { icon: Dumbbell, title: "Workout Plans", desc: "Create tailored workout programs. Assign to members. Track feedback." },
                { icon: BarChart3, title: "Live Analytics", desc: "Real-time headcount, revenue tracking, and attendance trends." },
                { icon: Zap, title: "Staff Management", desc: "Contracts, attendance, and performance — all in one place." }
              ].map((f, i) => (
                <div key={i} className="group p-6 rounded-2xl border border-white/5 bg-[#1a1a1a] hover:border-[rgba(255,107,0,0.25)] hover:shadow-[0_0_30px_rgba(255,107,0,0.08)] transition-all duration-300">
                  <div className="mb-5 h-12 w-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,107,0,0.12)' }}>
                    <f.icon className="h-6 w-6" style={{ color: '#FF6B00' }} />
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-white">{f.title}</h3>
                  <p className="text-sm text-[#6B6B6B] leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-10" style={{ background: '#0a0a0a' }}>
        <div className="container mx-auto px-6 text-center text-[#6B6B6B] text-sm">
          <p>&copy; 2026 Gym ERP Systems. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
