import Link from "next/link";
import { ArrowRight, Dumbbell, ShieldCheck, Users } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-gray-950">
      <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-950/80">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2 text-xl font-bold text-indigo-600 dark:text-indigo-400">
            <Dumbbell className="h-6 w-6" />
            <span>GymERP</span>
          </div>
          <nav className="hidden md:flex gap-6">
            <Link href="#features" className="text-sm font-medium text-gray-600 hover:text-indigo-600 dark:text-gray-300 dark:hover:text-indigo-400">
              Features
            </Link>
            <Link href="#pricing" className="text-sm font-medium text-gray-600 hover:text-indigo-600 dark:text-gray-300 dark:hover:text-indigo-400">
              Pricing
            </Link>
            <Link href="#about" className="text-sm font-medium text-gray-600 hover:text-indigo-600 dark:text-gray-300 dark:hover:text-indigo-400">
              About
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/login" className="rounded-full bg-indigo-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900">
              Sign In
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-24 sm:py-32">
          <div className="container mx-auto px-4 text-center">
            <h1 className="mb-6 text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-6xl">
              Manage Your Gym <br />
              <span className="text-indigo-600 dark:text-indigo-400">Like a Pro</span>
            </h1>
            <p className="mb-10 mx-auto max-w-2xl text-lg text-gray-600 dark:text-gray-300">
              Top-tier gym management software. Streamline memberships, track attendance, and automate payroll with our all-in-one ERP solution.
            </p>
            <div className="flex justify-center gap-4">
              <Link href="/login" className="flex items-center gap-2 rounded-full bg-indigo-600 px-8 py-3 text-base font-semibold text-white transition-transform hover:scale-105 hover:bg-indigo-700">
                Get Started <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="#demo" className="rounded-full border border-gray-300 bg-transparent px-8 py-3 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                Live Demo
              </Link>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="bg-gray-50 py-24 dark:bg-gray-900">
          <div className="container mx-auto px-4">
            <div className="mb-16 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                Everything you need to run your fitness center
              </h2>
            </div>
            <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col items-center text-center">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                  <Users className="h-8 w-8" />
                </div>
                <h3 className="mb-3 text-xl font-bold text-gray-900 dark:text-white">Member Management</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Easily track subscriptions, profiles, and access rights. Keep your member database organized and secure.
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                  <ShieldCheck className="h-8 w-8" />
                </div>
                <h3 className="mb-3 text-xl font-bold text-gray-900 dark:text-white">Access Control</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Secure QR-code based entry system. Monitor check-ins and check-outs in real-time.
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                  <Dumbbell className="h-8 w-8" />
                </div>
                <h3 className="mb-3 text-xl font-bold text-gray-900 dark:text-white">Payroll & HR</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Automated salary calculations including overtime. Manage employee contracts seamlessly.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-white py-12 dark:border-gray-800 dark:bg-gray-950">
        <div className="container mx-auto px-4 text-center text-gray-500 dark:text-gray-400">
          <p>&copy; 2026 Gym ERP Systems. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
