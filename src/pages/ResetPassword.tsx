import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
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
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    const { error: updateError } = await updatePassword(password);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage('Contraseña actualizada. Ya puedes entrar.');
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
        {!ready && (
          <p className="text-sm text-white/70">
            Abre el enlace de recuperación de tu email para continuar.
          </p>
        )}

        {ready && (
          <div className="space-y-4 rounded-2xl bg-white/5 p-4">
            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                Nueva contraseña
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
                Confirma la contraseña
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
              Cambiar contraseña
            </button>
          </div>
        )}

        {error && <p className="text-sm text-rose-400">{error}</p>}
        {message && <p className="text-sm text-emerald-400">{message}</p>}

        <button
          type="button"
          className="inline-flex w-full items-center justify-center px-4 py-2 text-sm font-semibold text-white/70 transition hover:text-white"
          onClick={() => navigate('/welcome', { replace: true })}
        >
          Volver a entrar
        </button>
      </div>
    </AppShell>
  );
};

export default ResetPassword;
