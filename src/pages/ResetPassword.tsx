import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { useHistory } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const ResetPassword: React.FC = () => {
  const history = useHistory();
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const initRecovery = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }

      const { data } = await supabase.auth.getSession();
      setReady(Boolean(data.session));
    };

    initRecovery();
  }, []);

  const handleUpdate = async () => {
    setError('');
    setMessage('');

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    const { error: updateError } = await updatePassword(password);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage('Password updated. You can sign in now.');
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
        {!ready && (
          <p className="text-sm text-white/70">
            Open the reset link from your email to continue.
          </p>
        )}

        {ready && (
          <div className="space-y-4 rounded-2xl bg-white/5 p-4">
            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                New password
              </span>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                Confirm password
              </span>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
              />
            </label>
            <button
              type="button"
              className="inline-flex w-full items-center justify-center rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
              onClick={handleUpdate}
            >
              Update password
            </button>
          </div>
        )}

        {error && <p className="text-sm text-rose-400">{error}</p>}
        {message && <p className="text-sm text-emerald-400">{message}</p>}

        <button
          type="button"
          className="inline-flex w-full items-center justify-center px-4 py-2 text-sm font-semibold text-white/70 transition hover:text-white"
          onClick={() => history.replace('/welcome')}
        >
          Back to sign in
        </button>
      </div>
    </AppShell>
  );
};

export default ResetPassword;
