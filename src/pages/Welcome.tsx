import React, { useState } from 'react';
import { IonSpinner } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppShell from '../components/AppShell';

const Welcome: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [primaryCity, setPrimaryCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const history = useHistory();
  const { signIn, signUp, sendPasswordReset } = useAuth();

  const handleAuth = async () => {
    setLoading(true);
    setError('');

    try {
      if (!email || !password || (isSignUp && !username)) {
        setError('Please fill in all required fields');
        return;
      }

      if (isSignUp) {
        const { error: signUpError } = await signUp(email, password, {
          username,
          displayName,
          primaryCity,
        });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }
      } else {
        const { error: signInError } = await signIn(email, password);
        if (signInError) {
          setError(signInError.message);
          return;
        }
      }

      history.replace('/tabs/events');
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setLoading(true);
    setError('');
    setResetSent(false);

    try {
      const emailToSend = resetEmail || email;
      if (!emailToSend) {
        setError('Enter your email to reset password');
        return;
      }

      const { error: resetError } = await sendPasswordReset(emailToSend);
      if (resetError) {
        setError(resetError.message);
        return;
      }

      setResetSent(true);
    } catch (err) {
      setError('Could not send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
        <div className="relative min-h-full">
          <div className="mx-auto max-w-md text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">
              Your concert archive
            </p>
            <h1 className="mt-4 font-display text-4xl font-bold leading-tight text-white">
              Live Space
            </h1>
            <p className="mt-3 text-sm text-white/70">
              Keep what happened last night — and relive it when you want.
            </p>
          </div>

          <div className="mt-8 space-y-4 rounded-2xl bg-white/5 p-5">
            <h2 className="font-display text-base font-semibold text-white">
              {isSignUp ? 'Create Account' : 'Sign In'}
            </h2>
            <div className="space-y-3">
              {isSignUp && (
                <>
                  <label className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                      Username
                    </span>
                    <input
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="Choose a username"
                      className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                      Display name
                    </span>
                    <input
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="How should we call you?"
                      className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                      Primary city
                    </span>
                    <input
                      value={primaryCity}
                      onChange={e => setPrimaryCity(e.target.value)}
                      placeholder="Barcelona"
                      className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                    />
                  </label>
                </>
              )}

              <label className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                  Email
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                      Password
                    </span>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                    />
                  </label>
                </div>

                {error && <p className="text-sm text-rose-400">{error}</p>}

                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleAuth}
                  disabled={loading || !email || !password || (isSignUp && !username)}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <IonSpinner name="crescent" />
                      Loading...
                    </span>
                  ) : isSignUp ? (
                    'Sign Up'
                  ) : (
                    'Sign In'
                  )}
                </button>

                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center px-4 py-2 text-sm font-semibold text-white/70 transition hover:text-white"
                  onClick={() => setIsSignUp(!isSignUp)}
                >
                  {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                </button>

                {!isSignUp && (
                  <button
                    type="button"
                    className="inline-flex w-full items-center justify-center px-4 py-2 text-sm font-semibold text-white/70 transition hover:text-white"
                    onClick={() => setShowReset(prev => !prev)}
                  >
                    Forgot your password?
                  </button>
                )}

                {showReset && (
                  <div className="space-y-3 rounded-2xl bg-white/5 p-4">
                    <label className="flex flex-col gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                        Reset email
                      </span>
                      <input
                        type="email"
                        value={resetEmail || email}
                        onChange={e => setResetEmail(e.target.value)}
                        placeholder="you@email.com"
                        className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                      />
                    </label>
                    <button
                      type="button"
                      className="inline-flex w-full items-center justify-center rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handlePasswordReset}
                      disabled={loading}
                    >
                      Send reset link
                    </button>
                    {resetSent && (
                      <p className="text-sm text-emerald-400">Check your inbox for the reset link.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
        </div>
    </AppShell>
  );
};

export default Welcome;
