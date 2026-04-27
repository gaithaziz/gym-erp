'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api } from '@/lib/api';
import { useLocale } from '@/context/LocaleContext';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordShell token="" loadingState />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(token ? '' : t('login.tokenMissing'));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError(t('login.passwordsNoMatch'));
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await api.post('/auth/password-reset/confirm', {
        token,
        new_password: newPassword,
      });
      setMessage(t('login.resetSuccess'));
      setNewPassword('');
      setConfirmPassword('');
    } catch (caught: unknown) {
      const axiosErr = caught as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail || t('login.resetFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResetPasswordShell
      token={token}
      error={error}
      message={message}
      loadingState={loading}
      newPassword={newPassword}
      confirmPassword={confirmPassword}
      onNewPasswordChange={setNewPassword}
      onConfirmPasswordChange={setConfirmPassword}
      onSubmit={handleSubmit}
    />
  );
}

type ResetPasswordShellProps = {
  token: string;
  error?: string;
  message?: string;
  loadingState?: boolean;
  newPassword?: string;
  confirmPassword?: string;
  onNewPasswordChange?: (value: string) => void;
  onConfirmPasswordChange?: (value: string) => void;
  onSubmit?: (event: React.FormEvent) => Promise<void>;
};

function ResetPasswordShell({
  token,
  error,
  message,
  loadingState,
  newPassword,
  confirmPassword,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
}: ResetPasswordShellProps) {
  const { t } = useLocale();
  const loading = Boolean(loadingState);
  const showError = error || (token ? '' : t('login.tokenMissing'));

  return (
    <div className="relative min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8 overflow-hidden flex items-center">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -top-20 -left-16 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-20 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:44px_44px]" />
      </div>

      <div className="mx-auto w-full max-w-lg relative z-10">
        <div className="rounded-md border border-border bg-card p-8 shadow-lg relative overflow-hidden">
          <h1 className="text-2xl font-bold text-foreground font-serif">{t('login.resetTitle')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('login.resetSubtitle')}</p>

          {!token && (
            <div className="mt-6 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {showError}
            </div>
          )}

          <form className="mt-6 space-y-5" onSubmit={onSubmit}>
            {message && (
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                {message}
              </div>
            )}
            {showError && token && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {showError}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t('login.newPassword')}
              </label>
              <input
                type="password"
                required
                value={newPassword || ''}
                onChange={(event) => onNewPasswordChange?.(event.target.value)}
                className="input-dark rounded-md"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t('login.confirmPassword')}
              </label>
              <input
                type="password"
                required
                value={confirmPassword || ''}
                onChange={(event) => onConfirmPasswordChange?.(event.target.value)}
                className="input-dark rounded-md"
                autoComplete="new-password"
              />
            </div>

            <button type="submit" disabled={loading || !token} className="btn-primary w-full py-2.5 rounded-md">
              {loading ? t('login.resettingPassword') : t('login.resetPassword')}
            </button>
          </form>

          <div className="mt-4 flex justify-between items-center text-xs">
            <Link href="/login" className="text-primary hover:text-primary/80 transition-colors">
              {t('login.backToLogin')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
