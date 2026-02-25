import Link from "next/link";
import { ArrowRight, Dumbbell, ShieldCheck, Users, Zap, BarChart3, CreditCard } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 bg-primary flex items-center justify-center rounded-md">
              <Dumbbell className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-foreground tracking-tight font-serif">GymERP</span>
          </div>
          <nav className="hidden md:flex gap-8 items-center">
            <Link href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</Link>
            <Link href="#about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">About</Link>
            <ThemeToggle />
          </nav>
          <Link href="/login" className="btn-primary text-sm px-5 py-2 rounded-md">
            Sign In
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative py-28 sm:py-36 border-b border-border bg-background">
          <div className="container mx-auto px-6 text-center relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 border border-border bg-muted/30 mb-8 rounded-md">
              <Zap size={14} className="text-primary" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-mono">Built for modern gyms</span>
            </div>
            <h1 className="mb-6 text-4xl sm:text-6xl font-bold tracking-tight text-foreground leading-tight font-serif">
              Run Your Gym<br />
              <span className="text-primary">Like a Machine</span>
            </h1>
            <p className="mb-10 mx-auto max-w-xl text-lg text-muted-foreground leading-relaxed">
              Memberships. Payroll. Access control. Workout plans. One system, zero friction.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link href="/login" className="btn-primary px-8 py-3 text-base rounded-md">
                Get Started <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="#features" className="inline-flex items-center justify-center gap-2 px-8 py-3 text-base border border-border text-foreground hover:bg-muted/30 transition-colors font-semibold rounded-md">
                See Features
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-24 bg-card">
          <div className="container mx-auto px-6">
            <div className="mb-16 text-center">
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight font-serif">
                Everything under one roof
              </h2>
              <p className="mt-4 text-muted-foreground max-w-lg mx-auto">
                Stop juggling spreadsheets. Manage your entire gym operation from a single dashboard.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { icon: Users, title: "Members & Subscriptions", desc: "Track memberships, renewals, and access rights. Freeze or cancel with one click." },
                { icon: ShieldCheck, title: "QR Access Control", desc: "Secure QR-code entry system with real-time monitoring. Works offline too." },
                { icon: CreditCard, title: "Payroll & Finance", desc: "Automated salary calculations with overtime and hybrid commission support." },
                { icon: Dumbbell, title: "Workout Plans", desc: "Create tailored workout programs. Assign to members. Track feedback." },
                { icon: BarChart3, title: "Live Analytics", desc: "Real-time headcount, revenue tracking, and attendance trends." },
                { icon: Zap, title: "Staff Management", desc: "Contracts, attendance, and performance — all in one place." }
              ].map((f, i) => (
                <div key={i} className="group p-6 border border-border bg-background hover:border-primary transition-colors rounded-md">
                  <div className="mb-5 h-12 w-12 flex items-center justify-center bg-muted/30 border border-border text-primary rounded-md">
                    <f.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-foreground font-serif">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-10 bg-background">
        <div className="container mx-auto px-6 text-center text-muted-foreground text-sm font-mono">
          <p>&copy; 2026 Gym ERP Systems. Industrial Strength Software.</p>
        </div>
      </footer>
    </div>
  );
}

