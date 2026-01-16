import React, { useEffect, useState } from 'react';
import { IonPage, IonContent } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader';

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
    <IonPage>
      <IonContent fullscreen>
        <div className="app-layout">
          <AppHeader />
          <div className="app-screen">
            {!ready && (
              <p className="text-sm text-slate-400">
                Open the reset link from your email to continue.
              </p>
            )}

            {ready && (
              <div className="app-card space-y-4 p-4">
                <label className="app-field">
                  <span className="app-label">New password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="app-input"
                  />
                </label>
                <label className="app-field">
                  <span className="app-label">Confirm password</span>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="app-input"
                  />
                </label>
                <button type="button" className="app-button app-button--block" onClick={handleUpdate}>
                  Update password
                </button>
              </div>
            )}

            {error && <p className="text-sm text-rose-400">{error}</p>}
            {message && <p className="text-sm text-emerald-400">{message}</p>}

            <button
              type="button"
              className="app-button app-button--ghost app-button--block"
              onClick={() => history.replace('/welcome')}
            >
              Back to sign in
            </button>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default ResetPassword;
