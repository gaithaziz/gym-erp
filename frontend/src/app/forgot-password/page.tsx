'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Mail } from 'lucide-react';
import { api } from '@/lib/api';
import { useLocale } from '@/context/LocaleContext';

export default function ForgotPasswordPage() {
  const { t, direction } = useLocale();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    kind: 'success' | 'warning';
    title: string;
    body: string;
  } | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setStatus(null);

    try {
      const response = await api.post('/auth/password-reset/request', { email });
      const accountFound = Boolean(response.data?.data?.account_found);
      setStatus(
        accountFound
          ? {
              kind: 'success',
              title: t('login.resetLinkFoundTitle'),
              body: t('login.resetLinkFoundBody'),
            }
          : {
              kind: 'warning',
              title: t('login.resetLinkMissingTitle'),
              body: t('login.resetLinkMissingBody'),
            }
      );
    } catch (caught: unknown) {
      const axiosErr = caught as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail || t('login.resetFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8 overflow-hidden flex items-center">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -top-20 -left-16 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-20 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:44px_44px]" />
      </div>

      <div className="mx-auto w-full max-w-lg relative z-10">
        <div className="rounded-md border border-border bg-card p-8 shadow-lg relative overflow-hidden">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <Mail className="text-primary" size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-foreground font-serif">{t('login.requestResetTitle')}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{t('login.requestResetSubtitle')}</p>
            </div>
          </div>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            {status && (
              <div
                className={`rounded-md border p-4 text-sm ${
                  status.kind === 'success'
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                }`}
              >
                <div
                  className={`flex items-start gap-3 ${direction === 'rtl' ? 'flex-row-reverse text-right' : 'text-left'}`}
                >
                  <div className="mt-0.5 shrink-0">
                    {status.kind === 'success' ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <AlertTriangle size={18} />
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold">{status.title}</p>
                    <p className="leading-6">{status.body}</p>
                  </div>
                </div>
              </div>
            )}
            {error && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t('login.email')}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="input-dark rounded-md"
                placeholder="name@example.com"
                autoComplete="email"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 rounded-md">
              {loading ? t('login.authenticating') : t('login.sendResetLink')}
            </button>
          </form>

          <div className={`mt-4 flex items-center justify-between text-xs ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
            <Link href="/login" className="text-primary hover:text-primary/80 transition-colors">
              {t('login.backToLogin')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
